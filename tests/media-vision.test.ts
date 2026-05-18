import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))
vi.mock('@/lib/inboxes', () => ({
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' }),
}))

import { analyzeImage } from '@/lib/media/vision'
import { generateText } from 'ai'

const mockGenerate = generateText as ReturnType<typeof vi.fn>

describe('analyzeImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama generateText com modelo gpt-4o e imagem em base64', async () => {
    mockGenerate.mockResolvedValue({ text: '• Etiqueta: PN MS21266-2N\n• Fabricante: AN/MS/NAS' })

    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    const result = await analyzeImage(buffer, 'image/jpeg')

    expect(result).toBe('• Etiqueta: PN MS21266-2N\n• Fabricante: AN/MS/NAS')
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mocked-gpt-4o',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'image' }),
            ]),
          }),
        ]),
      })
    )
  })
})
