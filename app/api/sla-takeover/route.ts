import { NextRequest, NextResponse } from 'next/server'
import { checkAndTakeover } from '@/lib/sla-takeover'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: { sessionId?: string; sinceAt?: string; conversationId?: number; chatwootInboxId?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const { sessionId, sinceAt, conversationId, chatwootInboxId } = body
  if (!sessionId || !sinceAt || !conversationId || !chatwootInboxId) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }
  const r = await checkAndTakeover({ sessionId, sinceAt, conversationId, chatwootInboxId })
  console.log(`[sla-takeover] ${sessionId} → ${r.action}${r.error ? ` (${r.error})` : ''}`)
  return NextResponse.json({ ok: true, ...r })
}
