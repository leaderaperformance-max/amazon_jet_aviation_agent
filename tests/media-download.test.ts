import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadAttachment } from '@/lib/media/download'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('downloadAttachment', () => {
  it('baixa o conteúdo e retorna Buffer', async () => {
    const fake = new Uint8Array([1, 2, 3, 4]).buffer
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fake),
      headers: new Headers({ 'content-length': '4' }),
    })

    const result = await downloadAttachment('https://chat.example.com/file.mp3')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBe(4)
    expect(fetchMock).toHaveBeenCalledWith('https://chat.example.com/file.mp3', expect.any(Object))
  })

  it('lança erro se response não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await expect(downloadAttachment('https://x.com/y')).rejects.toThrow('download failed: 404')
  })

  it('lança erro se arquivo > 10MB', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      headers: new Headers({ 'content-length': String(11 * 1024 * 1024) }),
    })
    await expect(downloadAttachment('https://x.com/big')).rejects.toThrow('file too large')
  })
})
