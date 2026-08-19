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
    // O banco devolve DESC (mais recente primeiro); loadHistory inverte pra cronológico.
    const mockLimit = vi.fn().mockResolvedValue({
      data: [
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
    // CRÍTICO: tem que buscar as mensagens MAIS RECENTES (DESC). Com ascending:true o
    // modelo recebia as 25 mensagens mais ANTIGAS da sessão — em conversas longas ele
    // via meses atrás e perdia o que o cliente falou minutos antes (PN de outro cliente
    // vazando na cotação, perguntas repetidas).
    expect(mockOrder).toHaveBeenCalledWith('id', { ascending: false })
    expect(mockLimit).toHaveBeenCalledWith(25)
  })

  it('conversa longa: entrega as mensagens RECENTES em ordem cronológica (bug do PN trocado)', async () => {
    // Simula a sessão de um revendedor com meses de histórico: o banco devolve DESC.
    // O modelo TEM que receber a conversa de hoje, não a de dois meses atrás.
    const desc = [
      { id: 3557, session_id: 's', message: { type: 'human', content: 'S1915-S, uma quantidade' } },
      { id: 3556, session_id: 's', message: { type: 'ai', content: 'Preciso do Part Number.' } },
      { id: 600, session_id: 's', message: { type: 'ai', content: 'Recebi seu PN K10-00280-01!' } },
    ]
    const mockLimit = vi.fn().mockResolvedValue({ data: desc, error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) })

    const result = await loadHistory('s')

    // cronológico: antiga → recente, e a ÚLTIMA é a mensagem mais nova
    expect(result.map(r => r.content)).toEqual([
      'Recebi seu PN K10-00280-01!',
      'Preciso do Part Number.',
      'S1915-S, uma quantidade',
    ])
    expect(result[result.length - 1].content).toContain('S1915-S')
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
