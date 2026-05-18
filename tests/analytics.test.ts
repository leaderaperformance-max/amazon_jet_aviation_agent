import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}))

import { computeAnalytics } from '@/lib/analytics'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

// Helper: create a thenable query builder that always resolves to fixed data
function makeQueryBuilder(data: unknown[]) {
  const builder: Record<string, unknown> = {}
  // every chain method returns the same builder
  const methods = ['select', 'eq', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'in', 'contains', 'not', 'or', 'overlaps']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  // Make it awaitable
  builder.then = (cb: (r: { data: unknown[]; error: null; count: number }) => unknown) =>
    Promise.resolve({ data, error: null, count: data.length }).then(cb)
  return builder
}

function mockSupabase(tables: Record<string, unknown[]>) {
  mockGetAdminClient.mockReturnValue({
    from: vi.fn((table: string) => makeQueryBuilder(tables[table] ?? [])),
  })
}

describe('computeAnalytics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna estrutura completa com zeros quando não há dados', async () => {
    mockSupabase({ contacts: [], memory_chat_amazon_jet: [], inboxes: [] })

    const result = await computeAnalytics('2026-04-17', '2026-05-17')

    expect(result.kpis.newContacts).toBe(0)
    expect(result.kpis.receivedMessages).toBe(0)
    expect(result.kpis.leadsWon).toBe(0)
    expect(result.kpis.leadsLost).toBe(0)
    expect(result.kpis.conversionRate).toBe(0)
    expect(result.kpis.activeNow).toBe(0)
    expect(result.funnel).toHaveLength(5)
    expect(result.funnel[0]).toEqual({ stage: 'novo_lead', count: 0, conversionFromPrev: null })
    expect(result.statusDistribution).toEqual({ ia: 0, humano: 0, encerrado: 0 })
    expect(result.volumeOverTime).toEqual([])
    expect(result.tagDistribution).toHaveLength(7)
    expect(result.topContacts).toEqual([])
  })

  it('conta corretamente leads ganhos, perdidos e taxa de conversão', async () => {
    const contacts = [
      { id: '1', inbox_id: 'i1', name: 'A', phone_number: '+1', current_labels: ['lead_ganho'], status: 'encerrado', message_count: 5, first_seen_at: '2026-05-10', last_message_at: '2026-05-12' },
      { id: '2', inbox_id: 'i1', name: 'B', phone_number: '+2', current_labels: ['lead_ganho'], status: 'encerrado', message_count: 3, first_seen_at: '2026-05-11', last_message_at: '2026-05-12' },
      { id: '3', inbox_id: 'i1', name: 'C', phone_number: '+3', current_labels: ['lead_perdido'], status: 'encerrado', message_count: 2, first_seen_at: '2026-05-12', last_message_at: '2026-05-12' },
    ]
    mockSupabase({ contacts, memory_chat_amazon_jet: [], inboxes: [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')

    expect(result.kpis.newContacts).toBe(3)
    expect(result.kpis.leadsWon).toBe(2)
    expect(result.kpis.leadsLost).toBe(1)
    expect(result.kpis.conversionRate).toBeCloseTo(2 / 3, 2)
  })

  it('computa distribuição por status', async () => {
    const contacts = [
      { id: '1', inbox_id: 'i', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '2', inbox_id: 'i', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '3', inbox_id: 'i', current_labels: [], status: 'humano', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '4', inbox_id: 'i', current_labels: [], status: 'encerrado', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
    ]
    mockSupabase({ contacts, memory_chat_amazon_jet: [], inboxes: [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    expect(result.statusDistribution).toEqual({ ia: 2, humano: 1, encerrado: 1 })
  })

  it('computa funil de conversão com taxas entre estágios', async () => {
    const contacts = [
      { id: '1', inbox_id: 'i', current_labels: ['novo_lead', 'aguardando_pn', 'pendente_orcamento'], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '2', inbox_id: 'i', current_labels: ['novo_lead', 'aguardando_pn'], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: '3', inbox_id: 'i', current_labels: ['novo_lead'], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
    ]
    mockSupabase({ contacts, memory_chat_amazon_jet: [], inboxes: [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')

    expect(result.funnel[0]).toEqual({ stage: 'novo_lead', count: 3, conversionFromPrev: null })
    expect(result.funnel[1].stage).toBe('aguardando_pn')
    expect(result.funnel[1].count).toBe(2)
    expect(result.funnel[1].conversionFromPrev).toBeCloseTo(2 / 3, 2)
    expect(result.funnel[2].count).toBe(1)
  })

  it('agrupa mensagens por dia para volumeOverTime', async () => {
    const messages = [
      { created_at: '2026-05-15T10:00:00Z', message: { type: 'human', content: 'oi' }, session_id: 's1' },
      { created_at: '2026-05-15T11:00:00Z', message: { type: 'human', content: 'tudo bem?' }, session_id: 's1' },
      { created_at: '2026-05-16T09:00:00Z', message: { type: 'human', content: 'olá' }, session_id: 's2' },
      { created_at: '2026-05-16T10:00:00Z', message: { type: 'ai', content: 'Oi, como posso ajudar?' }, session_id: 's2' },
    ]
    mockSupabase({ contacts: [], memory_chat_amazon_jet: messages, inboxes: [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')

    const may15 = result.volumeOverTime.find(v => v.date === '2026-05-15')
    const may16 = result.volumeOverTime.find(v => v.date === '2026-05-16')
    expect(may15?.messages).toBe(2)
    expect(may16?.messages).toBe(1) // ai not counted
  })

  it('exclui mensagens [atendente]: de receivedMessages', async () => {
    const messages = [
      { created_at: '2026-05-15T10:00:00Z', message: { type: 'human', content: 'oi' }, session_id: 's1' },
      { created_at: '2026-05-15T10:01:00Z', message: { type: 'human', content: '[atendente]: olá' }, session_id: 's1' },
    ]
    mockSupabase({ contacts: [], memory_chat_amazon_jet: messages, inboxes: [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    expect(result.kpis.receivedMessages).toBe(1)
  })

  it('top contatos retorna até 10 ordenados por message_count desc', async () => {
    const contacts = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`, inbox_id: 'i', name: `User ${i}`, phone_number: `+${i}`,
      current_labels: [], status: 'ia', message_count: 20 - i,
      first_seen_at: '2026-05-10', last_message_at: '2026-05-10',
    }))
    mockSupabase({ contacts, memory_chat_amazon_jet: [], inboxes: [] })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    expect(result.topContacts).toHaveLength(10)
    expect(result.topContacts[0].message_count).toBe(20)
    expect(result.topContacts[9].message_count).toBe(11)
  })

  it('distribuição por inbox usa nomes da tabela inboxes', async () => {
    const contacts = [
      { id: 'a', inbox_id: 'in-1', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: 'b', inbox_id: 'in-1', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
      { id: 'c', inbox_id: 'in-2', current_labels: [], status: 'ia', message_count: 1, first_seen_at: '2026-05-10', last_message_at: '2026-05-10', name: '', phone_number: '' },
    ]
    const inboxes = [
      { id: 'in-1', name: 'Amazon Jet' },
      { id: 'in-2', name: 'LeaderaPerformance' },
    ]
    mockSupabase({ contacts, memory_chat_amazon_jet: [], inboxes })

    const result = await computeAnalytics('2026-05-01', '2026-05-17')
    const aj = result.inboxDistribution.find(i => i.name === 'Amazon Jet')
    const lp = result.inboxDistribution.find(i => i.name === 'LeaderaPerformance')
    expect(aj?.count).toBe(2)
    expect(lp?.count).toBe(1)
  })
})
