import { getAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_LABELS } from '@/lib/types'
import type {
  AnalyticsResponse,
  AnalyticsKpis,
  FunnelStage,
  TagCount,
  VolumePoint,
  ContactStatus,
} from '@/lib/types'

interface ContactRow {
  id: string
  inbox_id: string
  name: string | null
  phone_number: string | null
  current_labels: string[]
  status: ContactStatus
  message_count: number
  first_seen_at: string
  last_message_at: string | null
}

interface MessageRow {
  session_id: string
  created_at: string
  message: { type: string; content: string }
}

interface InboxRow {
  id: string
  name: string
}

const FUNNEL_STAGES = [
  'novo_lead',
  'aguardando_pn',
  'pendente_orcamento',
  'orcamento_enviado',
  'lead_ganho',
] as const

const ALL_TAGS = [...BUSINESS_LABELS, 'atendimento_ia']

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 1
  return (curr - prev) / prev
}

export async function computeAnalytics(from: string, to: string): Promise<AnalyticsResponse> {
  const supabase = getAdminClient()

  // Compute previous period range
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const delta = toDate.getTime() - fromDate.getTime()
  const prevFrom = new Date(fromDate.getTime() - delta).toISOString().slice(0, 10)
  const prevTo = from

  // Fetch all data in parallel
  const [contactsRes, messagesRes, inboxesRes, activeRes, prevContactsRes, prevMessagesRes] = await Promise.all([
    supabase.from('contacts').select('*').gte('first_seen_at', from).lte('first_seen_at', to),
    supabase.from('memory_chat_amazon_jet').select('session_id, created_at, message').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: true }),
    supabase.from('inboxes').select('id, name'),
    supabase.from('contacts').select('id').in('status', ['ia', 'humano']),
    supabase.from('contacts').select('id, current_labels').gte('first_seen_at', prevFrom).lte('first_seen_at', prevTo),
    supabase.from('memory_chat_amazon_jet').select('message').gte('created_at', prevFrom).lte('created_at', prevTo),
  ])

  const contacts: ContactRow[] = (contactsRes.data ?? []) as ContactRow[]
  const messages: MessageRow[] = (messagesRes.data ?? []) as MessageRow[]
  const inboxes: InboxRow[] = (inboxesRes.data ?? []) as InboxRow[]
  const activeNow = (activeRes.data ?? []).length
  const prevContacts = (prevContactsRes.data ?? []) as { id: string; current_labels: string[] }[]
  const prevMessages = (prevMessagesRes.data ?? []) as { message: { type: string; content: string } }[]

  // ---- KPIs ----
  const newContacts = contacts.length

  const incomingMessages = messages.filter(
    m => m.message?.type === 'human' && !String(m.message?.content ?? '').startsWith('[atendente]:')
  )
  const receivedMessages = incomingMessages.length

  const leadsWon = contacts.filter(c => c.current_labels?.includes('lead_ganho')).length
  const leadsLost = contacts.filter(c => c.current_labels?.includes('lead_perdido')).length
  const conversionRate = leadsWon + leadsLost > 0 ? leadsWon / (leadsWon + leadsLost) : 0

  // AI-only %: sessions with no [atendente]: messages / total sessions
  const sessionsWithHuman = new Set<string>()
  const allSessions = new Set<string>()
  for (const m of messages) {
    allSessions.add(m.session_id)
    if (String(m.message?.content ?? '').startsWith('[atendente]:')) {
      sessionsWithHuman.add(m.session_id)
    }
  }
  const aiOnlyPercent = allSessions.size > 0 ? (allSessions.size - sessionsWithHuman.size) / allSessions.size : 0

  // Avg response time: human → ai pairs by session
  const respTimes: number[] = []
  const lastUser = new Map<string, number>()
  for (const m of messages) {
    const ts = new Date(m.created_at).getTime()
    if (m.message?.type === 'human' && !String(m.message?.content ?? '').startsWith('[atendente]:')) {
      lastUser.set(m.session_id, ts)
    } else if (m.message?.type === 'ai') {
      const userTs = lastUser.get(m.session_id)
      if (userTs && ts > userTs) {
        respTimes.push((ts - userTs) / 1000)
        lastUser.delete(m.session_id)
      }
    }
  }
  const avgResponseTimeSec = respTimes.length > 0 ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : 0

  // ---- Funnel ----
  const funnel: FunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
    const count = contacts.filter(c => c.current_labels?.includes(stage)).length
    if (i === 0) {
      return { stage, count, conversionFromPrev: null }
    }
    const prevCount = contacts.filter(c => c.current_labels?.includes(FUNNEL_STAGES[i - 1])).length
    return {
      stage,
      count,
      conversionFromPrev: prevCount > 0 ? count / prevCount : 0,
    }
  })

  // ---- Status distribution ----
  const statusDistribution = {
    ia: contacts.filter(c => c.status === 'ia').length,
    humano: contacts.filter(c => c.status === 'humano').length,
    encerrado: contacts.filter(c => c.status === 'encerrado').length,
  }

  // ---- Volume over time ----
  const volumeMap = new Map<string, { messages: number; newContacts: number }>()
  for (const m of incomingMessages) {
    const date = m.created_at?.slice(0, 10)
    if (!date) continue
    const cur = volumeMap.get(date) ?? { messages: 0, newContacts: 0 }
    cur.messages++
    volumeMap.set(date, cur)
  }
  for (const c of contacts) {
    const date = c.first_seen_at?.slice(0, 10)
    if (!date) continue
    const cur = volumeMap.get(date) ?? { messages: 0, newContacts: 0 }
    cur.newContacts++
    volumeMap.set(date, cur)
  }
  const volumeOverTime: VolumePoint[] = Array.from(volumeMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ---- Tag distribution ----
  const tagDistribution: TagCount[] = ALL_TAGS.map(tag => ({
    tag,
    count: contacts.filter(c => c.current_labels?.includes(tag)).length,
  }))

  // ---- Inbox distribution ----
  const inboxCounts = new Map<string, number>()
  for (const c of contacts) {
    if (!c.inbox_id) continue
    inboxCounts.set(c.inbox_id, (inboxCounts.get(c.inbox_id) ?? 0) + 1)
  }
  const inboxDistribution = inboxes
    .map(i => ({ inbox_id: i.id, name: i.name, count: inboxCounts.get(i.id) ?? 0 }))
    .filter(i => i.count > 0)

  // ---- Top contacts ----
  const topContacts = [...contacts]
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      name: c.name,
      phone_number: c.phone_number,
      current_labels: c.current_labels ?? [],
      message_count: c.message_count,
      status: c.status,
      last_message_at: c.last_message_at,
    }))

  // ---- Deltas vs previous period ----
  const prevNewContacts = prevContacts.length
  const prevReceivedMessages = prevMessages.filter(
    m => m.message?.type === 'human' && !String(m.message?.content ?? '').startsWith('[atendente]:')
  ).length
  const prevLeadsWon = prevContacts.filter(c => c.current_labels?.includes('lead_ganho')).length
  const prevLeadsLost = prevContacts.filter(c => c.current_labels?.includes('lead_perdido')).length
  const prevConversion = prevLeadsWon + prevLeadsLost > 0 ? prevLeadsWon / (prevLeadsWon + prevLeadsLost) : 0

  const deltas = {
    newContacts: pctDelta(newContacts, prevNewContacts),
    receivedMessages: pctDelta(receivedMessages, prevReceivedMessages),
    aiOnlyPercent: 0,
    avgResponseTimeSec: 0,
    leadsWon: pctDelta(leadsWon, prevLeadsWon),
    leadsLost: pctDelta(leadsLost, prevLeadsLost),
    conversionRate: pctDelta(conversionRate, prevConversion),
  }

  const kpis: AnalyticsKpis = {
    newContacts,
    receivedMessages,
    aiOnlyPercent,
    avgResponseTimeSec,
    leadsWon,
    leadsLost,
    conversionRate,
    activeNow,
    deltas,
  }

  return {
    kpis,
    funnel,
    statusDistribution,
    volumeOverTime,
    tagDistribution,
    inboxDistribution,
    topContacts,
  }
}
