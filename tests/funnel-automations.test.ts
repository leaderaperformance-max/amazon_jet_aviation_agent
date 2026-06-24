import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => (m: string) => `mock-${m}`) }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]), saveMessage: vi.fn() }))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' }) }))

import { generateStageMessage, STAGE_PROMPTS } from '@/lib/funnel-automations'
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
