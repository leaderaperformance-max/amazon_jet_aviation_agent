import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadHistory, saveMessage } from '@/lib/memory'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const mockFrom = supabase.from as ReturnType<typeof vi.fn>

describe('loadHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps rows correctly with array content for human and string content for ai', async () => {
    const mockLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1,
          session_id: 'sess-1',
          message: {
            type: 'human',
            content: '["hello","world"]',
            additional_kwargs: {},
            response_metadata: {},
          },
        },
        {
          id: 2,
          session_id: 'sess-1',
          message: {
            type: 'ai',
            content: 'Olá! Aqui é o Jet...',
            tool_calls: [],
            additional_kwargs: {},
            response_metadata: {},
            invalid_tool_calls: [],
          },
        },
      ],
      error: null,
    })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const result = await loadHistory('sess-1')

    expect(result).toEqual([
      { role: 'user', content: 'hello\nworld' },
      { role: 'assistant', content: 'Olá! Aqui é o Jet...' },
    ])
    expect(mockFrom).toHaveBeenCalledWith('memory_chat_amazon_jet')
    expect(mockEq).toHaveBeenCalledWith('session_id', 'sess-1')
    expect(mockOrder).toHaveBeenCalledWith('id', { ascending: true })
    expect(mockLimit).toHaveBeenCalledWith(25)
  })

  it('returns empty array when no rows found', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ select: mockSelect })

    const result = await loadHistory('sess-empty')

    expect(result).toEqual([])
  })
})

describe('saveMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts human format JSONB for role user', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert: mockInsert })

    await saveMessage('sess-1', 'user', 'hello there')

    expect(mockFrom).toHaveBeenCalledWith('memory_chat_amazon_jet')
    expect(mockInsert).toHaveBeenCalledWith({
      session_id: 'sess-1',
      message: {
        type: 'human',
        content: 'hello there',
        additional_kwargs: {},
        response_metadata: {},
      },
    })
  })

  it('inserts ai format JSONB for role assistant', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert: mockInsert })

    await saveMessage('sess-1', 'assistant', 'Olá! Aqui é o Jet...')

    expect(mockFrom).toHaveBeenCalledWith('memory_chat_amazon_jet')
    expect(mockInsert).toHaveBeenCalledWith({
      session_id: 'sess-1',
      message: {
        type: 'ai',
        content: 'Olá! Aqui é o Jet...',
        tool_calls: [],
        additional_kwargs: {},
        response_metadata: {},
        invalid_tool_calls: [],
      },
    })
  })
})
