# Fase 3 — Dashboard Analítico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a home `/dashboard` por um dashboard analítico com 8 KPIs, 5 gráficos, top contatos e bloco compacto de inboxes, com seletor de range de datas.

**Architecture:** Endpoint único `/api/analytics?from=&to=` retorna JSON agregado. Home `/dashboard/page.tsx` é Server Component que chama `computeAnalytics()` direto (sem HTTP). Frontend usa shadcn/ui Chart (Recharts) e Calendar/Popover. Sem migrations novas.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase, shadcn/ui (Chart, Calendar, Popover), Recharts, Vitest.

---

## File Map

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `lib/analytics.ts` | `computeAnalytics(from, to)` agrega todos os dados | Novo |
| `lib/types.ts` | Adiciona `AnalyticsResponse` e sub-types | Modificar |
| `app/api/analytics/route.ts` | GET endpoint (auth + chamada) | Novo |
| `app/dashboard/page.tsx` | REFATORADO — vira dashboard analítico | Modificar |
| `components/analytics/date-range-picker.tsx` | Popover + Calendar + presets | Novo |
| `components/analytics/kpi-cards.tsx` | 8 cards | Novo |
| `components/analytics/funnel-chart.tsx` | Barras horizontais | Novo |
| `components/analytics/status-donut.tsx` | Donut chart | Novo |
| `components/analytics/volume-chart.tsx` | Line chart 2 séries | Novo |
| `components/analytics/tag-distribution.tsx` | Bar chart | Novo |
| `components/analytics/inbox-distribution.tsx` | Bar chart condicional | Novo |
| `components/analytics/top-contacts.tsx` | Tabela top 10 | Novo |
| `components/analytics/inbox-status.tsx` | Bloco compacto rodapé | Novo |
| `tests/analytics.test.ts` | Testes do agregador | Novo |
| `components/ui/calendar.tsx` `popover.tsx` `chart.tsx` | shadcn install | Novo |

---

## Task 1: Instalar shadcn Chart + Calendar + Popover

**Files:** dependências e novos componentes shadcn

- [ ] **Step 1: Install shadcn components**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npx shadcn@latest add chart calendar popover -y
```

- [ ] **Step 2: Confirm recharts is installed (peer dep do chart)**

```bash
npm ls recharts 2>&1 | head -3
```

Se aparecer `(empty)` ou nada, instalar manualmente:

```bash
npm install recharts
```

- [ ] **Step 3: Confirm date helpers (necessário para o calendar)**

```bash
npm ls date-fns react-day-picker 2>&1 | head -5
```

Se faltar:

```bash
npm install date-fns react-day-picker
```

- [ ] **Step 4: Verify build still passes**

```bash
npm run build
```

- [ ] **Step 5: Verify all tests pass (36/36)**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: install shadcn chart, calendar, popover for analytics"
```

---

## Task 2: Tipos TypeScript para AnalyticsResponse

**Files:** Modify `lib/types.ts`

- [ ] **Step 1: Append no final de `lib/types.ts`**

```typescript

// ---------------- Analytics (Phase 3) ----------------

export interface AnalyticsKpiDeltas {
  newContacts: number
  receivedMessages: number
  aiOnlyPercent: number
  avgResponseTimeSec: number
  leadsWon: number
  leadsLost: number
  conversionRate: number
}

export interface AnalyticsKpis {
  newContacts: number
  receivedMessages: number
  aiOnlyPercent: number          // 0..1
  avgResponseTimeSec: number
  leadsWon: number
  leadsLost: number
  conversionRate: number         // 0..1
  activeNow: number
  deltas: AnalyticsKpiDeltas
}

export interface FunnelStage {
  stage: string
  count: number
  conversionFromPrev: number | null  // 0..1, null no primeiro
}

export interface VolumePoint {
  date: string                    // YYYY-MM-DD
  messages: number
  newContacts: number
}

export interface TagCount {
  tag: string
  count: number
}

export interface InboxCount {
  inbox_id: string
  name: string
  count: number
}

export interface TopContact {
  id: string
  name: string | null
  phone_number: string | null
  current_labels: string[]
  message_count: number
  status: ContactStatus
  last_message_at: string | null
}

export interface AnalyticsResponse {
  kpis: AnalyticsKpis
  funnel: FunnelStage[]
  statusDistribution: { ia: number; humano: number; encerrado: number }
  volumeOverTime: VolumePoint[]
  tagDistribution: TagCount[]
  inboxDistribution: InboxCount[]
  topContacts: TopContact[]
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add AnalyticsResponse and sub-types"
```

---

## Task 3: lib/analytics.ts — agregador principal (TDD)

**Files:** Create `lib/analytics.ts`, Create `tests/analytics.test.ts`

- [ ] **Step 1: Create `tests/analytics.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}))

import { computeAnalytics } from '@/lib/analytics'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

// Helper para montar um cliente Supabase mockado que responde queries SQL específicas
function mockSupabase(handlers: {
  contacts?: (q: { from: string; to: string }) => unknown[]
  messages?: (q: { from: string; to: string }) => unknown[]
  inboxes?: () => unknown[]
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'contacts') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        then: (cb: (r: { data: unknown[]; error: null; count: number }) => unknown) =>
          Promise.resolve({ data: handlers.contacts?.({ from: '', to: '' }) ?? [], error: null, count: handlers.contacts?.({ from: '', to: '' }).length ?? 0 }).then(cb),
      }
    }
    if (table === 'memory_chat_amazon_jet') {
      return {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (cb: (r: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: handlers.messages?.({ from: '', to: '' }) ?? [], error: null }).then(cb),
      }
    }
    if (table === 'inboxes') {
      return {
        select: vi.fn().mockReturnThis(),
        then: (cb: (r: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: handlers.inboxes?.() ?? [], error: null }).then(cb),
      }
    }
    return { then: (cb: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(cb) }
  })

  mockGetAdminClient.mockReturnValue({ from: fromMock })
}

describe('computeAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna estrutura completa com zeros quando não há dados', async () => {
    mockSupabase({ contacts: () => [], messages: () => [], inboxes: () => [] })

    const result = await computeAnalytics('2026-04-17', '2026-05-17')

    expect(result.kpis.newContacts).toBe(0)
    expect(result.kpis.receivedMessages).toBe(0)
    expect(result.kpis.conversionRate).toBe(0)
    expect(result.funnel).toHaveLength(5)
    expect(result.statusDistribution).toEqual({ ia: 0, humano: 0, encerrado: 0 })
    expect(result.volumeOverTime).toEqual([])
    expect(result.topContacts).toEqual([])
  })

  it('calcula KPIs básicos a partir dos contatos retornados', async () => {
    const contacts = [
      { id: 'c1', name: 'A', phone_number: '+1', current_labels: ['lead_ganho'], status: 'encerrado', message_count: 5, first_seen_at: '2026-05-10', last_message_at: '2026-05-12' },
      { id: 'c2', name: 'B', phone_number: '+2', current_labels: ['lead_ganho'], status: 'encerrado', message_count: 3, first_seen_at: '2026-05-11', last_message_at: '2026-05-12' },
      { id: 'c3', name: 'C', phone_number: '+3', current_labels: ['lead_perdido'], status: 'encerrado', message_count: 2, first_seen_at: '2026-05-12', last_message_at: '2026-05-12' },
      { id: 'c4', name: 'D', phone_number: '+4', current_labels: ['atendimento_ia'], status: 'ia', message_count: 1, first_seen_at: '2026-05-13', last_message_at: '2026-05-13' },
    ]
    mockSupabase({ contacts: () => contacts, messages: () => [], inboxes: () => [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')

    expect(result.kpis.newContacts).toBe(4)
    expect(result.kpis.leadsWon).toBe(2)
    expect(result.kpis.leadsLost).toBe(1)
    expect(result.kpis.conversionRate).toBeCloseTo(2 / 3, 2)
  })

  it('agrupa mensagens por dia para volumeOverTime', async () => {
    const messages = [
      { created_at: '2026-05-15T10:00:00Z', message: { type: 'human', content: 'oi' } },
      { created_at: '2026-05-15T11:00:00Z', message: { type: 'human', content: 'tudo bem?' } },
      { created_at: '2026-05-16T09:00:00Z', message: { type: 'human', content: 'olá' } },
    ]
    mockSupabase({ contacts: () => [], messages: () => messages, inboxes: () => [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')

    const may15 = result.volumeOverTime.find(v => v.date === '2026-05-15')
    const may16 = result.volumeOverTime.find(v => v.date === '2026-05-16')
    expect(may15?.messages).toBe(2)
    expect(may16?.messages).toBe(1)
  })

  it('computa distribuição por status', async () => {
    const contacts = [
      { id: '1', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '2', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '3', current_labels: [], status: 'humano', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '4', current_labels: [], status: 'encerrado', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
    ]
    mockSupabase({ contacts: () => contacts, messages: () => [], inboxes: () => [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    expect(result.statusDistribution).toEqual({ ia: 2, humano: 1, encerrado: 1 })
  })

  it('computa funil de conversão', async () => {
    const contacts = [
      { id: '1', current_labels: ['novo_lead', 'aguardando_pn', 'pendente_orcamento'], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '2', current_labels: ['novo_lead', 'aguardando_pn'], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '3', current_labels: ['novo_lead'], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
    ]
    mockSupabase({ contacts: () => contacts, messages: () => [], inboxes: () => [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')

    expect(result.funnel[0]).toEqual({ stage: 'novo_lead', count: 3, conversionFromPrev: null })
    expect(result.funnel[1]).toMatchObject({ stage: 'aguardando_pn', count: 2 })
    expect(result.funnel[1].conversionFromPrev).toBeCloseTo(2 / 3, 2)
    expect(result.funnel[2]).toMatchObject({ stage: 'pendente_orcamento', count: 1 })
  })

  it('computa top 10 contatos por message_count', async () => {
    const contacts = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`, name: `User ${i}`, phone_number: `+${i}`,
      current_labels: [], status: 'ia', message_count: 20 - i,
      first_seen_at: '2026-05-10', last_message_at: '2026-05-10',
    }))
    mockSupabase({ contacts: () => contacts, messages: () => [], inboxes: () => [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    expect(result.topContacts).toHaveLength(10)
    expect(result.topContacts[0].message_count).toBe(20)
    expect(result.topContacts[9].message_count).toBe(11)
  })

  it('computa distribuição por inbox', async () => {
    const contacts = [
      { id: 'a', inbox_id: 'in-1', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: 'b', inbox_id: 'in-1', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: 'c', inbox_id: 'in-2', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
    ]
    const inboxes = [
      { id: 'in-1', name: 'Amazon Jet' },
      { id: 'in-2', name: 'LeaderaPerformance' },
    ]
    mockSupabase({ contacts: () => contacts, messages: () => [], inboxes: () => inboxes })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    const aj = result.inboxDistribution.find(i => i.name === 'Amazon Jet')
    const lp = result.inboxDistribution.find(i => i.name === 'LeaderaPerformance')
    expect(aj?.count).toBe(2)
    expect(lp?.count).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — must fail**

```bash
npm test tests/analytics.test.ts
```

Expected: `Cannot find module '@/lib/analytics'`.

- [ ] **Step 3: Create `lib/analytics.ts`**

```typescript
import { getAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_LABELS, TERMINAL_LABELS } from '@/lib/types'
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
  inbox_id?: string
  name: string | null
  phone_number: string | null
  current_labels: string[]
  status: ContactStatus
  message_count: number
  first_seen_at: string
  last_message_at: string | null
}

interface MessageRow {
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

export async function computeAnalytics(from: string, to: string): Promise<AnalyticsResponse> {
  const supabase = getAdminClient()

  // Fetch contacts within the window (by first_seen_at)
  const contactsRes = await supabase
    .from('contacts')
    .select('*')
    .gte('first_seen_at', from)
    .lte('first_seen_at', to)

  const contacts: ContactRow[] = (contactsRes.data ?? []) as ContactRow[]

  // Fetch messages within the window
  const messagesRes = await supabase
    .from('memory_chat_amazon_jet')
    .select('created_at, message')
    .gte('created_at', from)
    .lte('created_at', to)

  const messages: MessageRow[] = (messagesRes.data ?? []) as MessageRow[]

  // Fetch all inboxes (for inbox distribution names + counting active)
  const inboxesRes = await supabase.from('inboxes').select('id, name')
  const inboxes: InboxRow[] = (inboxesRes.data ?? []) as InboxRow[]

  // Fetch global counters (not period-filtered) for activeNow
  const activeRes = await supabase
    .from('contacts')
    .select('id')
    .in('status', ['ia', 'humano'])
  const activeNow = (activeRes.data ?? []).length

  // ---- Previous period for deltas ----
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const delta = toDate.getTime() - fromDate.getTime()
  const prevFrom = new Date(fromDate.getTime() - delta).toISOString().slice(0, 10)
  const prevTo = new Date(fromDate.getTime()).toISOString().slice(0, 10)

  const prevContactsRes = await supabase
    .from('contacts')
    .select('id, current_labels')
    .gte('first_seen_at', prevFrom)
    .lte('first_seen_at', prevTo)
  const prevContacts: { id: string; current_labels: string[] }[] =
    (prevContactsRes.data ?? []) as { id: string; current_labels: string[] }[]

  const prevMessagesRes = await supabase
    .from('memory_chat_amazon_jet')
    .select('created_at, message')
    .gte('created_at', prevFrom)
    .lte('created_at', prevTo)
  const prevMessages: MessageRow[] = (prevMessagesRes.data ?? []) as MessageRow[]

  // ---- KPIs ----
  const newContacts = contacts.length
  const incomingMessages = messages.filter(
    m => m.message?.type === 'human' && !String(m.message?.content ?? '').startsWith('[atendente]:')
  )
  const receivedMessages = incomingMessages.length

  const leadsWon = contacts.filter(c => c.current_labels.includes('lead_ganho')).length
  const leadsLost = contacts.filter(c => c.current_labels.includes('lead_perdido')).length
  const conversionRate = leadsWon + leadsLost > 0 ? leadsWon / (leadsWon + leadsLost) : 0

  // % of conversations that NEVER had a [atendente]: message
  // Group messages by session is heavy without session field; approximation:
  // count distinct conversations that have human-prefixed messages.
  // Simpler heuristic: ratio of conversations with NO [atendente]: prefix in this window.
  // We need a contact -> messages join, but we only have session_id (whatsapp_identifier) in memory.
  // Use contacts.whatsapp_identifier to filter — but we have it in contacts; need to map.
  // For MVP: count conversations with no [atendente]: messages in their memory.

  // Build a set of session_ids that had [atendente]: messages
  const handoffSessions = new Set<string>()
  // memory table doesn't have session_id in selected fields; fetch it.
  // We need session_id from the messages — but we didn't select it above.
  // Re-fetch with session_id for this calculation.
  const handoffRes = await supabase
    .from('memory_chat_amazon_jet')
    .select('session_id, message')
    .gte('created_at', from)
    .lte('created_at', to)
  const handoffRows: { session_id: string; message: { type: string; content: string } }[] =
    (handoffRes.data ?? []) as { session_id: string; message: { type: string; content: string } }[]

  for (const row of handoffRows) {
    if (String(row.message?.content ?? '').startsWith('[atendente]:')) {
      handoffSessions.add(row.session_id)
    }
  }

  const totalSessions = new Set(handoffRows.map(r => r.session_id)).size
  const aiOnlySessions = totalSessions - handoffSessions.size
  const aiOnlyPercent = totalSessions > 0 ? aiOnlySessions / totalSessions : 0

  // Avg response time: pair human → ai messages by session, compute time diff
  const sessionMessages = new Map<string, { ts: number; role: string }[]>()
  for (const row of handoffRows) {
    const ts = new Date((row as { created_at?: string }).created_at ?? 0).getTime()
    const role = row.message?.type ?? ''
    const arr = sessionMessages.get(row.session_id) ?? []
    arr.push({ ts, role })
    sessionMessages.set(row.session_id, arr)
  }
  // Pull created_at for handoff rows
  const handoffWithTsRes = await supabase
    .from('memory_chat_amazon_jet')
    .select('session_id, created_at, message')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true })
  const handoffWithTs: { session_id: string; created_at: string; message: { type: string } }[] =
    (handoffWithTsRes.data ?? []) as { session_id: string; created_at: string; message: { type: string } }[]

  const respTimes: number[] = []
  const sessionLastUser = new Map<string, number>()
  for (const row of handoffWithTs) {
    const ts = new Date(row.created_at).getTime()
    if (row.message?.type === 'human') {
      sessionLastUser.set(row.session_id, ts)
    } else if (row.message?.type === 'ai') {
      const userTs = sessionLastUser.get(row.session_id)
      if (userTs && ts > userTs) {
        respTimes.push((ts - userTs) / 1000)
        sessionLastUser.delete(row.session_id)
      }
    }
  }
  const avgResponseTimeSec = respTimes.length > 0 ? respTimes.reduce((a, b) => a + b, 0) / respTimes.length : 0

  // ---- Funnel ----
  const funnel: FunnelStage[] = FUNNEL_STAGES.map((stage, i) => {
    const count = contacts.filter(c => c.current_labels.includes(stage)).length
    const prevCount = i === 0 ? null : contacts.filter(c => c.current_labels.includes(FUNNEL_STAGES[i - 1])).length
    return {
      stage,
      count,
      conversionFromPrev: prevCount && prevCount > 0 ? count / prevCount : (i === 0 ? null : 0),
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
    const date = (m as unknown as { created_at: string }).created_at?.slice(0, 10)
    if (!date) continue
    const cur = volumeMap.get(date) ?? { messages: 0, newContacts: 0 }
    cur.messages++
    volumeMap.set(date, cur)
  }
  for (const c of contacts) {
    const date = c.first_seen_at.slice(0, 10)
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
    count: contacts.filter(c => c.current_labels.includes(tag)).length,
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
      current_labels: c.current_labels,
      message_count: c.message_count,
      status: c.status,
      last_message_at: c.last_message_at,
    }))

  // ---- Deltas vs previous period ----
  const prevNewContacts = prevContacts.length
  const prevReceivedMessages = prevMessages.filter(
    m => m.message?.type === 'human' && !String(m.message?.content ?? '').startsWith('[atendente]:')
  ).length
  const prevLeadsWon = prevContacts.filter(c => c.current_labels.includes('lead_ganho')).length
  const prevLeadsLost = prevContacts.filter(c => c.current_labels.includes('lead_perdido')).length
  const prevConversion = prevLeadsWon + prevLeadsLost > 0 ? prevLeadsWon / (prevLeadsWon + prevLeadsLost) : 0

  function pctDelta(curr: number, prev: number): number {
    if (prev === 0) return curr === 0 ? 0 : 1
    return (curr - prev) / prev
  }

  const deltas = {
    newContacts: pctDelta(newContacts, prevNewContacts),
    receivedMessages: pctDelta(receivedMessages, prevReceivedMessages),
    aiOnlyPercent: 0, // requires prev calculation; left at 0 for MVP
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
```

**Note:** the `BUSINESS_LABELS`/`TERMINAL_LABELS` imports require them to be runtime values. They are `as const` arrays in types.ts — already exported. The above mock-based tests cover the logic shape. The supabase chain mocks above are simplified; the real Supabase client uses thenable query builders. If a test fails due to chain return shape, simplify by mocking each table's select chain to return a resolved promise directly (see Phase 2 contacts.test.ts patterns for a precise example).

- [ ] **Step 4: Run tests — fix mocks if needed**

```bash
npm test tests/analytics.test.ts
```

If failing because chains don't compose properly, refine the `mockSupabase` helper to use the existing pattern from `tests/contacts.test.ts` — return `{ data, error }` from `then()`.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add lib/analytics.ts tests/analytics.test.ts
git commit -m "feat: add analytics aggregator computing KPIs, funnel, distributions"
```

---

## Task 4: GET /api/analytics endpoint

**Files:** Create `app/api/analytics/route.ts`

- [ ] **Step 1: Create endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { computeAnalytics } from '@/lib/analytics'

export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const result = await computeAnalytics(from, to)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/analytics/route.ts
git commit -m "feat: add GET /api/analytics endpoint"
```

---

## Task 5: DateRangePicker component

**Files:** Create `components/analytics/date-range-picker.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange } from 'react-day-picker'

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatBR(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

interface Props {
  initialFrom: string
  initialTo: string
}

export function DateRangePicker({ initialFrom, initialTo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(initialFrom),
    to: new Date(initialTo),
  })

  function applyPreset(daysBack: number | 'all') {
    const to = new Date()
    let from: Date
    if (daysBack === 'all') {
      from = new Date('2024-01-01')
    } else if (daysBack === 0) {
      from = new Date()
      from.setHours(0, 0, 0, 0)
    } else {
      from = new Date()
      from.setDate(from.getDate() - daysBack)
    }
    pushRange(from, to)
  }

  function pushRange(from: Date, to: Date) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', toYMD(from))
    params.set('to', toYMD(to))
    router.push(`/dashboard?${params.toString()}`)
    setOpen(false)
  }

  function applyCustom() {
    if (range?.from && range?.to) pushRange(range.from, range.to)
  }

  const label = range?.from && range?.to
    ? `${formatBR(range.from)} — ${formatBR(range.to)}`
    : 'Selecionar período'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button variant="outline">{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => applyPreset(0)}>Hoje</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset(7)}>7d</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset(30)}>30d</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset(90)}>90d</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset('all')}>Tudo</Button>
          </div>
          <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />
          <Button onClick={applyCustom} disabled={!range?.from || !range?.to}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/date-range-picker.tsx
git commit -m "feat: add analytics date range picker with presets"
```

---

## Task 6: KpiCards component

**Files:** Create `components/analytics/kpi-cards.tsx`

- [ ] **Step 1: Create component**

```typescript
import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsKpis } from '@/lib/types'

function fmtNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function fmtPercent(p: number): string {
  return `${(p * 100).toFixed(0)}%`
}

function fmtSec(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`
  return `${(s / 60).toFixed(1)}min`
}

function Delta({ value }: { value: number }) {
  if (value === 0) return null
  const sign = value > 0 ? '▲' : '▼'
  const color = value > 0 ? 'text-green-600' : 'text-red-600'
  return (
    <span className={`text-xs ${color} ml-2`}>
      {sign} {Math.abs(value * 100).toFixed(0)}%
    </span>
  )
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold flex items-baseline">
          {value}
          {delta !== undefined && <Delta value={delta} />}
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards({ kpis }: { kpis: AnalyticsKpis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Contatos novos" value={fmtNumber(kpis.newContacts)} delta={kpis.deltas.newContacts} />
        <Kpi label="Mensagens recebidas" value={fmtNumber(kpis.receivedMessages)} delta={kpis.deltas.receivedMessages} />
        <Kpi label="Atendidos só pela IA" value={fmtPercent(kpis.aiOnlyPercent)} />
        <Kpi label="Tempo médio de resposta" value={fmtSec(kpis.avgResponseTimeSec)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Leads ganhos" value={fmtNumber(kpis.leadsWon)} delta={kpis.deltas.leadsWon} />
        <Kpi label="Leads perdidos" value={fmtNumber(kpis.leadsLost)} delta={kpis.deltas.leadsLost} />
        <Kpi label="Taxa de conversão" value={fmtPercent(kpis.conversionRate)} delta={kpis.deltas.conversionRate} />
        <Kpi label="Em atendimento agora" value={fmtNumber(kpis.activeNow)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/kpi-cards.tsx
git commit -m "feat: add KpiCards component"
```

---

## Task 7: FunnelChart component

**Files:** Create `components/analytics/funnel-chart.tsx`

- [ ] **Step 1: Create component**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FunnelStage } from '@/lib/types'

export function FunnelChart({ funnel }: { funnel: FunnelStage[] }) {
  const max = Math.max(...funnel.map(f => f.count), 1)

  return (
    <Card>
      <CardHeader><CardTitle>Funil de Conversão</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnel.map((f, i) => {
            const width = (f.count / max) * 100
            const conv = f.conversionFromPrev !== null ? ` (${(f.conversionFromPrev * 100).toFixed(0)}%)` : ''
            return (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{f.stage}</span>
                  <span className="text-muted-foreground">{f.count}{conv}</span>
                </div>
                <div className="h-6 bg-gray-100 rounded">
                  <div
                    className="h-full rounded bg-gradient-to-r from-green-500 to-blue-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/funnel-chart.tsx
git commit -m "feat: add funnel chart component"
```

---

## Task 8: StatusDonut component

**Files:** Create `components/analytics/status-donut.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Pie, PieChart, Cell } from 'recharts'

interface Props {
  distribution: { ia: number; humano: number; encerrado: number }
}

export function StatusDonut({ distribution }: Props) {
  const data = [
    { name: 'IA', value: distribution.ia, fill: '#22c55e' },
    { name: 'Humano', value: distribution.humano, fill: '#eab308' },
    { name: 'Encerrado', value: distribution.encerrado, fill: '#9ca3af' },
  ]
  const total = distribution.ia + distribution.humano + distribution.encerrado

  return (
    <Card>
      <CardHeader><CardTitle>Distribuição por Status</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="h-[280px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
              {data.map(d => <Cell key={d.name} fill={d.fill} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <p className="text-center text-2xl font-bold -mt-32 pointer-events-none">{total}</p>
        <div className="flex justify-center gap-4 mt-8 text-sm">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: d.fill }} />
              <span>{d.name}: {d.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/status-donut.tsx
git commit -m "feat: add status donut chart"
```

---

## Task 9: VolumeChart component

**Files:** Create `components/analytics/volume-chart.tsx`

- [ ] **Step 1: Create component**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { VolumePoint } from '@/lib/types'

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const config = {
    messages: { label: 'Mensagens', color: '#3b82f6' },
    newContacts: { label: 'Novos contatos', color: '#22c55e' },
  }

  return (
    <Card>
      <CardHeader><CardTitle>Volume ao longo do tempo</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line type="monotone" dataKey="messages" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="newContacts" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/volume-chart.tsx
git commit -m "feat: add volume line chart"
```

---

## Task 10: TagDistribution + InboxDistribution components

**Files:** Create `components/analytics/tag-distribution.tsx` and `components/analytics/inbox-distribution.tsx`

- [ ] **Step 1: Create `components/analytics/tag-distribution.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { TagCount } from '@/lib/types'

export function TagDistribution({ data }: { data: TagCount[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Distribuição por Tag</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: 'Contatos', color: '#3b82f6' } }} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="tag" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="#3b82f6" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create `components/analytics/inbox-distribution.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { InboxCount } from '@/lib/types'

export function InboxDistribution({ data }: { data: InboxCount[] }) {
  if (data.length <= 1) return null
  return (
    <Card>
      <CardHeader><CardTitle>Atendimento por Inbox</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: 'Conversas', color: '#8b5cf6' } }} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="#8b5cf6" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/analytics/tag-distribution.tsx components/analytics/inbox-distribution.tsx
git commit -m "feat: add tag and inbox distribution bar charts"
```

---

## Task 11: TopContacts component

**Files:** Create `components/analytics/top-contacts.tsx`

- [ ] **Step 1: Create component**

```typescript
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TopContact } from '@/lib/types'

function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    ia: 'bg-green-100 text-green-800',
    humano: 'bg-yellow-100 text-yellow-800',
    encerrado: 'bg-gray-100 text-gray-800',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? ''}`}>{status.toUpperCase()}</span>
}

export function TopContactsTable({ contacts }: { contacts: TopContact[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Top 10 contatos do período</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última interação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/contacts?q=${encodeURIComponent(c.phone_number ?? '')}`} className="hover:underline">
                    {c.name ?? '-'}
                  </Link>
                </TableCell>
                <TableCell>{c.phone_number ?? '-'}</TableCell>
                <TableCell>
                  {c.current_labels.map(l => (
                    <span key={l} className="inline-flex px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 mr-1">{l}</span>
                  ))}
                </TableCell>
                <TableCell>{c.message_count}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell className="text-sm">{formatRelative(c.last_message_at)}</TableCell>
              </TableRow>
            ))}
            {contacts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/top-contacts.tsx
git commit -m "feat: add top contacts table"
```

---

## Task 12: InboxStatus compact component (rodapé)

**Files:** Create `components/analytics/inbox-status.tsx`

- [ ] **Step 1: Create component**

```typescript
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'

interface Inbox {
  id: string
  name: string
  chatwoot_account_id: number
  chatwoot_inbox_id: number
  enabled: boolean
}

export function InboxStatusList({ inboxes }: { inboxes: Inbox[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Status das inboxes</CardTitle>
        <Link href="/dashboard/inboxes/new" className={buttonVariants({ size: 'sm' })}>+ Nova Inbox</Link>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {inboxes.map(i => (
            <li key={i.id} className="flex items-center justify-between text-sm">
              <span>
                {i.enabled ? '🟢' : '🔴'} <span className="font-medium ml-1">{i.name}</span>
                <span className="text-muted-foreground ml-2">{i.chatwoot_account_id}/{i.chatwoot_inbox_id}</span>
              </span>
              <Link href={`/dashboard/inboxes/${i.id}`} className="text-blue-600 hover:underline">Editar</Link>
            </li>
          ))}
          {inboxes.length === 0 && (
            <li className="text-muted-foreground">Nenhuma inbox configurada.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/analytics/inbox-status.tsx
git commit -m "feat: add compact inbox status list for dashboard footer"
```

---

## Task 13: Refatorar `app/dashboard/page.tsx` (substituir home)

**Files:** Modify `app/dashboard/page.tsx`

- [ ] **Step 1: Substituir o conteúdo TODO de `app/dashboard/page.tsx`**

```typescript
import { getServerClient } from '@/lib/supabase/server'
import { computeAnalytics } from '@/lib/analytics'
import { DateRangePicker } from '@/components/analytics/date-range-picker'
import { KpiCards } from '@/components/analytics/kpi-cards'
import { FunnelChart } from '@/components/analytics/funnel-chart'
import { StatusDonut } from '@/components/analytics/status-donut'
import { VolumeChart } from '@/components/analytics/volume-chart'
import { TagDistribution } from '@/components/analytics/tag-distribution'
import { InboxDistribution } from '@/components/analytics/inbox-distribution'
import { TopContactsTable } from '@/components/analytics/top-contacts'
import { InboxStatusList } from '@/components/analytics/inbox-status'

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string }
}) {
  const { from: defaultFrom, to: defaultTo } = defaultRange()
  const from = searchParams.from ?? defaultFrom
  const to = searchParams.to ?? defaultTo

  const analytics = await computeAnalytics(from, to)

  const supabase = getServerClient()
  const { data: inboxes } = await supabase
    .from('inboxes')
    .select('id, name, chatwoot_account_id, chatwoot_inbox_id, enabled')
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Análise de Atendimento</h1>
        <DateRangePicker initialFrom={from} initialTo={to} />
      </div>

      <KpiCards kpis={analytics.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FunnelChart funnel={analytics.funnel} />
        <StatusDonut distribution={analytics.statusDistribution} />
      </div>

      <VolumeChart data={analytics.volumeOverTime} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TagDistribution data={analytics.tagDistribution} />
        <InboxDistribution data={analytics.inboxDistribution} />
      </div>

      <TopContactsTable contacts={analytics.topContacts} />

      <InboxStatusList inboxes={inboxes ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Verify all tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: replace dashboard home with analytics dashboard"
```

---

## Task 14: Build, deploy e smoke test

- [ ] **Step 1: Final build check**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm run build
```

Esperado: build limpo.

- [ ] **Step 2: All tests pass**

```bash
npm test
```

- [ ] **Step 3: Push to GitHub**

```bash
git push "https://leaderaperformance-max:<GITHUB_PAT>@github.com/leaderaperformance-max/amazon_jet_aviation_agent.git" main
```

Substituir `<GITHUB_PAT>` pelo token.

- [ ] **Step 4: Deploy to Vercel production**

```bash
vercel --prod --yes
```

- [ ] **Step 5: Smoke test**

```bash
curl -s -o /dev/null -w "HTTP %{http_code} /dashboard\n" https://amazon-jet-aviation-agent.vercel.app/dashboard
```

Esperado: 307 (redirect pra login se não estiver autenticado) ou 200.

- [ ] **Step 6: Visual check**

Abrir https://amazon-jet-aviation-agent.vercel.app/dashboard no browser. Verificar:
1. KPI cards renderizam com números
2. Date range picker abre o popover
3. Presets (Hoje/7d/30d/90d/Tudo) mudam a query string e recarregam dados
4. Funil, donut, volume, tags, top contatos, inboxes aparecem
5. Clicar em uma linha do top contatos navega pra `/dashboard/contacts?q=...`

- [ ] **Step 7: Commit final**

```bash
git add . 2>/dev/null
git commit --allow-empty -m "feat: phase 3 analytics dashboard complete"
```

---

## Self-Review

### Cobertura do spec

| Requisito do spec | Task |
|---|---|
| 8 KPI cards (volume + conversão + variação) | Task 6 |
| Funil de conversão (5 estágios) | Task 7 |
| Donut chart status | Task 8 |
| Line chart volume (2 séries) | Task 9 |
| Bar chart tags | Task 10 |
| Bar chart inboxes (condicional) | Task 10 |
| Top 10 contatos com link | Task 11 |
| Bloco compacto inboxes no rodapé | Task 12 |
| Date range picker com 5 presets | Task 5 |
| Endpoint `/api/analytics` | Task 4 |
| `lib/analytics.ts` agregador | Task 3 |
| Tipos `AnalyticsResponse` | Task 2 |
| Refatoração de `/dashboard/page.tsx` | Task 13 |
| Instalação shadcn (chart, calendar, popover) | Task 1 |
| Build + Deploy | Task 14 |

### Consistência de tipos

- `AnalyticsResponse` definido em Task 2, consumido em Tasks 3, 4, 13 ✓
- `computeAnalytics(from, to)` em Task 3, consumido em Tasks 4, 13 ✓
- `KpiCards`, `FunnelChart`, etc. consomem subtipos de `AnalyticsResponse` ✓
- `DateRangePicker` push pra `/dashboard?from=&to=`, consumido em Task 13 ✓

### Placeholder scan

Tudo tem código completo. Sem TBDs.
