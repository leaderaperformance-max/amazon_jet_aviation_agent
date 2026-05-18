import pdfParse from 'pdf-parse'

const MAX_CHARS = 8000

export interface PdfResult {
  text: string
  numPages: number
}

export async function extractPdfText(buffer: Buffer): Promise<PdfResult> {
  const result = await pdfParse(buffer)
  const text = (result.text ?? '').trim()

  if (text.length < 50) {
    throw new Error('PDF parece escaneado (sem texto extraível)')
  }

  return {
    text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
    numPages: result.numpages ?? 1,
  }
}
