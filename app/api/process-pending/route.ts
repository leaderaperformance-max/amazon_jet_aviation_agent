import { NextRequest, NextResponse } from 'next/server'
import { hasNewerPending, hasInFlightPending, completePending, releasePending } from '@/lib/debounce'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { processIncomingMessage, drainAndBuildContent } from '@/lib/process-incoming'

/**
 * POST /api/process-pending?secret=CRON_SECRET
 *
 * Worker chamado pelo QStash depois do delay do debounce. Recebe
 * { sessionId, triggerAt }. Se chegou mensagem mais nova depois do triggerAt,
 * ignora (o callback dessa mensagem mais nova vai processar). Senão, drena
 * todas as pendentes da sessão e processa o conteúdo combinado.
 *
 * Fila sem perda: as linhas só saem da fila depois que a IA responde. Falhou antes
 * disso → devolve as linhas e responde 500 (o QStash tenta de novo). Se a função
 * morrer por tempo, o aluguel do claim vence e o próximo retry reprocessa.
 */
export const maxDuration = 60

async function completeWithRetry(ids: string[], sessionId: string): Promise<void> {
  for (let i = 1; i <= 2; i++) {
    try {
      await completePending(ids)
      return
    } catch (err) {
      console.error(`[process-pending] ${sessionId}: completePending falhou (tentativa ${i}/2):`, err)
    }
  }
}

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

  // Drena tudo da sessão E extrai anexos (PDF/imagem/etc) em paralelo
  const { content, context, count, ids, attempt } = await drainAndBuildContent(sessionId)
  if (count === 0) {
    // Nada livre. Se outra tentativa está com as linhas alugadas, pode ser uma que morreu
    // no meio: responde erro pro QStash tentar de novo quando o aluguel vencer.
    if (await hasInFlightPending(sessionId)) {
      console.log(`[process-pending] ${sessionId}: outra tentativa em andamento — QStash tenta de novo depois`)
      return NextResponse.json({ ok: false, retry: 'in_flight' }, { status: 503 })
    }
    console.log(`[process-pending] ${sessionId}: nothing to drain`)
    return NextResponse.json({ ok: true, skipped: 'empty' })
  }

  if (!content.trim()) {
    await completeWithRetry(ids, sessionId)
    console.log(`[process-pending] ${sessionId}: nothing to drain`)
    return NextResponse.json({ ok: true, skipped: 'empty' })
  }

  const ctx = context
  if (!ctx?.chatwootInboxId) {
    console.warn(`[process-pending] ${sessionId}: missing context, cannot process`)
    await completeWithRetry(ids, sessionId)
    return NextResponse.json({ ok: false, error: 'no context' })
  }

  let inbox: Awaited<ReturnType<typeof loadInboxByChatwootId>>
  try {
    inbox = await loadInboxByChatwootId(ctx.chatwootInboxId)
  } catch (err) {
    console.error(`[process-pending] ${sessionId}: falha ao carregar inbox (retry):`, err)
    await releasePending(ids).catch(e => console.error(`[process-pending] releasePending falhou:`, e))
    return NextResponse.json({ ok: false, error: 'inbox load failed' }, { status: 500 })
  }
  if (!inbox || !inbox.enabled) {
    console.warn(`[process-pending] ${sessionId}: inbox ${ctx.chatwootInboxId} not found/disabled`)
    await completeWithRetry(ids, sessionId)
    return NextResponse.json({ ok: false, error: 'inbox unavailable' })
  }

  let replied = false
  try {
    await processIncomingMessage(inbox, ctx, content, {
      reprocessing: attempt > 1,
      onReplySent: async () => {
        replied = true
        await completeWithRetry(ids, sessionId)
      },
    })
  } catch (err) {
    if (replied) {
      // A resposta já saiu e as linhas já foram concluídas — não reprocessa.
      console.error(`[process-pending] ${sessionId} erro DEPOIS da resposta (não reprocessa):`, err)
      return NextResponse.json({ ok: true, processed: count, warning: (err as Error).message })
    }
    console.error(`[process-pending] ${sessionId} error (tentativa ${attempt}) — mensagem volta pra fila:`, err)
    await releasePending(ids).catch(e => console.error(`[process-pending] releasePending falhou:`, e))
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }

  if (!replied) await completeWithRetry(ids, sessionId)
  console.log(`[process-pending] ${sessionId}: processed ${count} message(s)${attempt > 1 ? ` (tentativa ${attempt})` : ''}`)
  return NextResponse.json({ ok: true, processed: count })
}
