import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleSlaTakeover } from '@/lib/qstash'
import { classifyActivitySince, checkAndTakeover } from '@/lib/sla-takeover'
import { runAgent } from '@/lib/agent'

const { memRows, contactBox, getAdminMock } = vi.hoisted(() => {
  const memRows: Array<{ message: { type: string; content: string }; created_at: string }> = []
  const contactBox: { value: { id: string; current_labels: string[] } | null } = {
    value: { id: 'c1', current_labels: [] },
  }
  const chain = () => {
    const c: Record<string, unknown> = {}
    c.select = vi.fn(() => c)
    c.eq = vi.fn(() => c)
    c.update = vi.fn(() => c)
    c.gt = vi.fn(async () => ({ data: memRows, error: null }))
    c.maybeSingle = vi.fn(async () => ({ data: contactBox.value, error: null }))
    return c
  }
  const getAdminMock = vi.fn(() => ({ from: vi.fn(() => chain()) }))
  return { memRows, contactBox, getAdminMock }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: getAdminMock }))

vi.mock('@/lib/inboxes', () => ({
  loadInboxByChatwootId: vi.fn().mockResolvedValue({
    id: 'ix', chatwoot_base_url: 'https://c', chatwoot_account_id: 14, chatwoot_user_token: 'tk',
    quepasa_host: 'https://qp', quepasa_token: 't', system_prompt: 'P', enabled: true,
  }),
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' }),
}))
vi.mock('@/lib/tags', () => ({ addLabel: vi.fn().mockResolvedValue(['atendimento_ia']), removeLabel: vi.fn() }))
vi.mock('@/lib/agent', () => ({ runAgent: vi.fn().mockResolvedValue('Oi, assumindo!') }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))
vi.mock('@/lib/process-incoming', () => ({ buildAgentTools: vi.fn(() => ({ tools: {}, getLabels: () => [] })) }))

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.QSTASH_TOKEN = 'qt'
  process.env.APP_URL = 'https://app.example.com'
  process.env.CRON_SECRET = 'sec'
  process.env.QSTASH_URL = 'https://qstash.example.com'
})

describe('scheduleSlaTakeover', () => {
  it('publica no QStash com delay e callback pro /api/sla-takeover', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => '' } as Response)
    await scheduleSlaTakeover('sess@x', '2026-06-24T00:00:00Z', 900, { conversationId: 100, chatwootInboxId: 45 })
    const [url, opts] = spy.mock.calls[0]
    expect(String(url)).toContain('/v2/publish/https://app.example.com/api/sla-takeover?secret=sec')
    expect((opts as RequestInit).headers).toMatchObject({ 'Upstash-Delay': '900s' })
    expect(JSON.parse((opts as RequestInit).body as string)).toMatchObject({ sessionId: 'sess@x', conversationId: 100 })
  })
})

describe('classifyActivitySince', () => {
  it('detecta resposta humana ([atendente]:)', () => {
    expect(classifyActivitySince([{ type: 'human', content: '[atendente]: oi' }])).toBe('responded')
  })
  it('detecta resposta da IA', () => {
    expect(classifyActivitySince([{ type: 'ai', content: 'oi' }])).toBe('responded')
  })
  it('detecta nova mensagem do cliente (sem prefixo)', () => {
    expect(classifyActivitySince([{ type: 'human', content: 'mais uma duvida' }])).toBe('newer_inbound')
  })
  it('nada novo → silent', () => {
    expect(classifyActivitySince([])).toBe('silent')
  })
})

describe('checkAndTakeover', () => {
  it('NÃO assume se houve resposta', async () => {
    memRows.length = 0
    memRows.push({ message: { type: 'human', content: '[atendente]: ja respondi' }, created_at: 'x' })
    const r = await checkAndTakeover({ sessionId: 's@x', sinceAt: '2026-06-24T00:00:00Z', conversationId: 100, chatwootInboxId: 45 })
    expect(r.action).toBe('skipped_responded')
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('assume quando silencioso: roda agente com saveUserMessage:false', async () => {
    memRows.length = 0
    ;(runAgent as ReturnType<typeof vi.fn>).mockClear()
    const r = await checkAndTakeover({ sessionId: 's@x', sinceAt: '2026-06-24T00:00:00Z', conversationId: 100, chatwootInboxId: 45 })
    expect(r.action).toBe('took_over')
    expect(runAgent).toHaveBeenCalled()
    expect((runAgent as ReturnType<typeof vi.fn>).mock.calls[0][7]).toMatchObject({ saveUserMessage: false })
  })
})
