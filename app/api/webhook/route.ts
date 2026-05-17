import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'

interface ChatwootSender {
  identifier?: string
  phone_number?: string | null
}

interface ChatwootMessage {
  id?: number
  content?: string | null
  message_type?: number
  conversation_id?: number
  sender?: ChatwootSender
}

interface ChatwootWebhookPayload {
  // Some events wrap data in `body`, others put it at root.
  body?: ChatwootWebhookPayload
  id?: number
  inbox_id?: number
  messages?: ChatwootMessage[]
  meta?: { sender?: ChatwootSender }
}

function extractChatId(identifier: string | undefined, phoneNumber: string | null | undefined): string | null {
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
  const raw: ChatwootWebhookPayload = await req.json()
  // Unwrap if Chatwoot put data under `body` (automation events do this in some setups).
  const data: ChatwootWebhookPayload = raw.body ?? raw

  console.log(`[webhook] RAW: ${JSON.stringify(raw).slice(0, 1200)}`)

  const chatwootInboxId = data.inbox_id
  if (!chatwootInboxId) {
    console.warn(`[webhook] SKIP: no inbox_id at root or body`)
    return NextResponse.json({ ok: true })
  }

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox) {
    console.warn(`[webhook] SKIP: inbox ${chatwootInboxId} not found in DB`)
    return NextResponse.json({ ok: true })
  }
  if (!inbox.enabled) {
    console.warn(`[webhook] SKIP: inbox ${chatwootInboxId} disabled`)
    return NextResponse.json({ ok: true })
  }

  const message = data.messages?.[0]
  if (!message) {
    console.warn(`[webhook] SKIP: no messages[0]`)
    return NextResponse.json({ ok: true })
  }
  if (message.message_type === 1) {
    console.warn(`[webhook] SKIP: outgoing message (message_type=1)`)
    return NextResponse.json({ ok: true })
  }
  if (!message.content) {
    console.warn(`[webhook] SKIP: empty content`)
    return NextResponse.json({ ok: true })
  }

  // Sender info can be in either meta.sender (automation events) or messages[0].sender
  const senderIdentifier = data.meta?.sender?.identifier ?? message.sender?.identifier
  const senderPhone = data.meta?.sender?.phone_number ?? message.sender?.phone_number
  const sessionId = senderIdentifier
  const chatId = extractChatId(senderIdentifier, senderPhone)

  if (!sessionId) {
    console.warn(`[webhook] SKIP: no sender identifier`)
    return NextResponse.json({ ok: true })
  }
  if (!chatId) {
    console.warn(`[webhook] SKIP: cannot extract chatId from identifier="${senderIdentifier}" phone="${senderPhone}"`)
    return NextResponse.json({ ok: true })
  }

  const conversationId = data.id ?? message.conversation_id
  if (!conversationId) {
    console.warn(`[webhook] SKIP: no conversation id`)
    return NextResponse.json({ ok: true })
  }

  if (!inbox.quepasa_host || !inbox.quepasa_token) {
    console.warn(`[webhook] SKIP: Inbox ${inbox.id} sem QuePasa configurado`)
    return NextResponse.json({ ok: true })
  }

  console.log(`[webhook] inbox=${inbox.id} chatwoot_inbox=${chatwootInboxId} sessionId=${sessionId} chatId=${chatId} contentLen=${message.content.length}`)

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    message.content,
    inbox.system_prompt,
    openai.apiKey,
    openai.model
  )

  console.log(`[webhook] replyLen=${reply.length} preview="${reply.slice(0, 80)}"`)

  await sendMessage(
    { host: inbox.quepasa_host, token: inbox.quepasa_token },
    chatId,
    reply
  )

  return NextResponse.json({ ok: true })
}
