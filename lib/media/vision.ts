import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadOpenAIConfig } from '@/lib/inboxes'

const VISION_PROMPT = `Você é um analista visual da Amazon Jet Aviation, especializado em peças aeronáuticas. Analise a imagem e descreva EXCLUSIVAMENTE o que é relevante para atendimento de peças.

CATEGORIAS:
1. ETIQUETA/PLAQUETA de peça → extraia: Part Number, Serial Number, CAGE code, fabricante, Form 8130 / EASA Form 1 se visível, condição (NEW/OVERHAUL/SERVICEABLE/EXCHANGE)
2. FOTO DE PEÇA → identifique tipo, condição visual, dano visível, modelo
3. NOTA FISCAL / INVOICE → número, fornecedor, data, lista de PNs + quantidades
4. FORM 8130-3 / EASA FORM 1 → autoridade (FAA/EASA/ANAC), PN, S/N, condição
5. MANUAL TÉCNICO / IPC PAGE → seção, fig, PN destacado
6. CARTÃO/DOCUMENTO PESSOAL → diga "Imagem não-aeronáutica (documento pessoal)"
7. OUTRA → diga "Imagem não-aeronáutica" e descreva brevemente

REGRAS:
- Português Brasil
- Bullets curtos (•), dados primeiro
- Máximo 8 linhas
- Preserve EXATAMENTE como visto: hífens, barras
- Se múltiplos PNs, liste todos
- Se ilegível, diga "ilegível"
- Não invente`

export async function analyzeImage(buffer: Buffer, mimeType: string): Promise<string> {
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })

  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const { text } = await generateText({
    model: openai('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'image', image: dataUrl },
        ],
      },
    ],
  })

  return text
}
