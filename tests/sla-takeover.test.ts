import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleSlaTakeover } from '@/lib/qstash'
import { classifyActivitySince } from '@/lib/sla-takeover'

const { memRows, getAdminMock } = vi.hoisted(() => {
  const memRows: Array<{ message: { type: string; content: string }; created_at: string }> = []
  const getAdminMock = vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: memRows, error: null }),
    })),
  }))
  return { memRows, getAdminMock }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: getAdminMock }))

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
