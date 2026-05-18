import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

import { extractPdfText } from '@/lib/media/pdf'
import pdfParse from 'pdf-parse'

const mockPdfParse = pdfParse as unknown as ReturnType<typeof vi.fn>

describe('extractPdfText', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extrai texto de PDF', async () => {
    mockPdfParse.mockResolvedValue({ text: 'Texto do PDF aqui que tem mais de cinquenta caracteres pra passar', numpages: 2 })
    const result = await extractPdfText(Buffer.from([0x25, 0x50, 0x44, 0x46]))
    expect(result.text).toContain('Texto do PDF')
    expect(result.numPages).toBe(2)
  })

  it('trunca texto longo em 8000 caracteres', async () => {
    const longText = 'a'.repeat(10000)
    mockPdfParse.mockResolvedValue({ text: longText, numpages: 1 })
    const result = await extractPdfText(Buffer.from([0x25]))
    expect(result.text.length).toBe(8000)
  })

  it('lança erro se texto extraído < 50 chars (PDF escaneado)', async () => {
    mockPdfParse.mockResolvedValue({ text: '  ', numpages: 1 })
    await expect(extractPdfText(Buffer.from([0x25]))).rejects.toThrow('PDF parece escaneado')
  })
})
