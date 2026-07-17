import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/chatwoot-outbound', () => ({ ensureClientConversation: vi.fn() }))
vi.mock('@/lib/chatwoot-send', () => ({ sendChatwootReply: vi.fn() }))
vi.mock('@/lib/memory', () => ({ saveMessage: vi.fn() }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))
vi.mock('@/lib/tags', () => ({ addLabel: vi.fn() }))

import { buildProactiveMessage, reachOutToClient } from '@/lib/proactive-client'
import { ensureClientConversation } from '@/lib/chatwoot-outbound'
import { sendChatwootReply } from '@/lib/chatwoot-send'
import { saveMessage } from '@/lib/memory'
import { addLabel } from '@/lib/tags'

describe('buildProactiveMessage', () => {
  it('cita o consultor e lista os PNs', () => {
    const m = buildProactiveMessage({ clientName: 'João', resellerName: 'Anderson', items: [{ part_number: 'ABC', quantity: '2' }] })
    expect(m).toContain('João')
    expect(m).toContain('Anderson')
    expect(m).toContain('ABC')
    expect(m).toContain('Amazon Jet Aviation')
  })
  it('resume quando muitos itens (>6)', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ part_number: `P${i}`, quantity: '1' }))
    const m = buildProactiveMessage({ clientName: 'João', resellerName: 'Anderson', items })
    expect(m).toContain('sua solicitação de cotação')
  })
})

describe('reachOutToClient', () => {
  beforeEach(() => vi.clearAllMocks())
  it('cria conversa, manda mensagem e semeia a memória', async () => {
    ;(ensureClientConversation as ReturnType<typeof vi.fn>).mockResolvedValue({ contactId: 1, conversationId: 900 })
    await reachOutToClient({
      chatwootCfg: { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' },
      inboxId: 45, clientPhone: '5595999', clientName: 'João', resellerName: 'Anderson',
      items: [{ part_number: 'ABC', quantity: '2' }],
    })
    expect(ensureClientConversation).toHaveBeenCalled()
    expect(sendChatwootReply).toHaveBeenCalledWith(expect.anything(), 900, expect.stringContaining('Anderson'))
    expect(saveMessage).toHaveBeenCalledWith('5595999', 'assistant', expect.stringContaining('Anderson'))
  })

  it('etiqueta a conversa do CLIENTE quando qualificationLabel é passada (dispara o card do funil)', async () => {
    ;(ensureClientConversation as ReturnType<typeof vi.fn>).mockResolvedValue({ contactId: 1, conversationId: 900 })
    await reachOutToClient({
      chatwootCfg: { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' },
      inboxId: 45, clientPhone: '5595999', clientName: 'João', resellerName: 'Anderson',
      items: [{ part_number: 'ABC', quantity: '2' }], qualificationLabel: 'orçamento_pendente',
    })
    expect(addLabel).toHaveBeenCalledWith(expect.anything(), 900, [], 'orçamento_pendente')
  })
})
