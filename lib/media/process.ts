import { downloadAttachment } from '@/lib/media/download'
import { transcribeAudio } from '@/lib/media/transcribe'
import { analyzeImage } from '@/lib/media/vision'
import { extractPdfText } from '@/lib/media/pdf'

export interface ChatwootAttachment {
  data_url?: string
  extension?: string
  content_type?: string
  file_type?: string
  file_size?: number
}

function isAudio(att: ChatwootAttachment): boolean {
  if (att.file_type === 'audio') return true
  if (att.content_type?.startsWith('audio/')) return true
  return false
}

function isImage(att: ChatwootAttachment): boolean {
  if (att.file_type === 'image') return true
  if (att.content_type?.startsWith('image/')) return true
  return false
}

function isPdf(att: ChatwootAttachment): boolean {
  if (att.content_type === 'application/pdf') return true
  if (att.extension?.toLowerCase() === 'pdf') return true
  return false
}

function isSpreadsheet(att: ChatwootAttachment): boolean {
  if (att.content_type === 'text/csv') return true
  if (att.content_type?.includes('spreadsheet')) return true  // xlsx
  if (att.content_type?.includes('excel')) return true  // xls
  const ext = att.extension?.toLowerCase()
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return true
  return false
}

function filename(att: ChatwootAttachment): string {
  if (!att.data_url) return 'arquivo'
  try {
    const url = new URL(att.data_url)
    const last = url.pathname.split('/').filter(Boolean).pop() ?? 'arquivo'
    return decodeURIComponent(last).slice(0, 60)
  } catch {
    return 'arquivo'
  }
}

export async function processAttachment(att: ChatwootAttachment): Promise<string | null> {
  if (!att.data_url) return null

  try {
    if (isAudio(att)) {
      const buf = await downloadAttachment(att.data_url)
      const text = await transcribeAudio(buf, att.content_type ?? 'audio/ogg')
      return `[ÁUDIO TRANSCRITO]: ${text}`
    }

    if (isImage(att)) {
      const buf = await downloadAttachment(att.data_url)
      const analysis = await analyzeImage(buf, att.content_type ?? 'image/jpeg')
      return `[IMAGEM ENVIADA — análise]: ${analysis}`
    }

    if (isSpreadsheet(att)) {
      const buf = await downloadAttachment(att.data_url)
      const { extractSpreadsheetText } = await import('@/lib/media/spreadsheet')
      const { text, sheetsCount } = extractSpreadsheetText(buf)
      return `[PLANILHA — ${filename(att)}, ${sheetsCount} sheet(s)]: ${text}`
    }

    if (isPdf(att)) {
      const buf = await downloadAttachment(att.data_url)
      try {
        const { text, numPages } = await extractPdfText(buf)
        return `[DOCUMENTO PDF — ${filename(att)}, ${numPages}pg]: ${text}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('escaneado')) {
          return `[DOCUMENTO PDF — ${filename(att)}]: O PDF parece estar escaneado e não foi possível extrair texto. Por favor, tire foto das páginas e mande como imagem.`
        }
        throw err
      }
    }

    console.warn(`[media] unsupported attachment type: ${att.content_type} / ${att.extension}`)
    return null
  } catch (err) {
    console.warn('[media] processing error:', err)
    return null
  }
}

/**
 * Process an attachment we already have as a Buffer (e.g. fetched from Gmail).
 * Same logic as processAttachment but skips the download step.
 */
export async function processBuffer(
  buf: Buffer,
  mimeType: string,
  fname: string
): Promise<string | null> {
  const fakeAtt: ChatwootAttachment = {
    content_type: mimeType,
    extension: fname.split('.').pop()?.toLowerCase(),
    file_type: mimeType.split('/')[0],
  }

  try {
    if (isAudio(fakeAtt)) {
      const text = await transcribeAudio(buf, mimeType)
      return `[ÁUDIO TRANSCRITO]: ${text}`
    }
    if (isImage(fakeAtt)) {
      const analysis = await analyzeImage(buf, mimeType)
      return `[IMAGEM — análise]: ${analysis}`
    }
    if (isSpreadsheet(fakeAtt)) {
      const { extractSpreadsheetText } = await import('@/lib/media/spreadsheet')
      const { text, sheetsCount } = extractSpreadsheetText(buf)
      return `[PLANILHA — ${fname}, ${sheetsCount} sheet(s)]: ${text}`
    }
    if (isPdf(fakeAtt)) {
      try {
        const { text, numPages } = await extractPdfText(buf)
        return `[DOCUMENTO PDF — ${fname}, ${numPages}pg]: ${text}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('escaneado')) {
          return `[DOCUMENTO PDF — ${fname}]: PDF escaneado, não foi possível extrair texto.`
        }
        throw err
      }
    }
    console.warn(`[media] processBuffer: unsupported type ${mimeType}`)
    return null
  } catch (err) {
    console.warn('[media] processBuffer error:', err)
    return null
  }
}
