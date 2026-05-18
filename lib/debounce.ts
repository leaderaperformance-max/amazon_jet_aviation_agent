import { getAdminClient } from '@/lib/supabase/admin'

export async function insertPending(
  sessionId: string,
  content: string,
  chatwootMessageId?: number
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
): Promise<{ ids: string[]; combinedContent: string }> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .rpc('drain_pending_messages', { p_session_id: sessionId })

  // Fallback to manual update if RPC not available
  if (error) {
    // Use UPDATE ... RETURNING via two queries (Supabase JS limitation)
    const { data: rows, error: selErr } = await supabase
      .from('pending_messages')
      .select('id, content, received_at')
      .eq('session_id', sessionId)
      .eq('processed', false)
      .order('received_at', { ascending: true })

    if (selErr) throw selErr

    const ids = (rows ?? []).map((r: { id: string }) => r.id)
    if (ids.length > 0) {
      const { error: updErr } = await supabase
        .from('pending_messages')
        .update({ processed: true })
        .in('id', ids)

      if (updErr) throw updErr
    }

    const sorted = (rows ?? []).sort(
      (a: { received_at: string }, b: { received_at: string }) =>
        a.received_at.localeCompare(b.received_at)
    )
    const combinedContent = sorted.map((r: { content: string }) => r.content).join('\n\n')
    return { ids, combinedContent }
  }

  // RPC returned rows
  const rows = (data ?? []) as Array<{ id: string; content: string; received_at: string }>
  const sorted = rows.sort((a, b) => a.received_at.localeCompare(b.received_at))
  const ids = sorted.map(r => r.id)
  const combinedContent = sorted.map(r => r.content).join('\n\n')
  return { ids, combinedContent }
}
