import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => (m: string) => `mock-${m}`) }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]), saveMessage: vi.fn() }))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' }) }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/chatwoot/funnel', () => ({ resolveFunnel: vi.fn(), listFunnelItems: vi.fn() }))

const { getAdminMock } = vi.hoisted(() => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { last_message_at: null }, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
  return { getAdminMock: vi.fn(() => ({ from: vi.fn(() => chain) })) }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: getAdminMock }))

import { stageForStep, STAGE_PROMPTS, runFunnelAutomations } from '@/lib/funnel-automations'
import { resolveFunnel, listFunnelItems } from '@/lib/chatwoot/funnel'
import { generateText } from 'ai'

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>

// Kanban real da conta 14 (funil 9, lido do Chatwoot em 26/10/2026).
const STEPS = [
  { id: 34, step_type: 'start', identifier: 'leads_novos', title: 'Leads Novos' },
  { id: 39, step_type: 'middle', identifier: 'oramento_pendente', title: 'Orçamento Pendente' },
  { id: 36, step_type: 'middle', identifier: 'oramento_enviado', title: 'Orçamento Enviado' },
  { id: 38, step_type: 'end', identifier: 'venda_fechada', title: 'Venda Fechada' },
]

beforeEach(() => vi.clearAllMocks())

describe('stageForStep: o texto vem da COLUNA, não do tipo da coluna', () => {
  it('"Orçamento Pendente" NÃO usa o texto de cotação já enviada', () => {
    expect(stageForStep(STEPS[1])).toBe('orcamento_pendente')
  })

  it('cada coluna do kanban cai no seu texto', () => {
    expect(STEPS.map(stageForStep)).toEqual([
      'leads_novos', 'orcamento_pendente', 'orcamento_enviado', 'venda_fechada',
    ])
  })

  it('coluna nova no meio, sem nome conhecido → texto neutro de "em cotação"', () => {
    // nunca pode afirmar que a cotação saiu pra quem talvez não tenha recebido
    expect(stageForStep({ id: 99, step_type: 'middle', identifier: 'triagem', title: 'Triagem' })).toBe('orcamento_pendente')
  })

  it('o texto de "Orçamento Pendente" fala em cotação em andamento, não em avaliar proposta', () => {
    expect(STAGE_PROMPTS.orcamento_pendente).toContain('ainda não saiu o orçamento')
    expect(STAGE_PROMPTS.orcamento_pendente).not.toContain('JÁ foi enviada')
  })
})

describe('runFunnelAutomations manda o texto certo pra cada coluna', () => {
  it('card parado em "Orçamento Pendente" recebe a mensagem de cotação em andamento', async () => {
    m(resolveFunnel).mockResolvedValue({
      funnelId: 9,
      steps: { start: 34, middle: 39, end: 38 },
      stepsByType: { start: [34], middle: [39, 36], end: [38] },
      stepList: STEPS,
    })
    const card = (id: number, stepId: number) => ({
      id, funnel_step_id: stepId, start_in_step: 0, amount: '0.0', status: 'active', label_list: [],
      contact: { identifier: `55${id}@s.whatsapp.net`, phone_number: null, name: 'Cliente' },
      conversation: { id, display_id: id, inbox_id: 45 },
    })
    m(listFunnelItems).mockImplementation(async (_cfg: unknown, _f: number, stepId: number) =>
      stepId === 39 ? [card(1, 39)] : stepId === 36 ? [card(2, 36)] : [])
    m(generateText).mockResolvedValue({ text: 'mensagem' })

    await runFunnelAutomations({ baseUrl: 'https://cw', accountId: 14, userToken: 't' },
      { quepasa_host: 'https://qp', quepasa_token: 't' }, 'amazon_jet_vendas', 2_000_000_000_000)

    const systems = m(generateText).mock.calls.map(c => c[0].system)
    expect(systems).toContain(STAGE_PROMPTS.orcamento_pendente)
    expect(systems).toContain(STAGE_PROMPTS.orcamento_enviado)
  })
})
