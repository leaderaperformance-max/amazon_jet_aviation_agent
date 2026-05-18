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
    ? `\n\n---\n\n## ⚠️ REGRA OBRIGATÓRIA DE TOOLS (siga ANTES de responder)\n\nTAGS ATUAIS DESTA CONVERSA: [${labelsCtx}]\n\nVocê tem 4 tools disponíveis. ANTES de redigir sua resposta de texto, OBRIGATORIAMENTE decida quais tools chamar:\n\n### 🏷️ TAGS — \`add_label\` / \`remove_label\`\n\n| Situação | Ação |\n|---|---|\n| "novo_lead" não está em TAGS ATUAIS | CHAME add_label('novo_lead') |\n| Você está prestes a pedir o Part Number | CHAME add_label('aguardando_pn') |\n| O cliente acabou de fornecer o PN | CHAME remove_label('aguardando_pn') E add_label('pendente_orcamento') |\n| Cliente confirmou fechamento/compra | CHAME add_label('lead_ganho') |\n| Cliente desistiu / sem perfil | CHAME add_label('lead_perdido') |\n\n### 🔍 VALIDAÇÃO DE PN — \`validate_part_number\`\n\nSEMPRE que o cliente mandar algo que pareça um Part Number (combinação de letras/números, com hífens, ex: MS16624-2037, AN3-5A, 010-00696-01, BCFA1-100), CHAME \`validate_part_number({ candidate: "<texto exato>" })\` ANTES de prosseguir.\n\n### 📨 ENVIO AO VENDEDOR — \`envia_pn\` (CRÍTICO)\n\nAssim que tiver os 3 dados qualificados na conversa (mesmo que em mensagens diferentes), CHAME \`envia_pn\` IMEDIATAMENTE:\n\n1. Part Number → já validado via validate_part_number(valid:true)\n2. Quantidade → cliente disse "2", "2 unidades", "5", "uma", etc. Aceite typos como "2 unifades" como "2 unidades".\n3. Urgência → "AOG" se cliente mencionou urgência/parado/em solo/emergência; caso contrário "rotina"\n\nExemplo de chamada:\n\`envia_pn({ part_number: "MS16624-2037", quantity: "2 unidades", urgency: "AOG", customer_name: "<nome se souber>", customer_phone: "<telefone se souber>", notes: "<contexto extra opcional>" })\`\n\nApós chamar envia_pn, responda ao cliente:\n- Para AOG: "Dados enviados ao AOG Desk. Especialista vai te contatar agora."\n- Para rotina: "Recebi os dados. Nosso especialista vai te retornar com a cotação em até 48h úteis."\n\nNÃO chame envia_pn duas vezes na mesma conversa, exceto se cliente mandar PN diferente.\nNÃO chame envia_pn sem PN validado.\n\n---\n\nAs tools são INVISÍVEIS para o cliente. NUNCA mencione tags ou tools na resposta de texto. CHAME AS TOOLS PRIMEIRO, depois escreva a resposta.`
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
  const steps = (result as { steps?: Array<{ toolCalls?: Array<{ toolName?: string }> }> }).steps ?? []

  // Count tool calls across all steps (not just the final one)
  const allToolCalls: { toolName: string; step: number }[] = []
  steps.forEach((s, i) => {
    (s.toolCalls ?? []).forEach(tc => {
      if (tc.toolName) allToolCalls.push({ toolName: tc.toolName, step: i })
    })
  })

  console.log(`[agent] totalToolCalls=${allToolCalls.length} steps=${steps.length} textLen=${text.length}`)
  if (allToolCalls.length > 0) {
    console.log(`[agent] toolCalls: ${allToolCalls.map(t => `${t.toolName}@step${t.step}`).join(', ')}`)
  }

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
