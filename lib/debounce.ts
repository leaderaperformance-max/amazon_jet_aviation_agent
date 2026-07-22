import { getAdminClient } from '@/lib/supabase/admin'

export async function insertPending(
  sessionId: string,
  content: string,
  chatwootMessageId?: number,
  context?: unknown,
): Promise<{ id: string; received_at: string }> {
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

  if (error) throw error
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

export async function drainPending(
  sessionId: string
): Promise<{ ids: string[]; combinedContent: string; context: unknown; attachments: unknown[] }> {
  const supabase = getAdminClient()

  // Reivindica as pendentes ATOMICAMENTE: um único UPDATE ... RETURNING marca
  // processed=true e devolve as linhas. Se dois drains concorrerem (QStash entrega
  // o callback mais de uma vez), só UM pega as linhas — o outro volta vazio.
  // Evita o processamento/resposta duplicada.
  const { data: rows, error: claimErr } = await supabase
    .from('pending_messages')
    .update({ processed: true })
    .eq('session_id', sessionId)
    .eq('processed', false)
    .select('id, content, received_at, context')

  if (claimErr) throw claimErr

  const sorted = (rows ?? []).slice().sort(
    (a: { received_at: string }, b: { received_at: string }) =>
      a.received_at.localeCompare(b.received_at)
  )
  const ids = sorted.map((r: { id: string }) => r.id)

  // Junta só o texto (não-vazio) com separador
  const combinedContent = sorted
    .map((r: { content: string }) => r.content)
    .filter((c: string) => c && c.trim())
    .join('\n\n')

  // Agrega anexos de TODAS as linhas (cada mensagem pode ter trazido PDFs)
  const attachments: unknown[] = []
  for (const r of sorted) {
    const c = (r as { context?: { attachments?: unknown[] } }).context
    if (c?.attachments && Array.isArray(c.attachments)) attachments.push(...c.attachments)
  }

  // Context da ÚLTIMA mensagem (labels/sender mais atuais)
  const context = sorted.length > 0 ? (sorted[sorted.length - 1] as { context: unknown }).context : null
  return { ids, combinedContent, context, attachments }
}
