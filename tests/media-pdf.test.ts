import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pdf-parse', () => {
  const PDFParse = vi.fn()
  return { PDFParse }
})

import { extractPdfText } from '@/lib/media/pdf'
import { PDFParse } from 'pdf-parse'

const MockPDFParse = PDFParse as unknown as ReturnType<typeof vi.fn>

describe('extractPdfText', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extrai texto de PDF', async () => {
    const mockGetText = vi.fn().mockResolvedValue({ text: 'Texto do PDF aqui que tem mais de cinquenta caracteres pra passar', pages: [1, 2] })
    MockPDFParse.mockImplementation(class {
      getText = mockGetText
    })
    const result = await extractPdfText(Buffer.from([0x25, 0x50, 0x44, 0x46]))
    expect(result.text).toContain('Texto do PDF')
    expect(result.numPages).toBe(2)
  })

  it('trunca texto longo em 8000 caracteres', async () => {
    const longText = 'a'.repeat(10000)
    const mockGetText = vi.fn().mockResolvedValue({ text: longText, pages: [1] })
    MockPDFParse.mockImplementation(class {
      getText = mockGetText
    })
    const result = await extractPdfText(Buffer.from([0x25]))
    expect(result.text.length).toBe(8000)
  })

  it('lança erro se texto extraído < 50 chars (PDF escaneado)', async () => {
    const mockGetText = vi.fn().mockResolvedValue({ text: '  ', pages: [1] })
    MockPDFParse.mockImplementation(class {
      getText = mockGetText
    })
    await expect(extractPdfText(Buffer.from([0x25]))).rejects.toThrow('PDF parece escaneado')
  })
})
