import { extractText, getDocumentProxy } from 'unpdf'

const MAX_CHARS = 8000

export interface PdfResult {
  text: string
  numPages: number
}

export async function extractPdfText(buffer: Buffer): Promise<PdfResult> {
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const pdf = await getDocumentProxy(uint8)
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  const fullText = (Array.isArray(text) ? text.join('\n') : text ?? '').trim()

  if (fullText.length < 50) {
    throw new Error('PDF parece escaneado (sem texto extraível)')
  }

  return {
    text: fullText.length > MAX_CHARS ? fullText.slice(0, MAX_CHARS) : fullText,
    numPages: totalPages ?? 1,
  }
}
