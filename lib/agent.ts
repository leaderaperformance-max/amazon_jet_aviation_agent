import { generateText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { injectCurrentDate } from '@/lib/prompt'
import type { MemoryMessage } from '@/lib/types'

export async function runAgent(
  sessionId: string,
  userMessage: string,
  systemPrompt: string,
  openaiApiKey: string,
  openaiModel: string,
  tools?: Record<string, unknown>,
  currentLabels: string[] = []
): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)
  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const openai = createOpenAI({ apiKey: openaiApiKey })

  // Inject current labels + a strong directive about tool usage at the END of the system prompt.
  // The trailing position keeps the instruction fresh in the model's mind right before it acts.
  const labelsCtx = currentLabels.length > 0 ? currentLabels.join(', ') : '(nenhuma)'
  const toolDirective = tools
    ? `\n\n---\n\n## ⚠️ REGRA OBRIGATÓRIA DE TAGS (siga ANTES de responder)\n\nTAGS ATUAIS DESTA CONVERSA: [${labelsCtx}]\n\nANTES de redigir sua resposta de texto, OBRIGATORIAMENTE pense quais tags se aplicam ao estado da conversa e CHAME as tools add_label / remove_label conforme a tabela:\n\n| Situação | Ação |\n|---|---|\n| Se "novo_lead" não está em TAGS ATUAIS | CHAME add_label('novo_lead') |\n| Você está prestes a pedir o Part Number | CHAME add_label('aguardando_pn') |\n| O cliente acabou de fornecer o PN | CHAME remove_label('aguardando_pn') E add_label('pendente_orcamento') |\n| Você está dizendo "Recebi os dados..." (cotação será enviada) | CHAME add_label('orcamento_enviado') |\n| Cliente confirmou fechamento/compra | CHAME add_label('lead_ganho') |\n| Cliente desistiu / sem perfil | CHAME add_label('lead_perdido') |\n\nAs tools são INVISÍVEIS para o cliente. NUNCA mencione tags na resposta de texto. Chame as tools PRIMEIRO, depois escreva a resposta normal.`
    : ''

  const generateParams: Parameters<typeof generateText>[0] = {
    model: openai(openaiModel),
    system: injectCurrentDate(systemPrompt) + toolDirective,
    messages,
    // Allow the model to call tools AND produce a final text answer
    // (up to 5 steps: tool calls + final assistant text).
    stopWhen: stepCountIs(5),
  }
  if (tools) (generateParams as { tools?: unknown }).tools = tools

  console.log(`[agent] runAgent toolsProvided=${!!tools} toolNames=${tools ? Object.keys(tools).join(',') : 'none'}`)

  const result = await generateText(generateParams)
  const { text } = result
  const toolCalls = (result as { toolCalls?: unknown[] }).toolCalls ?? []
  const steps = (result as { steps?: unknown[] }).steps ?? []

  console.log(`[agent] toolCalls=${toolCalls.length} steps=${steps.length} textLen=${text.length}`)
  if (toolCalls.length > 0) {
    console.log(`[agent] toolCalls detail: ${JSON.stringify(toolCalls).slice(0, 500)}`)
  }

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
