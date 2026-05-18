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
    ? `\n\n---\n\n## ⚠️ CHECKLIST OBRIGATÓRIO ANTES DE RESPONDER\n\nTAGS ATUAIS: [${labelsCtx}]\n\nExecute em ordem ANTES de escrever qualquer resposta de texto:\n\n### PASSO 1 — Faça um inventário do que você TEM\n\nLeia o histórico inteiro da conversa (incluindo a mensagem atual) e marque mentalmente:\n\n- 🔧 PART NUMBER já fornecido e validado nesta conversa? <SIM/NÃO — qual é>\n- 🔢 QUANTIDADE já fornecida (qualquer formato: "2", "duas", "3 unidades", "1 peça")? <SIM/NÃO — qual é>\n- ⚡ URGÊNCIA já mencionada (AOG / rotina / urgente / sem pressa)? <SIM/NÃO — qual é>\n\n### PASSO 2 — Decisão de tool baseada no inventário\n\n**SE você marcou SIM nos 3 itens acima:**\n→ CHAME \`envia_pn\` IMEDIATAMENTE com os 3 dados.\n→ NÃO peça confirmação ao cliente.\n→ NÃO chame validate_part_number de novo.\n→ Após o tool retornar ok, responda ao cliente:\n  - AOG: "Dados enviados ao AOG Desk. Especialista vai te contatar agora."\n  - Rotina: "Recebi os dados. Nosso especialista vai te retornar com a cotação em até 48h úteis."\n\n**SE faltar algum item:**\n→ Identifique QUAL falta\n→ Se PN não validado e a mensagem ATUAL parece um PN: chame validate_part_number({ candidate: "<texto atual>" })\n→ Se algo falta: faça UMA pergunta curta para conseguir o dado faltante\n\n### REGRAS RÍGIDAS\n\n- NUNCA chame validate_part_number com um PN que já foi validado antes nesta conversa. Use sempre o PN do histórico.\n- NUNCA peça novamente um dado que já está na conversa.\n- Se o cliente disse "3 unidades", a quantidade JÁ É 3 unidades. Não pergunte de novo. Use no envia_pn.\n- Se o cliente disse "rotina", a urgência JÁ É rotina. Idem.\n- Aceite typos como "2 unifades" = "2 unidades".\n\n### TAGS (silencioso)\n\nDurante a conversa, mantenha tags atualizadas:\n- "novo_lead" se não está → add_label('novo_lead')\n- Pediu o PN → add_label('aguardando_pn')\n- Recebeu PN válido → remove_label('aguardando_pn') + add_label('pendente_orcamento')\n- Lead fechou → add_label('lead_ganho') ou add_label('lead_perdido')\n\nTools são INVISÍVEIS pro cliente. NUNCA fale sobre tools/tags no texto.`
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
