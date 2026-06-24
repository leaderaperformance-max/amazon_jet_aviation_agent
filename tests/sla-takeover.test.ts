import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleSlaTakeover } from '@/lib/qstash'

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
