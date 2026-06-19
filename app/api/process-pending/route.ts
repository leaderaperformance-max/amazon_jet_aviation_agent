import { NextRequest, NextResponse } from 'next/server'
import { hasNewerPending, drainPending } from '@/lib/debounce'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { processIncomingMessage, type IncomingContext } from '@/lib/process-incoming'

/**
 * POST /api/process-pending?secret=CRON_SECRET
 *
 * Worker chamado pelo QStash depois do delay do debounce. Recebe
 * { sessionId, triggerAt }. Se chegou mensagem mais nova depois do triggerAt,
 * ignora (o callback dessa mensagem mais nova vai processar). Senão, drena
 * todas as pendentes da sessão e processa o conteúdo combinado.
 */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { sessionId?: string; triggerAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { sessionId, triggerAt } = body
  if (!sessionId || !triggerAt) {
    return NextResponse.json({ error: 'missing sessionId/triggerAt' }, { status: 400 })
  }

  // Se chegou mensagem mais nova depois desta, deixa o callback dela processar.
  const newer = await hasNewerPending(sessionId, triggerAt)
  if (newer) {
    console.log(`[process-pending] ${sessionId}: newer message exists, skipping`)
    return NextResponse.json({ ok: true, skipped: 'newer_exists' })
  }

  // Drena tudo da sessão
  const { combinedContent, context, ids } = await drainPending(sessionId)
  if (ids.length === 0 || !combinedContent.trim()) {
    console.log(`[process-pending] ${sessionId}: nothing to drain`)
    return NextResponse.json({ ok: true, skipped: 'empty' })
  }

  const ctx = context as IncomingContext | null
  if (!ctx?.chatwootInboxId) {
    console.warn(`[process-pending] ${sessionId}: missing context, cannot process`)
    return NextResponse.json({ ok: false, error: 'no context' })
  }

  const inbox = await loadInboxByChatwootId(ctx.chatwootInboxId)
  if (!inbox || !inbox.enabled) {
    console.warn(`[process-pending] ${sessionId}: inbox ${ctx.chatwootInboxId} not found/disabled`)
    return NextResponse.json({ ok: false, error: 'inbox unavailable' })
  }

  try {
    await processIncomingMessage(inbox, ctx, combinedContent)
    console.log(`[process-pending] ${sessionId}: processed ${ids.length} message(s)`)
    return NextResponse.json({ ok: true, processed: ids.length })
  } catch (err) {
    console.error(`[process-pending] ${sessionId} error:`, err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
