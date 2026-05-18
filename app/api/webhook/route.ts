import { NextRequest, NextResponse } from 'next/server'
import { tool } from 'ai'
import { z } from 'zod'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact, updateContactLabels } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel, removeLabel } from '@/lib/tags'
import { getAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_LABELS, SYSTEM_LABEL } from '@/lib/types'
import { processAttachment, type ChatwootAttachment } from '@/lib/media/process'
import { validatePartNumber } from '@/lib/part-number'
import { insertPending, hasNewerPending, drainPending } from '@/lib/debounce'
import { createLead } from '@/lib/leads'

interface ChatwootSender {
  id?: number
  identifier?: string
  name?: string
  phone_number?: string | null
  type?: string
}

interface ChatwootMessage {
  id?: number
  content?: string | null
  message_type?: number
  conversation_id?: number
  sender_type?: 'Contact' | 'User' | 'AgentBot'
  sender?: ChatwootSender
}

interface ChatwootConversation {
  id?: number
  labels?: string[]
}

interface RawPayload {
  body?: RawPayload
  id?: number
  inbox_id?: number
  messages?: ChatwootMessage[]
  conversation?: ChatwootConversation
  labels?: string[]
  meta?: { sender?: ChatwootSender }
}

function extractChatId(identifier?: string, phoneNumber?: string | null): string | null {
  if (identifier) {
    const digits = identifier.split('@')[0].replace(/\D/g, '')
    if (digits) return digits
  }
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits) return digits
  }
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw: RawPayload = await req.json()
  const data: RawPayload = raw.body ?? raw

  console.log(`[webhook] RAW: ${JSON.stringify(raw).slice(0, 800)}`)

  const chatwootInboxId = data.inbox_id
  if (!chatwootInboxId) {
    console.warn(`[webhook] SKIP: no inbox_id`)
    return NextResponse.json({ ok: true })
  }

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox || !inbox.enabled) {
    console.warn(`[webhook] SKIP: inbox not found or disabled`)
    return NextResponse.json({ ok: true })
  }

  const message = data.messages?.[0]
  if (!message) {
    console.warn(`[webhook] SKIP: no message`)
    return NextResponse.json({ ok: true })
  }

  // AgentBot is our own reply — already in our memory, ignore entirely
  if (message.sender_type === 'AgentBot') {
    console.log(`[webhook] SKIP: AgentBot (our own reply)`)
    return NextResponse.json({ ok: true })
  }

  // Dedup: Chatwoot may fire the same message_created event twice (inbox webhook + automation).
  // Use an atomic insert with unique constraint to ensure each message is processed once.
  if (message.id) {
    const supabaseAdmin = getAdminClient()
    const { error: dupErr } = await supabaseAdmin
      .from('processed_webhook_messages')
      .insert({ chatwoot_message_id: message.id })
    if (dupErr) {
      // 23505 = unique_violation in Postgres
      if ((dupErr as { code?: string }).code === '23505') {
        console.log(`[webhook] SKIP: duplicate message ${message.id}`)
        return NextResponse.json({ ok: true })
      }
      console.warn(`[webhook] dedup insert error (continuing):`, dupErr)
    }
  }

  const conversationId = data.id ?? message.conversation_id
  if (!conversationId) return NextResponse.json({ ok: true })

  const senderIdent = data.meta?.sender?.identifier ?? message.sender?.identifier
  const senderPhone = data.meta?.sender?.phone_number ?? message.sender?.phone_number
  const senderName = data.meta?.sender?.name ?? message.sender?.name
  const chatId = extractChatId(senderIdent, senderPhone)
  const sessionId = senderIdent

  if (!sessionId || !chatId) {
    console.warn(`[webhook] SKIP: cannot extract sessionId/chatId`)
    return NextResponse.json({ ok: true })
  }

  const labels = data.conversation?.labels ?? data.labels ?? []

  // Process attachments (audio/image/pdf) — enriches the content
  const attachments = ((message as unknown) as { attachments?: ChatwootAttachment[] }).attachments ?? []
  let enrichedContent = message.content ?? ''

  for (const att of attachments) {
    try {
      const processed = await processAttachment(att)
      if (processed) {
        enrichedContent = enrichedContent
          ? `${enrichedContent}\n\n${processed}`
          : processed
      }
    } catch (err) {
      console.warn('[webhook] attachment processing error:', err)
    }
  }

  if (!enrichedContent.trim()) {
    console.warn(`[webhook] SKIP: no usable content (no text and no processable attachment)`)
    return NextResponse.json({ ok: true })
  }

  const isHuman = message.sender_type === 'User'
  const isContact = message.sender_type === 'Contact'

  // Debounce: only for Contact messages
  if (isContact) {
    const inserted = await insertPending(sessionId, enrichedContent, message.id)
    console.log(`[debounce] inserted pending ${inserted.id} for session ${sessionId}`)

    // Wait 5s (configurable via DEBOUNCE_DELAY_MS env var, e.g. 0 for tests)
    const delayMs = parseInt(process.env.DEBOUNCE_DELAY_MS ?? '5000', 10)
    await new Promise(r => setTimeout(r, delayMs))

    // Check if newer message arrived
    const newer = await hasNewerPending(sessionId, inserted.received_at)
    if (newer) {
      console.log(`[debounce] newer message arrived, aborting`)
      return NextResponse.json({ ok: true })
    }

    // Drain all pending for this session
    const { combinedContent } = await drainPending(sessionId)
    if (!combinedContent.trim()) {
      console.warn(`[debounce] drained empty content`)
      return NextResponse.json({ ok: true })
    }

    // Replace enrichedContent with combined
    enrichedContent = combinedContent
  }

  // Upsert contact (always)
  const { contact, wasNew } = await upsertContact({
    inbox_id: inbox.id,
    chatwoot_conversation_id: conversationId,
    chatwoot_contact_id: message.sender?.id ?? null,
    name: senderName ?? null,
    phone_number: senderPhone ?? null,
    whatsapp_identifier: senderIdent ?? null,
    current_labels: labels,
    last_message: enrichedContent,
    last_message_at: new Date().toISOString(),
  })

  // Save to memory: Contact and User both stored
  if (isContact) {
    await saveMessage(sessionId, 'user', enrichedContent)
  } else if (isHuman) {
    await saveMessage(sessionId, 'user', `[atendente]: ${message.content ?? ''}`)
  }

  // Only Contact messages can trigger a reply
  if (!isContact) {
    console.log(`[webhook] DONE: ${message.sender_type} message saved to memory, no reply`)
    return NextResponse.json({ ok: true })
  }

  // Decide if bot should respond
  const hasAtendimentoIA = labels.includes(SYSTEM_LABEL)
  if (!hasAtendimentoIA && !wasNew) {
    console.log(`[webhook] handoff: humano assumiu conversation=${conversationId}`)
    return NextResponse.json({ ok: true })
  }

  if (!inbox.quepasa_host || !inbox.quepasa_token) {
    console.warn(`[webhook] Inbox ${inbox.id} sem QuePasa configurado`)
    return NextResponse.json({ ok: true })
  }

  console.log(`[webhook] processing inbox=${inbox.id} conv=${conversationId} wasNew=${wasNew} hasIA=${hasAtendimentoIA}`)

  // Build tools — close over labelsState to mutate as agent calls them
  let labelsState: string[] = [...labels]
  const chatwootCfg = {
    baseUrl: inbox.chatwoot_base_url,
    accountId: inbox.chatwoot_account_id,
    userToken: inbox.chatwoot_user_token,
  }

  const labelEnum = z.enum(BUSINESS_LABELS)

  const tools = {
    add_label: tool({
      description: 'Adiciona uma etiqueta de negócio à conversa atual.',
      inputSchema: z.object({ label: labelEnum }),
      execute: async ({ label }: { label: typeof BUSINESS_LABELS[number] }) => {
        labelsState = await addLabel(chatwootCfg, conversationId, labelsState, label)
        await updateContactLabels(contact.id, labelsState)
        return { ok: true, labels: labelsState }
      },
    }),
    remove_label: tool({
      description: 'Remove uma etiqueta de negócio da conversa atual.',
      inputSchema: z.object({ label: labelEnum }),
      execute: async ({ label }: { label: typeof BUSINESS_LABELS[number] }) => {
        labelsState = await removeLabel(chatwootCfg, conversationId, labelsState, label)
        await updateContactLabels(contact.id, labelsState)
        return { ok: true, labels: labelsState }
      },
    }),
    validate_part_number: tool({
      description: 'Valida se o texto é um Part Number aeronáutico legítimo. ' +
                   'Cobre MIL-SPEC (AN/MS/NAS/M-series), NSN, ATA e fabricantes ' +
                   '(Cessna, Garmin, Beechcraft, Piper, Honeywell, etc.). ' +
                   'Retorna formato, fabricante, confidence e PN normalizado.',
      inputSchema: z.object({
        candidate: z.string().describe('O texto fornecido pelo cliente, possível PN'),
      }),
      execute: async ({ candidate }: { candidate: string }) => {
        const result = await validatePartNumber(candidate)
        console.log(`[validate_pn] "${candidate}" → valid=${result.valid} format=${result.format}`)
        return result
      },
    }),
    envia_pn: tool({
      description: 'Envia lead qualificado (PN validado + quantidade + urgência) ao vendedor humano via WhatsApp. CHAME apenas quando tiver TODOS os dados qualificados.',
      inputSchema: z.object({
        part_number: z.string(),
        quantity: z.string(),
        urgency: z.enum(['AOG', 'rotina']),
        customer_name: z.string().optional(),
        customer_phone: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        // 1. Save lead
        const lead = await createLead({
          contact_id: contact.id,
          part_number: args.part_number,
          quantity: args.quantity,
          urgency: args.urgency,
          customer_name: args.customer_name ?? senderName ?? null,
          customer_phone: args.customer_phone ?? senderPhone ?? null,
          notes: args.notes ?? null,
        })

        // 2. Send WhatsApp to seller (if configured)
        const sellerPhone = (inbox as unknown as { seller_phone?: string | null }).seller_phone
        if (sellerPhone && inbox.quepasa_host && inbox.quepasa_token) {
          const chatwootUrl = `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${conversationId}`
          const urgencyEmoji = args.urgency === 'AOG' ? '🔴' : '🟡'
          const sellerMsg = [
            '🆕 *NOVO LEAD QUALIFICADO*',
            '',
            `👤 *Cliente:* ${args.customer_name ?? senderName ?? '(sem nome)'}`,
            `📱 *WhatsApp:* ${args.customer_phone ?? senderPhone ?? '(não informado)'}`,
            `🔧 *Part Number:* ${args.part_number}`,
            `🔢 *Quantidade:* ${args.quantity}`,
            `⚡ *Urgência:* ${args.urgency} ${urgencyEmoji}`,
            '',
            args.notes ? `📝 _${args.notes}_` : null,
            '',
            '🔗 Atender em:',
            chatwootUrl,
          ].filter(Boolean).join('\n')

          await sendMessage(
            { host: inbox.quepasa_host, token: inbox.quepasa_token },
            sellerPhone,
            sellerMsg
          )
        } else {
          console.warn(`[envia_pn] seller_phone or quepasa not configured for inbox ${inbox.id}`)
        }

        // 3. Add tag orcamento_enviado
        labelsState = await addLabel(chatwootCfg, conversationId, labelsState, 'orcamento_enviado')
        await updateContactLabels(contact.id, labelsState)

        return { ok: true, lead_id: lead.id }
      },
    }),
  }

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    enrichedContent,
    inbox.system_prompt,
    openai.apiKey,
    openai.model,
    tools,
    labelsState
  )

  console.log(`[webhook] replyLen=${reply.length}`)

  await sendMessage(
    { host: inbox.quepasa_host, token: inbox.quepasa_token },
    chatId,
    reply
  )

  // Auto-add atendimento_ia after first reply (if not already there)
  if (!hasAtendimentoIA) {
    labelsState = await addLabel(chatwootCfg, conversationId, labelsState, SYSTEM_LABEL)
    await updateContactLabels(contact.id, labelsState)
  }

  return NextResponse.json({ ok: true })
}
