import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureClientConversation } from '@/lib/chatwoot-outbound'

const cfg = { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' }

describe('ensureClientConversation', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('não encontrado → busca, cria contato e conversa (3 chamadas)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ payload: [] }) }) // search vazio
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ payload: { contact: { id: 55 } } }) }) // create
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 900 }) }) // conversation
    vi.stubGlobal('fetch', fetchMock)
    const r = await ensureClientConversation(cfg, { phone: '5595999', name: 'João', inboxId: 45 })
    expect(r).toEqual({ contactId: 55, conversationId: 900 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('contato já existe → reusa (busca + conversa, sem criar)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ payload: [{ id: 77 }] }) }) // search achou
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 901 }) }) // conversation
    vi.stubGlobal('fetch', fetchMock)
    const r = await ensureClientConversation(cfg, { phone: '5595999', name: 'João', inboxId: 45 })
    expect(r).toEqual({ contactId: 77, conversationId: 901 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
