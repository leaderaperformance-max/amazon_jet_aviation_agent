import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'

interface WebhookPayload {
  body?: {
    id?: number
    inbox_id?: number
    messages?: Array<{
      content?: string | null
      message_type?: number
    }>
    meta?: {
      sender?: { identifier?: string; phone_number?: string | null }
    }
  }
}

function extractChatId(identifier: string | undefined, phoneNumber: string | null | undefined): string | null {
  // QuePasa CHATID = WhatsApp number digits only.
  // identifier looks like "5593991565755@s.whatsapp.net" — strip suffix.
  // phone_number looks like "+5593991565755" — strip the plus.
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
  const payload: WebhookPayload = await req.json()

  // Log raw payload structure for debugging
  console.log(`[webhook] RAW payload: ${JSON.stringify(payload).slice(0, 1500)}`)

  const chatwootInboxId = payload.body?.inbox_id
  if (!chatwootInboxId) {
    console.warn(`[webhook] SKIP: no body.inbox_id`)
    return NextResponse.json({ ok: true })
  }

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox) {
    console.warn(`[webhook] SKIP: inbox ${chatwootInboxId} not found in DB`)
    return NextResponse.json({ ok: true })
  }
  if (!inbox.enabled) {
    console.warn(`[webhook] SKIP: inbox ${chatwootInboxId} is disabled`)
    return NextResponse.json({ ok: true })
  }

  const message = payload.body?.messages?.[0]
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

  const sessionId = payload.body?.meta?.sender?.identifier
  const chatId = extractChatId(sessionId, payload.body?.meta?.sender?.phone_number)
  if (!sessionId) {
    console.warn(`[webhook] SKIP: no sessionId (meta.sender.identifier missing)`)
    return NextResponse.json({ ok: true })
  }
  if (!chatId) {
    console.warn(`[webhook] SKIP: cannot extract chatId from identifier="${sessionId}" phone="${payload.body?.meta?.sender?.phone_number}"`)
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
