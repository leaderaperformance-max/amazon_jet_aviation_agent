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
  if (!message || !message.content) {
    console.warn(`[webhook] SKIP: no message or empty content`)
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

  // Upsert contact (always)
  const { contact, wasNew } = await upsertContact({
    inbox_id: inbox.id,
    chatwoot_conversation_id: conversationId,
    chatwoot_contact_id: message.sender?.id ?? null,
    name: senderName ?? null,
    phone_number: senderPhone ?? null,
    whatsapp_identifier: senderIdent ?? null,
    current_labels: labels,
    last_message: message.content,
    last_message_at: new Date().toISOString(),
  })

  // Save to memory: Contact and User both stored
  const isHuman = message.sender_type === 'User'
  const isContact = message.sender_type === 'Contact'
  if (isContact) {
    await saveMessage(sessionId, 'user', message.content)
  } else if (isHuman) {
    await saveMessage(sessionId, 'user', `[atendente]: ${message.content}`)
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
  }

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    message.content,
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
