import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureClientConversation } from '@/lib/chatwoot-outbound'

const cfg = { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' }

describe('ensureClientConversation', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('cria contato + conversa e retorna os ids', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ payload: { contact: { id: 55 } } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 900 }) })
    vi.stubGlobal('fetch', fetchMock)
    const r = await ensureClientConversation(cfg, { phone: '5595999', name: 'João', inboxId: 45 })
    expect(r).toEqual({ contactId: 55, conversationId: 900 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
