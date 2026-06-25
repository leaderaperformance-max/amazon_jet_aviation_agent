import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => (m: string) => `mock-${m}`) }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]), saveMessage: vi.fn() }))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' }) }))

const { insertMock, getAdminMock, dbResult } = vi.hoisted(() => {
  const insertMock = vi.fn().mockResolvedValue({ error: null })
  const dbResult = { value: { data: [] as unknown[], error: null as null | { message: string } } }
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => dbResult.value),
  }
  const getAdminMock = vi.fn(() => ({ from: vi.fn(() => ({ insert: insertMock, ...selectChain })) }))
  return { insertMock, getAdminMock, dbResult }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: getAdminMock }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn().mockResolvedValue(undefined) }))

import { generateStageMessage, STAGE_PROMPTS, isItemDue, processFunnelItem, wasAlreadySent } from '@/lib/funnel-automations'
import { generateText } from 'ai'

const mockGen = generateText as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe('generateStageMessage', () => {
  it('gera mensagem usando o prompt da etapa', async () => {
    mockGen.mockResolvedValue({ text: '  Olá! Seguimos buscando.  ' })
    const msg = await generateStageMessage('sess', 'leads_novos')
    expect(msg).toBe('Olá! Seguimos buscando.')
    expect(mockGen.mock.calls[0][0].system).toBe(STAGE_PROMPTS.leads_novos)
  })

  it('tem prompt pras 3 etapas', () => {
    expect(STAGE_PROMPTS.leads_novos).toBeTruthy()
    expect(STAGE_PROMPTS.orcamento_enviado).toBeTruthy()
    expect(STAGE_PROMPTS.venda_fechada).toBeTruthy()
  })
})

describe('isItemDue', () => {
  const NOW = 1_000_000 // segundos
  const base = {
    item: { status: 'active', start_in_step: NOW - 90_000, contact: { identifier: 'x@s.whatsapp.net' } },
    lastMessageAtMs: (NOW - 90_000) * 1000, // sem atividade desde que entrou
    thresholdSec: 86_400, // 24h
    alreadySent: false,
    nowMs: NOW * 1000,
  }

  it('dispara: parado > threshold, inativo > threshold, não enviado', () => {
    expect(isItemDue(base)).toBe(true)
  })
  it('não dispara se inativo < threshold (alguém falou recente)', () => {
    expect(isItemDue({ ...base, lastMessageAtMs: (NOW - 1000) * 1000 })).toBe(false)
  })
  it('não dispara se idade na etapa < threshold', () => {
    expect(isItemDue({ ...base, item: { ...base.item, start_in_step: NOW - 1000 } })).toBe(false)
  })
  it('não dispara se já enviado (dedup)', () => {
    expect(isItemDue({ ...base, alreadySent: true })).toBe(false)
  })
  it('não dispara se status != active', () => {
    expect(isItemDue({ ...base, item: { ...base.item, status: 'won' } })).toBe(false)
  })
  it('não dispara sem identifier', () => {
    expect(isItemDue({ ...base, item: { ...base.item, contact: { identifier: null } } })).toBe(false)
  })
})

describe('processFunnelItem', () => {
  it('gera msg, envia via quepasa e grava dedup', async () => {
    mockGen.mockResolvedValue({ text: 'Oi, seguimos buscando!' })
    const item = { id: 286, funnel_step_id: 34, start_in_step: 1, amount: '0.0', status: 'active', label_list: [], contact: { identifier: '55x@s.whatsapp.net', phone_number: '+55x', name: 'Leo' }, conversation: { id: 1, display_id: 100, inbox_id: 45 } }
    const inbox = { quepasa_host: 'https://qp', quepasa_token: 't' }
    const r = await processFunnelItem(item as never, 'leads_novos', inbox as never)
    expect(r.sent).toBe(true)
    expect(insertMock).toHaveBeenCalled()
  })
})

describe('dedup fail-closed', () => {
  it('wasAlreadySent → true quando o banco erra', async () => {
    dbResult.value = { data: null as unknown as unknown[], error: { message: 'boom' } }
    const r = await wasAlreadySent(1, 'leads_novos', 1)
    expect(r).toBe(true)
    dbResult.value = { data: [], error: null } // reset
  })
})
