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
): Promise<{ ids: string[]; combinedContent: string; context: unknown }> {
  const supabase = getAdminClient()

  // Select all unprocessed for the session, mark them processed, combine.
  const { data: rows, error: selErr } = await supabase
    .from('pending_messages')
    .select('id, content, received_at, context')
    .eq('session_id', sessionId)
    .eq('processed', false)
    .order('received_at', { ascending: true })

  if (selErr) throw selErr

  const sorted = (rows ?? []).slice().sort(
    (a: { received_at: string }, b: { received_at: string }) =>
      a.received_at.localeCompare(b.received_at)
  )
  const ids = sorted.map((r: { id: string }) => r.id)

  if (ids.length > 0) {
    const { error: updErr } = await supabase
      .from('pending_messages')
      .update({ processed: true })
      .in('id', ids)
    if (updErr) throw updErr
  }

  const combinedContent = sorted.map((r: { content: string }) => r.content).join('\n\n')
  // Use the context from the LAST message (most up-to-date labels/sender)
  const context = sorted.length > 0 ? (sorted[sorted.length - 1] as { context: unknown }).context : null
  return { ids, combinedContent, context }
}
