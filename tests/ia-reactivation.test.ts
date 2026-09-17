import { describe, it, expect, vi, beforeEach } from 'vitest'

const { upsert, addLabelMock } = vi.hoisted(() => ({
  upsert: vi.fn(),
  addLabelMock: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn(() => ({ from: vi.fn(() => ({ upsert })) })) }))
vi.mock('@/lib/tags', () => ({ addLabel: addLabelMock }))

import { isReactivationCommand, reactivateAI } from '@/lib/ia-reactivation'

const cfg = { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' }

beforeEach(() => {
  vi.clearAllMocks()
  upsert.mockResolvedValue({ error: null })
  addLabelMock.mockResolvedValue(['atendimento_ia'])
})

describe('comando "#ia" na nota privada', () => {
  it('aceita as formas naturais', () => {
    expect(isReactivationCommand('#ia')).toBe(true)
    expect(isReactivationCommand('#IA')).toBe(true)
    expect(isReactivationCommand('  #ia  ')).toBe(true)
    expect(isReactivationCommand('pode voltar #ia')).toBe(true)
    expect(isReactivationCommand('#ia assume aqui')).toBe(true)
    expect(isReactivationCommand('#ia.')).toBe(true)
  })

  it('não dispara com texto parecido', () => {
    expect(isReactivationCommand('ia')).toBe(false)
    expect(isReactivationCommand('#iate')).toBe(false)
    expect(isReactivationCommand('via#ia')).toBe(false)
    expect(isReactivationCommand('#iá')).toBe(false)
    expect(isReactivationCommand('cliente pediu a IA')).toBe(false)
    expect(isReactivationCommand(null)).toBe(false)
  })
})

describe('reactivateAI', () => {
  it('grava a reativação e devolve a etiqueta atendimento_ia', async () => {
    await reactivateAI({ sessionId: '5562984689607@s.whatsapp.net', conversationId: 304, labels: ['orçamento_pendente'], chatwootCfg: cfg, by: 'Alessandra Gomes' })

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: '5562984689607@s.whatsapp.net', conversation_id: 304, reactivated_by: 'Alessandra Gomes', reactivated_at: expect.any(String) }),
      { onConflict: 'session_id' },
    )
    expect(addLabelMock).toHaveBeenCalledWith(cfg, 304, ['orçamento_pendente'], 'atendimento_ia')
  })

  it('NUNCA manda mensagem nenhuma pelo Chatwoot (nada pode vazar pro WhatsApp do cliente)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    await reactivateAI({ sessionId: 's', conversationId: 1, labels: [], chatwootCfg: cfg, by: null })
    expect(fetchSpy).not.toHaveBeenCalled() // só grava no banco + etiqueta (mockada)
    fetchSpy.mockRestore()
  })

  it('falha ao gravar → lança', async () => {
    upsert.mockResolvedValue({ error: { message: 'db down' } })
    await expect(reactivateAI({ sessionId: 's', conversationId: 1, labels: [], chatwootCfg: cfg, by: null })).rejects.toThrow()
  })

  it('etiqueta falhando não desfaz a reativação', async () => {
    addLabelMock.mockRejectedValue(new Error('chatwoot 500'))
    await expect(reactivateAI({ sessionId: 's', conversationId: 1, labels: [], chatwootCfg: cfg, by: null })).resolves.toBeUndefined()
    expect(upsert).toHaveBeenCalled()
  })
})
