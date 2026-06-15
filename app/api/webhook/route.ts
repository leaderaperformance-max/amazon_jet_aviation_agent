import { NextRequest, NextResponse } from 'next/server'
import { tool } from 'ai'
import { z } from 'zod'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { sendChatwootReply } from '@/lib/chatwoot-send'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact, updateContactLabels } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel, removeLabel } from '@/lib/tags'
import { getAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_LABELS, SYSTEM_LABEL } from '@/lib/types'
import { processAttachment, type ChatwootAttachment } from '@/lib/media/process'
import { validatePartNumber, extractPartNumbersFromText } from '@/lib/part-number'
import { insertPending, hasNewerPending, drainPending } from '@/lib/debounce'
import { createLead } from '@/lib/leads'
import { createPartsSheet } from '@/lib/google/sheets'

// Allow the function to run long enough for the debounce wait (até 40s)
// + processamento do agente. Máximo do plano Hobby do Vercel é 60s.
export const maxDuration = 60

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

  // Session: prefer the stable sender identifier (WhatsApp JID, email),
  // fall back to a per-conversation key (Website widget visitors often have
  // no identifier/phone at all until they provide email).
  const sessionId = senderIdent ?? `chatwoot-conv-${conversationId}`

  // chatId only matters for QuePasa (WhatsApp). For Website/email channels
  // we reply via Chatwoot API which uses conversationId — chatId can be empty.

  // Bot NUNCA responde em grupos do WhatsApp. Mensagens cujo identificador
  // do remetente contém "@g.us" são de grupo — só leitura, sem reply.
  if (sessionId.includes('@g.us') || (chatId && chatId.includes('@g.us'))) {
    console.log(`[webhook] SKIP: group message (no replies in groups) sessionId=${sessionId}`)
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

    // Debounce window: clientes mandam mensagens picadas ("oi" / "tudo bem" /
    // "quero cotação"). Esperamos pra juntar tudo antes de processar.
    // - Texto puro: janela longa (DEBOUNCE_DELAY_MS, default 40s)
    // - Com anexo (PDF/imagem/áudio): janela curta — anexo costuma ser um
    //   pedido completo, e o processamento do anexo já consome tempo do budget
    //   de 60s da função.
    const longDelay = parseInt(process.env.DEBOUNCE_DELAY_MS ?? '40000', 10)
    const shortDelay = parseInt(process.env.DEBOUNCE_DELAY_ATTACH_MS ?? '8000', 10)
    const delayMs = attachments.length > 0 ? shortDelay : longDelay
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

  // Determine outbound channel:
  // - QuePasa configured → WhatsApp (uses external gateway)
  // - Otherwise → reply back through Chatwoot API itself (works for Website
  //   widget, Email, API channel, etc.)
  const useQuepasa = !!(inbox.quepasa_host && inbox.quepasa_token)
  console.log(`[webhook] processing inbox=${inbox.id} conv=${conversationId} wasNew=${wasNew} hasIA=${hasAtendimentoIA} outbound=${useQuepasa ? 'quepasa' : 'chatwoot'}`)

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
                   '(Cessna, Garmin, Beechcraft, Piper, Honeywell, headsets Bose/Lightspeed/David Clark, etc.). ' +
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
    extract_part_numbers: tool({
      description: 'Extrai uma lista de Part Numbers candidatos de um blob de texto (útil quando cliente manda planilha, PDF ou lista com múltiplos PNs). Retorna array de candidatos com contexto e quantidade se identificável.',
      inputSchema: z.object({
        text: z.string().describe('O texto completo de onde extrair PNs (ex: conteúdo de planilha ou PDF)'),
      }),
      execute: async ({ text }: { text: string }) => {
        const result = await extractPartNumbersFromText(text)
        console.log(`[extract_pn] found ${result.length} candidates`)
        return { items: result }
      },
    }),
    envia_pn: tool({
      description: 'Envia lead qualificado ao vendedor humano. Aceita 1+ items (Part Number + quantidade). CHAME quando tiver todos os dados. Use general_notes pra incluir contexto adicional como modelo da aeronave (formato: "Aeronave: Cessna 172") ou outras informações estratégicas do SPIN.',
      inputSchema: z.object({
        items: z.array(z.object({
          part_number: z.string(),
          quantity: z.string(),
          notes: z.string().optional(),
        })).min(1),
        urgency: z.enum(['AOG', 'rotina']),
        general_notes: z.string().optional().describe('Contexto adicional: aeronave (ex. "Aeronave: Cessna 172"), urgência operacional, frequência de uso, etc.'),
      }),
      execute: async (args) => {
        const finalName = (senderName && senderName.trim()) || null
        const finalPhone = (senderPhone && senderPhone.trim()) || null

        console.log(`[envia_pn] firing with ${args.items.length} item(s) urg=${args.urgency} name=${finalName}`)

        // 1. Save each item as a separate lead row
        const leadIds: string[] = []
        for (const item of args.items) {
          const lead = await createLead({
            contact_id: contact.id,
            part_number: item.part_number,
            quantity: item.quantity,
            urgency: args.urgency,
            customer_name: finalName,
            customer_phone: finalPhone,
            notes: item.notes ?? args.general_notes ?? null,
          })
          leadIds.push(lead.id)
        }

        // 2. Create Google Sheet with all items in PartNumber,Quantity format.
        // Non-fatal: if it fails (e.g. quota or auth), we still notify the seller.
        let sheetUrl: string | null = null
        try {
          const sheet = await createPartsSheet({
            customerName: finalName,
            customerPhone: finalPhone,
            items: args.items.map(i => ({ part_number: i.part_number, quantity: i.quantity })),
            urgency: args.urgency,
          })
          sheetUrl = sheet.url
          console.log(`[envia_pn] sheet created: ${sheet.url}`)

          // Persist sheet_url on each lead row created above
          const admin = getAdminClient()
          await admin.from('leads').update({ sheet_url: sheetUrl }).in('id', leadIds)
        } catch (err) {
          const errMsg = (err as Error).message ?? String(err)
          console.warn(`[envia_pn] sheet creation failed (non-fatal): ${errMsg.slice(0, 500)}`)
          // Persist the error in lead notes for debugging
          try {
            const admin = getAdminClient()
            await admin.from('leads').update({ notes: `[sheet_error] ${errMsg.slice(0, 400)}` }).in('id', leadIds)
          } catch {}
        }

        // 3. Send WhatsApp to seller — uses QuePasa from THIS inbox if available,
        // otherwise falls back to ANY inbox that has QuePasa configured.
        // This way leads from the Website widget (no QuePasa) still notify the group.
        const sellerPhone = (inbox as unknown as { seller_phone?: string | null }).seller_phone
        let quepasaCfg: { host: string; token: string } | null = null
        if (inbox.quepasa_host && inbox.quepasa_token) {
          quepasaCfg = { host: inbox.quepasa_host, token: inbox.quepasa_token }
        } else {
          // Fallback: load any enabled inbox with QuePasa
          const admin = getAdminClient()
          const { data: gw } = await admin
            .from('inboxes')
            .select('quepasa_host, quepasa_token')
            .not('quepasa_host', 'is', null)
            .not('quepasa_token', 'is', null)
            .eq('enabled', true)
            .limit(1)
            .maybeSingle()
          if (gw?.quepasa_host && gw?.quepasa_token) {
            quepasaCfg = { host: gw.quepasa_host, token: gw.quepasa_token }
          }
        }

        // Detect channel label for the seller notification.
        // Pattern-match on inbox name to give a clean origin tag (Instagram,
        // Site, WhatsApp, etc) without needing a separate DB column.
        const channelLabel = (() => {
          if (inbox.quepasa_host) return 'WhatsApp'
          const lower = inbox.name.toLowerCase()
          const hasIG = lower.includes('instagram') || lower.includes('direct') || /\big\b/.test(lower)
          const hasMSG = lower.includes('messenger') || /\bmsg\b/.test(lower) || /\bfb\b/.test(lower) || lower.includes('facebook')
          if (hasIG && hasMSG) return `Instagram/Messenger (${inbox.name})`
          if (hasIG) return `Instagram (${inbox.name})`
          if (hasMSG) return `Messenger (${inbox.name})`
          if (lower.includes('site') || lower.includes('web') || lower.includes('widget')) {
            return `Site (${inbox.name})`
          }
          if (lower.includes('email') || lower.includes('mail')) {
            return `Email (${inbox.name})`
          }
          return inbox.name
        })()

        if (sellerPhone && quepasaCfg) {
          const chatwootUrl = `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${conversationId}`
          const urgencyEmoji = args.urgency === 'AOG' ? '🔴' : '🟡'

          const itemsBlock = args.items.length === 1
            ? `🔧 *Part Number:* ${args.items[0].part_number}\n🔢 *Quantidade:* ${args.items[0].quantity}${args.items[0].notes ? `\n📝 ${args.items[0].notes}` : ''}`
            : `📋 *ITENS (${args.items.length}):*\n` + args.items.map((it, i) => `  ${i + 1}. ${it.part_number} — Qtd: ${it.quantity}${it.notes ? ` (${it.notes})` : ''}`).join('\n')

          const sellerMsg = [
            '🆕 *NOVO LEAD QUALIFICADO*',
            '',
            `📡 *Origem:* ${channelLabel}`,
            `👤 *Cliente:* ${finalName ?? '(sem nome)'}`,
            finalPhone ? `📱 *WhatsApp:* ${finalPhone}` : null,
            `⚡ *Urgência:* ${args.urgency} ${urgencyEmoji}`,
            '',
            itemsBlock,
            '',
            args.general_notes ? `📝 _${args.general_notes}_` : null,
            sheetUrl ? `📊 *Planilha:* ${sheetUrl}` : null,
            '',
            '🔗 Atender em:',
            chatwootUrl,
          ].filter(Boolean).join('\n')

          await sendMessage(quepasaCfg, sellerPhone, sellerMsg)
        } else {
          console.warn(`[envia_pn] seller_phone or QuePasa fallback not available for inbox ${inbox.id}`)
        }

        // 4. Add tag orcamento_enviado
        labelsState = await addLabel(chatwootCfg, conversationId, labelsState, 'orcamento_enviado')
        await updateContactLabels(contact.id, labelsState)

        return { ok: true, lead_ids: leadIds, count: args.items.length, sheet_url: sheetUrl }
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

  if (useQuepasa) {
    if (!chatId) {
      console.warn(`[webhook] QuePasa precisa de chatId mas nenhum foi extraido — pulando reply`)
      return NextResponse.json({ ok: true })
    }
    await sendMessage(
      { host: inbox.quepasa_host!, token: inbox.quepasa_token! },
      chatId,
      reply
    )
  } else {
    // Website widget / Email / API channel — reply via Chatwoot API
    await sendChatwootReply(chatwootCfg, conversationId, reply)
  }

  // Auto-add atendimento_ia after first reply (if not already there)
  if (!hasAtendimentoIA) {
    labelsState = await addLabel(chatwootCfg, conversationId, labelsState, SYSTEM_LABEL)
    await updateContactLabels(contact.id, labelsState)
  }

  return NextResponse.json({ ok: true })
}
