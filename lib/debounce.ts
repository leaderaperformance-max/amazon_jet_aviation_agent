import { getAdminClient } from '@/lib/supabase/admin'

/**
 * Enfileira a mensagem. Retorna null quando a MESMA message.id do Chatwoot já foi
 * enfileirada antes (webhook entregue em duplicidade) — o chamador deve ignorar.
 * A unicidade vem do índice uq_pending_chatwoot_msg (migration 20260723000001).
 */
export async function insertPending(
  sessionId: string,
  content: string,
  chatwootMessageId?: number,
  context?: unknown,
): Promise<{ id: string; received_at: string } | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('pending_messages')
    .insert({
      session_id: sessionId,
      content,
      chatwoot_message_id: chatwootMessageId ?? null,
      received_at: new Date().toISOString(),
      processed: false,
      context: context ?? null,
    })
    .select('id, received_at')
    .single()

  if (error) {
    // 23505 = violação do índice único → entrega duplicada do webhook. Ignora.
    if ((error as { code?: string }).code === '23505') {
      console.log(`[debounce] duplicate chatwoot_message_id=${chatwootMessageId} — ignorando`)
      return null
    }
    throw error
  }
  return { id: data.id, received_at: data.received_at }
}

export async function hasNewerPending(sessionId: string, after: string): Promise<boolean> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('pending_messages')
    .select('id')
    .eq('session_id', sessionId)
    .eq('processed', false)
    .gt('received_at', after)
    .limit(1)

  if (error) throw error
  return (data?.length ?? 0) > 0
}

/**
 * Aluguel do claim, em segundos. Maior que o maxDuration do worker (60s): enquanto uma
 * tentativa pode estar viva, nenhuma outra pega as mesmas linhas.
 */
export const PENDING_LEASE_SECONDS = 70

/**
 * A partir desta tentativa os anexos ficam de fora: um anexo que sempre estoura o tempo
 * não pode deixar o cliente sem resposta pra sempre.
 */
export const SKIP_ATTACHMENTS_FROM_ATTEMPT = 3

interface PendingRow {
  id: string
  content: string
  received_at: string
  context: { attachments?: unknown[] } | null
  attempts: number | null
}

export async function drainPending(sessionId: string): Promise<{
  ids: string[]
  combinedContent: string
  context: unknown
  attachments: unknown[]
  /** Maior nº de tentativas entre as linhas (1 = primeira vez). */
  attempt: number
  /** Anexos deixados de fora por já terem falhado em tentativas anteriores. */
  skippedAttachments: number
}> {
  const supabase = getAdminClient()

  // Reivindica ATOMICAMENTE (função SQL claim_pending_messages): marca claimed_at e
  // devolve as linhas livres. Dois drains concorrentes (QStash entrega o callback mais
  // de uma vez) nunca pegam a mesma linha. NÃO marca processed — isso só acontece em
  // completePending, depois que a IA respondeu. Se o worker morrer no meio, o aluguel
  // vence e o retry reprocessa (antes a mensagem se perdia).
  const { data: rows, error: claimErr } = await supabase.rpc('claim_pending_messages', {
    p_session_id: sessionId,
    p_lease_seconds: PENDING_LEASE_SECONDS,
  })

  if (claimErr) throw claimErr

  const sorted = ((rows ?? []) as PendingRow[]).slice().sort(
    (a, b) => a.received_at.localeCompare(b.received_at)
  )
  const ids = sorted.map(r => r.id)

  // Junta só o texto (não-vazio) com separador
  const combinedContent = sorted
    .map(r => r.content)
    .filter(c => c && c.trim())
    .join('\n\n')

  // Agrega anexos de TODAS as linhas (cada mensagem pode ter trazido PDFs), exceto os
  // de linhas que já falharam vezes demais.
  const attachments: unknown[] = []
  let attempt = 0
  let skippedAttachments = 0
  for (const r of sorted) {
    const tries = r.attempts ?? 1
    attempt = Math.max(attempt, tries)
    const atts = r.context?.attachments
    if (!Array.isArray(atts) || atts.length === 0) continue
    if (tries >= SKIP_ATTACHMENTS_FROM_ATTEMPT) skippedAttachments += atts.length
    else attachments.push(...atts)
  }

  // Context da ÚLTIMA mensagem (labels/sender mais atuais)
  const context = sorted.length > 0 ? sorted[sorted.length - 1].context : null
  return { ids, combinedContent, context, attachments, attempt, skippedAttachments }
}

/** A IA respondeu: as linhas saem da fila de vez. */
export async function completePending(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await getAdminClient()
    .from('pending_messages')
    .update({ processed: true })
    .in('id', ids)
  if (error) throw error
}

/** O processamento falhou ANTES da resposta: devolve as linhas pra fila (retry reprocessa). */
export async function releasePending(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await getAdminClient()
    .from('pending_messages')
    .update({ claimed_at: null })
    .in('id', ids)
    .eq('processed', false)
  if (error) throw error
}

/** Outra tentativa está com linhas dessa sessão alugadas agora (em andamento)? */
export async function hasInFlightPending(sessionId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - PENDING_LEASE_SECONDS * 1000).toISOString()
  const { data, error } = await getAdminClient()
    .from('pending_messages')
    .select('id')
    .eq('session_id', sessionId)
    .eq('processed', false)
    .gt('claimed_at', cutoff)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}
