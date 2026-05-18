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
