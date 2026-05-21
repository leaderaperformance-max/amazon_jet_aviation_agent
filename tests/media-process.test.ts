import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/media/download', () => ({ downloadAttachment: vi.fn() }))
vi.mock('@/lib/media/transcribe', () => ({ transcribeAudio: vi.fn() }))
vi.mock('@/lib/media/vision', () => ({ analyzeImage: vi.fn() }))
vi.mock('@/lib/media/pdf', () => ({ extractPdfText: vi.fn() }))
vi.mock('@/lib/media/spreadsheet', () => ({ extractSpreadsheetText: vi.fn() }))

import { processAttachment } from '@/lib/media/process'
import { downloadAttachment } from '@/lib/media/download'
import { transcribeAudio } from '@/lib/media/transcribe'
import { analyzeImage } from '@/lib/media/vision'
import { extractPdfText } from '@/lib/media/pdf'
import { extractSpreadsheetText } from '@/lib/media/spreadsheet'

const mockDownload = downloadAttachment as ReturnType<typeof vi.fn>
const mockTranscribe = transcribeAudio as ReturnType<typeof vi.fn>
const mockAnalyze = analyzeImage as ReturnType<typeof vi.fn>
const mockExtract = extractPdfText as ReturnType<typeof vi.fn>
const mockExtractSheet = extractSpreadsheetText as ReturnType<typeof vi.fn>

describe('processAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownload.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('transcribe áudio e retorna [ÁUDIO TRANSCRITO]:', async () => {
    mockTranscribe.mockResolvedValue('Boa tarde')
    const result = await processAttachment({
      data_url: 'https://x.com/audio.ogg',
      content_type: 'audio/ogg',
      file_type: 'audio',
    })
    expect(result).toBe('[ÁUDIO TRANSCRITO]: Boa tarde')
  })

  it('analyzeImage e retorna [IMAGEM ENVIADA — análise]:', async () => {
    mockAnalyze.mockResolvedValue('• PN MS21266-2N')
    const result = await processAttachment({
      data_url: 'https://x.com/foto.jpg',
      content_type: 'image/jpeg',
      file_type: 'image',
    })
    expect(result).toBe('[IMAGEM ENVIADA — análise]: • PN MS21266-2N')
  })

  it('extractPdfText e retorna [DOCUMENTO PDF]:', async () => {
    mockExtract.mockResolvedValue({ text: 'spec da peça', numPages: 3 })
    const result = await processAttachment({
      data_url: 'https://x.com/doc.pdf',
      content_type: 'application/pdf',
      file_type: 'file',
      extension: 'pdf',
    })
    expect(result).toContain('[DOCUMENTO PDF')
    expect(result).toContain('3pg')
    expect(result).toContain('spec da peça')
  })

  it('processa XLSX e retorna [PLANILHA]:', async () => {
    mockExtractSheet.mockReturnValue({ text: 'MS21266-2N | 2 | NEW', sheetsCount: 1 })
    const result = await processAttachment({
      data_url: 'https://x.com/sheet.xlsx',
      content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_type: 'file',
      extension: 'xlsx',
    })
    expect(result).toContain('[PLANILHA')
    expect(result).toContain('MS21266-2N')
    expect(result).toContain('1 sheet(s)')
  })

  it('retorna null pra tipo verdadeiramente não suportado', async () => {
    const result = await processAttachment({
      data_url: 'https://x.com/video.mp4',
      content_type: 'video/mp4',
      file_type: 'file',
    })
    expect(result).toBeNull()
  })

  it('retorna null se download falha', async () => {
    mockDownload.mockRejectedValue(new Error('boom'))
    const result = await processAttachment({
      data_url: 'https://x.com/fail.ogg',
      content_type: 'audio/ogg',
      file_type: 'audio',
    })
    expect(result).toBeNull()
  })

  it('retorna fallback amigável se PDF escaneado', async () => {
    mockExtract.mockRejectedValue(new Error('PDF parece escaneado'))
    const result = await processAttachment({
      data_url: 'https://x.com/scan.pdf',
      content_type: 'application/pdf',
      file_type: 'file',
    })
    expect(result).toContain('escaneado')
    expect(result).toContain('foto das páginas')
  })
})
