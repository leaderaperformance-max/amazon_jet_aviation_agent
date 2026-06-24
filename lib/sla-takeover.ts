import { getAdminClient } from '@/lib/supabase/admin'

type Activity = 'responded' | 'newer_inbound' | 'silent'

export function classifyActivitySince(
  rows: Array<{ type: string; content: string }>,
): Activity {
  let newerInbound = false
  for (const r of rows) {
    const isAtendente = r.type === 'human' && r.content.startsWith('[atendente]:')
    if (r.type === 'ai' || isAtendente) return 'responded'
    if (r.type === 'human') newerInbound = true
  }
  return newerInbound ? 'newer_inbound' : 'silent'
}

export async function activitySince(sessionId: string, sinceAt: string): Promise<Activity> {
  const db = getAdminClient()
  const { data } = await db.from('memory_chat_amazon_jet')
    .select('message, created_at').eq('session_id', sessionId).gt('created_at', sinceAt)
  const rows = (data ?? []).map((r: { message: { type: string; content: string } }) => r.message)
  return classifyActivitySince(rows)
}
