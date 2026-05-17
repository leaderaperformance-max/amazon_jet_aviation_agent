import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))

import { runAgent } from '@/lib/agent'
import { generateText } from 'ai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { createOpenAI } from '@ai-sdk/openai'

const mockGenerateText = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>
const mockCreateOpenAI = createOpenAI as ReturnType<typeof vi.fn>

describe('runAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama generateText com prompt e modelo dados, salva user+assistant, retorna text', async () => {
    mockLoadHistory.mockResolvedValue([{ role: 'user', content: 'olá' }])
    mockGenerateText.mockResolvedValue({ text: 'Reply do JET' })

    const result = await runAgent(
      'session-1',
      'preciso de uma peça',
      'PROMPT_BASE com ${CURRENT_DATE}',
      'sk-test',
      'gpt-4o-mini'
    )

    expect(mockCreateOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test' })
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mocked-gpt-4o-mini',
        system: expect.stringContaining('PROMPT_BASE com'),
        messages: [
          { role: 'user', content: 'olá' },
          { role: 'user', content: 'preciso de uma peça' },
        ],
      })
    )
    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).not.toContain('${CURRENT_DATE}')

    expect(mockSaveMessage).toHaveBeenCalledWith('session-1', 'user', 'preciso de uma peça')
    expect(mockSaveMessage).toHaveBeenCalledWith('session-1', 'assistant', 'Reply do JET')
    expect(result).toBe('Reply do JET')
  })
})
