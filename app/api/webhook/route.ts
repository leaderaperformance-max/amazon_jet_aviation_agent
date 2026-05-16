import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/chatwoot'
import type { ChatwootWebhookPayload } from '@/lib/types'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload: ChatwootWebhookPayload = await req.json()

  const message = payload.body?.messages?.[0]
  const conversationId = payload.body?.id
  const sessionId = payload.body?.meta?.sender?.identifier

  // Skip: outgoing messages (bot loop prevention) or empty content
  if (!message || message.message_type === 1 || !message.content) {
    return NextResponse.json({ ok: true })
  }

  const reply = await runAgent(sessionId, message.content)
  await sendMessage(conversationId, reply)

  return NextResponse.json({ ok: true })
}
