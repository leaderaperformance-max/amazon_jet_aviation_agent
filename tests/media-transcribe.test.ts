import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/inboxes', () => ({
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' }),
}))

import { transcribeAudio } from '@/lib/media/transcribe'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('transcribeAudio', () => {
  it('chama Whisper e retorna o texto', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Boa tarde, preciso de uma peça' }),
    })

    const buffer = Buffer.from([1, 2, 3])
    const result = await transcribeAudio(buffer, 'audio/ogg')

    expect(result).toBe('Boa tarde, preciso de uma peça')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      })
    )
  })

  it('lança erro se Whisper retorna não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') })
    await expect(transcribeAudio(Buffer.from([1]), 'audio/ogg')).rejects.toThrow('transcription failed')
  })
})
