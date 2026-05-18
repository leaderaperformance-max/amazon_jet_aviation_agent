import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}))

import { extractPdfText } from '@/lib/media/pdf'
import { getDocumentProxy, extractText } from 'unpdf'

const mockGetDoc = getDocumentProxy as unknown as ReturnType<typeof vi.fn>
const mockExtract = extractText as unknown as ReturnType<typeof vi.fn>

describe('extractPdfText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDoc.mockResolvedValue({})
  })

  it('extrai texto de PDF', async () => {
    mockExtract.mockResolvedValue({ text: 'Texto do PDF aqui que tem mais de cinquenta caracteres pra passar', totalPages: 2 })
    const result = await extractPdfText(Buffer.from([0x25, 0x50, 0x44, 0x46]))
    expect(result.text).toContain('Texto do PDF')
    expect(result.numPages).toBe(2)
  })

  it('aceita text como array (mergePages off)', async () => {
    mockExtract.mockResolvedValue({ text: ['linha 1 com bastante texto', 'linha 2 com mais texto pra completar 50 chars'], totalPages: 2 })
    const result = await extractPdfText(Buffer.from([0x25]))
    expect(result.text).toContain('linha 1')
    expect(result.text).toContain('linha 2')
  })

  it('trunca texto longo em 8000 caracteres', async () => {
    mockExtract.mockResolvedValue({ text: 'a'.repeat(10000), totalPages: 1 })
    const result = await extractPdfText(Buffer.from([0x25]))
    expect(result.text.length).toBe(8000)
  })

  it('lança erro se texto extraído < 50 chars (PDF escaneado)', async () => {
    mockExtract.mockResolvedValue({ text: '  ', totalPages: 1 })
    await expect(extractPdfText(Buffer.from([0x25]))).rejects.toThrow('PDF parece escaneado')
  })
})
