import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))
vi.mock('@/lib/inboxes', () => ({
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' }),
}))

import { validatePartNumber } from '@/lib/part-number'
import { generateText } from 'ai'

const mockGenerate = generateText as ReturnType<typeof vi.fn>

describe('validatePartNumber', () => {
  beforeEach(() => vi.clearAllMocks())

  it('regex MIL-SPEC MS retorna valid high confidence', async () => {
    const result = await validatePartNumber('MS21266-2N')
    expect(result.valid).toBe(true)
    expect(result.format).toContain('MIL-SPEC MS')
    expect(result.confidence).toBe('high')
    expect(result.normalized).toBe('MS21266-2N')
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('regex MIL-SPEC AN retorna valid (lowercase entrada)', async () => {
    const result = await validatePartNumber('an3-5a')
    expect(result.valid).toBe(true)
    expect(result.format).toContain('MIL-SPEC AN')
    expect(result.normalized).toBe('AN3-5A')
  })

  it('regex NSN retorna valid', async () => {
    const result = await validatePartNumber('5306-00-123-4567')
    expect(result.valid).toBe(true)
    expect(result.format).toBe('NSN')
  })

  it('regex Garmin retorna valid', async () => {
    const result = await validatePartNumber('010-00696-01')
    expect(result.valid).toBe(true)
    expect(result.format).toBe('Garmin')
  })

  it('texto sem dígitos retorna invalid sem chamar LLM', async () => {
    const result = await validatePartNumber('olá tudo bem')
    expect(result.valid).toBe(false)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('texto muito curto retorna invalid sem chamar LLM', async () => {
    const result = await validatePartNumber('A1')
    expect(result.valid).toBe(false)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('fallback LLM quando regex não bate', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        valid: true, format: 'Honeywell', manufacturer: 'Honeywell',
        confidence: 'medium', normalized: 'BCFA1-100-1',
        reason: 'Formato compatível Honeywell',
      }),
    })

    const result = await validatePartNumber('bcfa1-100-1')
    expect(result.valid).toBe(true)
    expect(result.format).toBe('Honeywell')
    expect(mockGenerate).toHaveBeenCalledOnce()
  })

  it('LLM retorna invalid pra texto genérico', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        valid: false, format: 'Invalid', manufacturer: null,
        confidence: 'high', normalized: 'UMA-PECA-QUALQUER1',
        reason: 'Texto genérico sem padrão de PN',
      }),
    })

    const result = await validatePartNumber('uma-peca-qualquer1')
    expect(result.valid).toBe(false)
  })

  it('LLM com JSON malformado retorna invalid low confidence', async () => {
    mockGenerate.mockResolvedValue({ text: 'this is not json' })
    const result = await validatePartNumber('xyz-987')
    expect(result.valid).toBe(false)
    expect(result.confidence).toBe('low')
  })
})
