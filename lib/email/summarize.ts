import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadOpenAIConfig } from '@/lib/inboxes'

export interface EmailSummary {
  category: string
  summary: string
  detected_pns: string[]
  urgency: 'AOG' | 'rotina' | 'nenhuma'
}

const SUMMARY_PROMPT = `Você é um analista de emails B2B da Amazon Jet Aviation (peças aeronáuticas).
Recebe o conteúdo de UM email + anexos analisados. Sua tarefa:

1. **Categorizar** em UMA destas:
   - "cotacao" — cliente pedindo cotação de peça/PN
   - "rfq" — Request For Quotation formal (com lista, planilha, PDF)
   - "duvida_tecnica" — dúvida sobre peça, equivalência, compatibilidade
   - "follow_up" — cliente cobrando cotação anterior
   - "ordem_compra" — PO / pedido de compra firme
   - "spam" — propaganda, newsletter, automação
   - "interno" — comunicação interna (boletos, notas, NF)
   - "outros" — qualquer outra coisa

2. **Resumo curto** (1-3 frases, direto ao ponto, em PT-BR)

3. **Extrair Part Numbers** mencionados (formal ou modelo aviation reconhecível)

4. **Detectar urgência**: AOG (Aircraft On Ground / urgente), rotina, ou nenhuma

Responda APENAS JSON, sem markdown:
{
  "category": "cotacao|rfq|duvida_tecnica|follow_up|ordem_compra|spam|interno|outros",
  "summary": "string curta",
  "detected_pns": ["PN1", "PN2"],
  "urgency": "AOG|rotina|nenhuma"
}`

export async function summarizeEmail(input: {
  from: string
  subject: string
  body: string
  attachmentsText: string
}): Promise<EmailSummary> {
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })

  const userContent = [
    `De: ${input.from}`,
    `Assunto: ${input.subject}`,
    '',
    '--- CORPO ---',
    input.body.slice(0, 6000),
    input.attachmentsText ? '\n--- ANEXOS ANALISADOS ---' : '',
    input.attachmentsText.slice(0, 8000),
  ].join('\n')

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: SUMMARY_PROMPT,
    prompt: userContent,
  })

  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as Partial<EmailSummary>
    return {
      category: parsed.category ?? 'outros',
      summary: parsed.summary ?? '(sem resumo)',
      detected_pns: parsed.detected_pns ?? [],
      urgency: (parsed.urgency as EmailSummary['urgency']) ?? 'nenhuma',
    }
  } catch {
    return {
      category: 'outros',
      summary: text.slice(0, 200),
      detected_pns: [],
      urgency: 'nenhuma',
    }
  }
}
