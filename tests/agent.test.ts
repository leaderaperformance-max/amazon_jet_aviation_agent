import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAgent } from '@/lib/agent'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn(() => 'mocked-model') }))
vi.mock('@/lib/prompt', () => ({ getSystemPrompt: vi.fn(() => 'mocked-system-prompt') }))

import { generateText } from 'ai'
import { loadHistory, saveMessage } from '@/lib/memory'

const mockGenerateText = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>

describe('runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadHistory.mockResolvedValue([
      { role: 'user', content: 'previous message' },
      { role: 'assistant', content: 'previous reply' },
    ])
    mockGenerateText.mockResolvedValue({ text: 'Mock reply from JET.' })
    mockSaveMessage.mockResolvedValue(undefined)
  })

  it('calls loadHistory with the sessionId', async () => {
    await runAgent('session-id', 'user message')
    expect(mockLoadHistory).toHaveBeenCalledWith('session-id')
  })

  it('calls generateText with messages array containing history + new user message', async () => {
    await runAgent('session-id', 'user message')
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'previous message' },
          { role: 'assistant', content: 'previous reply' },
          { role: 'user', content: 'user message' },
        ],
      })
    )
  })

  it('calls saveMessage twice: once with user role, once with assistant role', async () => {
    await runAgent('session-id', 'user message')
    expect(mockSaveMessage).toHaveBeenCalledTimes(2)
    expect(mockSaveMessage).toHaveBeenCalledWith('session-id', 'user', 'user message')
    expect(mockSaveMessage).toHaveBeenCalledWith('session-id', 'assistant', 'Mock reply from JET.')
  })

  it('returns the text from generateText', async () => {
    const result = await runAgent('session-id', 'user message')
    expect(result).toBe('Mock reply from JET.')
  })
})
