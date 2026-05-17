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

  const chatwootInboxId = payload.body?.inbox_id
  if (!chatwootInboxId) return NextResponse.json({ ok: true })

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox || !inbox.enabled) return NextResponse.json({ ok: true })

  const message = payload.body?.messages?.[0]
  if (!message || message.message_type === 1 || !message.content) {
    return NextResponse.json({ ok: true })
  }

  const sessionId = payload.body?.meta?.sender?.identifier
  const chatId = extractChatId(sessionId, payload.body?.meta?.sender?.phone_number)
  if (!sessionId || !chatId) return NextResponse.json({ ok: true })

  if (!inbox.quepasa_host || !inbox.quepasa_token) {
    console.warn(`Inbox ${inbox.id} sem QuePasa configurado`)
    return NextResponse.json({ ok: true })
  }

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    message.content,
    inbox.system_prompt,
    openai.apiKey,
    openai.model
  )

  await sendMessage(
    { host: inbox.quepasa_host, token: inbox.quepasa_token },
    chatId,
    reply
  )

  return NextResponse.json({ ok: true })
}
