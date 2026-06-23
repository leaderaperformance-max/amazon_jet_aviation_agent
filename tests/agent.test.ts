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

// Safety net: gpt-4o-mini às vezes gera o texto de fechamento ("Dados enviados")
// SEM chamar envia_pn → lead perdido. runAgent detecta isso e força a tool.
describe('runAgent — safety net contra phantom send (envia_pn)', () => {
  beforeEach(() => vi.clearAllMocks())

  const tools = { envia_pn: { description: 'x' }, add_label: { description: 'y' } }

  it('PHANTOM: diz "Dados enviados" mas NÃO chamou envia_pn → força envia_pn', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate
      .mockResolvedValueOnce({
        text: 'Dados enviados ao AOG Desk. Especialista vai te contatar agora.',
        steps: [{ toolCalls: [] }],
      })
      .mockResolvedValueOnce({
        text: '',
        steps: [{ toolCalls: [{ toolName: 'envia_pn' }] }],
      })

    const result = await runAgent('s', '655234-6239, 1un, AOG', 'PROMPT', 'sk', 'gpt-4o-mini', tools as unknown as Record<string, never>)

    // detecção + recuperação forçada = 2 chamadas
    expect(mockGenerate).toHaveBeenCalledTimes(2)
    // 2a chamada força envia_pn
    expect(mockGenerate.mock.calls[1][0].toolChoice).toEqual({ type: 'tool', toolName: 'envia_pn' })
    // retorna o texto ORIGINAL de fechamento (já é verdadeiro agora que o lead foi criado)
    expect(result).toBe('Dados enviados ao AOG Desk. Especialista vai te contatar agora.')
  })

  it('detecta variações de claim ("recebi os dados", "receberá a cotação", "vou enviar os dados")', async () => {
    for (const phrase of [
      'Recebi os dados. Nosso especialista vai te retornar.',
      'Você receberá a cotação em até 48h úteis.',
      'Vou enviar os dados para o especialista.',
    ]) {
      vi.clearAllMocks()
      mockLoadHistory.mockResolvedValue([])
      mockGenerate
        .mockResolvedValueOnce({ text: phrase, steps: [{ toolCalls: [] }] })
        .mockResolvedValueOnce({ text: '', steps: [{ toolCalls: [{ toolName: 'envia_pn' }] }] })

      await runAgent('s', 'x', 'PROMPT', 'sk', 'gpt-4o-mini', tools as unknown as Record<string, never>)
      expect(mockGenerate, `phrase: ${phrase}`).toHaveBeenCalledTimes(2)
    }
  })

  it('OK: diz "Dados enviados" E chamou envia_pn → NÃO força segunda chamada', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValueOnce({
      text: 'Dados enviados ao AOG Desk.',
      steps: [{ toolCalls: [{ toolName: 'envia_pn' }] }],
    })

    await runAgent('s', 'x', 'PROMPT', 'sk', 'gpt-4o-mini', tools as unknown as Record<string, never>)
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('pergunta normal (sem claim de envio) → não força envia_pn', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValueOnce({
      text: 'Quantas unidades você precisa? E qual a urgência?',
      steps: [{ toolCalls: [] }],
    })

    await runAgent('s', 'x', 'PROMPT', 'sk', 'gpt-4o-mini', tools as unknown as Record<string, never>)
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('sem tool envia_pn disponível → nunca força (não quebra outros agentes)', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValueOnce({
      text: 'Dados enviados.',
      steps: [{ toolCalls: [] }],
    })

    await runAgent('s', 'x', 'PROMPT', 'sk', 'gpt-4o-mini', { add_label: { description: 'y' } } as unknown as Record<string, never>)
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })
})
