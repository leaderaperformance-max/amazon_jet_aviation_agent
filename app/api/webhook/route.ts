import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/chatwoot'
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
      sender?: { identifier?: string }
    }
  }
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
  const conversationId = payload.body?.id
  if (!sessionId || !conversationId) return NextResponse.json({ ok: true })

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    message.content,
    inbox.system_prompt,
    openai.apiKey,
    openai.model
  )

  await sendMessage(
    {
      baseUrl: inbox.chatwoot_base_url,
      accountId: inbox.chatwoot_account_id,
      userToken: inbox.chatwoot_user_token,
    },
    conversationId,
    reply
  )

  return NextResponse.json({ ok: true })
}
