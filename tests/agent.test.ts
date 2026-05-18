import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
  tool: vi.fn((cfg: unknown) => cfg),
  stepCountIs: vi.fn((n: number) => ({ _stopAt: n })),
}))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))

import { runAgent } from '@/lib/agent'
import { generateText } from 'ai'
import { loadHistory, saveMessage } from '@/lib/memory'

const mockGenerate = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>

describe('runAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama generateText com tools fornecidos', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValue({ text: 'Reply' })

    const tools = { add_label: { description: 'x' }, remove_label: { description: 'y' } }

    await runAgent('session-1', 'oi', 'PROMPT', 'sk', 'gpt-4o-mini', tools as unknown as Record<string, never>)

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
        messages: [{ role: 'user', content: 'oi' }],
      })
    )
  })

  it('funciona sem tools (param opcional)', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValue({ text: 'Reply' })

    await runAgent('session-1', 'oi', 'PROMPT', 'sk', 'gpt-4o-mini')

    const call = mockGenerate.mock.calls[0][0]
    expect(call.tools).toBeUndefined()
  })

  it('salva user e assistant, retorna text', async () => {
    mockLoadHistory.mockResolvedValue([{ role: 'user', content: 'antigo' }])
    mockGenerate.mockResolvedValue({ text: 'Resposta' })

    const result = await runAgent('s', 'nova', 'PROMPT', 'sk', 'gpt-4o-mini')

    expect(mockSaveMessage).toHaveBeenCalledWith('s', 'user', 'nova')
    expect(mockSaveMessage).toHaveBeenCalledWith('s', 'assistant', 'Resposta')
    expect(result).toBe('Resposta')
  })
})
