import { extractText, getDocumentProxy } from 'unpdf'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadOpenAIConfig } from '@/lib/inboxes'

const MAX_CHARS = 8000

export interface PdfResult {
  text: string
  numPages: number
}

const PDF_VISION_PROMPT = `Você é um analista aeronáutico. Este PDF foi enviado por um cliente da Amazon Jet Aviation. Leia o documento (incluindo conteúdo de imagens / scans) e extraia:

- Todos os Part Numbers visíveis (formato: PN: <pn> Qtd: <qtd>)
- Tipo do documento (invoice, IPC, Form 8130, etc.)
- Cliente/fornecedor se identificável
- Quaisquer outras informações úteis para cotação aeronáutica

Português Brasil. Bullets curtos. Máximo 15 linhas. Se ilegível, diga "ilegível".`

async function extractViaVision(buffer: Buffer): Promise<string> {
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })
  const base64 = buffer.toString('base64')

  const { text } = await generateText({
    model: openai('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PDF_VISION_PROMPT },
          { type: 'file', data: `data:application/pdf;base64,${base64}`, mediaType: 'application/pdf' },
        ],
      },
    ],
  })

  return text
}

export async function extractPdfText(buffer: Buffer): Promise<PdfResult> {
  // Step 1: try unpdf (fast, free)
  try {
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const pdf = await getDocumentProxy(uint8)
    const { text, totalPages } = await extractText(pdf, { mergePages: true })
    const fullText = (Array.isArray(text) ? text.join('\n') : text ?? '').trim()

    if (fullText.length >= 50) {
      return {
        text: fullText.length > MAX_CHARS ? fullText.slice(0, MAX_CHARS) : fullText,
        numPages: totalPages ?? 1,
      }
    }
  } catch (err) {
    console.warn('[pdf] unpdf failed, will try vision:', err)
  }

  // Step 2: fallback to GPT-4o vision (handles scanned PDFs)
  console.log('[pdf] using GPT-4o vision fallback for scanned/image PDF')
  const visionText = await extractViaVision(buffer)
  return {
    text: visionText.length > MAX_CHARS ? visionText.slice(0, MAX_CHARS) : visionText,
    numPages: 1,
  }
}
