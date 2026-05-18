import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn() }))
vi.mock('@/lib/contacts', () => ({
  getContactById: vi.fn(),
}))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))

import { generateSummary } from '@/lib/summarize'
import { generateText } from 'ai'
import { loadHistory } from '@/lib/memory'
import { getContactById } from '@/lib/contacts'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGenerate = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockGetContact = getContactById as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>
const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

describe('generateSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetContact.mockResolvedValue({
      id: 'c1', whatsapp_identifier: '5511999@s.whatsapp.net', name: 'João',
    })
    mockLoadHistory.mockResolvedValue([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ])
    mockLoadOpenAI.mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' })
    mockGenerate.mockResolvedValue({ text: '• João pediu PN\n• Aguardando cotação' })

    const updateChain = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateChain }),
    })
  })

  it('lança erro se contato não existe', async () => {
    mockGetContact.mockResolvedValue(null)
    await expect(generateSummary('nope')).rejects.toThrow('Contato não encontrado')
  })

  it('lança erro se contato não tem whatsapp_identifier', async () => {
    mockGetContact.mockResolvedValue({ id: 'c1', whatsapp_identifier: null })
    await expect(generateSummary('c1')).rejects.toThrow('whatsapp_identifier ausente')
  })

  it('gera resumo, salva no contato e retorna', async () => {
    const result = await generateSummary('c1')
    expect(mockLoadHistory).toHaveBeenCalledWith('5511999@s.whatsapp.net')
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Resuma'),
        prompt: expect.stringContaining('oi'),
      })
    )
    expect(result.summary).toBe('• João pediu PN\n• Aguardando cotação')
  })
})
