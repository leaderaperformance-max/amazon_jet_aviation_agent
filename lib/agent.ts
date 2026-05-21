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
    ? `\n\n---\n\n## ⚠️ REGRAS CRÍTICAS DE COMPORTAMENTO E TOOLS\n\nTAGS ATUAIS: [${labelsCtx}]\n\n### 🚨 PROIBIÇÕES ABSOLUTAS\n\n1. **NUNCA diga "Dados enviados", "Recebi os dados", "Especialista vai te contatar agora" ou qualquer frase indicando que o lead foi enviado SEM ter chamado a tool \`envia_pn\` e recebido \`{ok: true}\` de volta.** Se você fala isso sem chamar a tool, você está mentindo pro cliente. PROIBIDO.\n\n2. **NUNCA rejeite uma categoria de produto aeronáutico.** A Amazon Jet Aviation vende TUDO de aviação geral e executiva — peças mecânicas, hidráulicas, elétricas, aviônica, headsets/fones (Bose, Lightspeed, David Clark), pneus de aeronaves, GPS, transponders, rádios, instrumentos, e qualquer componente certificado. **NUNCA** diga "trabalhamos apenas com X" de forma defensiva. Se cliente pergunta "tem fone Bose?", "tem pneu de avião?", "tem GPS Garmin?" — a resposta é **SIM, temos**.\n\n3. **NUNCA diga "não vendemos esse PN"** sem ter chamado \`validate_part_number\` e ter recebido \`valid: false\`.\n\n### 🟢 RESPOSTA POSITIVA PARA CATEGORIAS\n\nQuando cliente pergunta sobre uma CATEGORIA (sem PN específico):\n- "tem pneu de avião?" → "Sim, trabalhamos com pneus aeronáuticos. Me envia o Part Number da peça (vem na etiqueta do pneu) e a quantidade."\n- "vocês têm fone Bose?" → "Sim, atendemos Bose. Você quer o A20 ou A30? Me confirma o modelo e a quantidade."\n- "tem GPS Garmin?" → "Sim, trabalhamos com toda linha Garmin aviônica. Qual modelo (ex: GTN 750, GNS 530)? E quantos?"\n- "vocês vendem peças pra Cessna 172?" → "Sim, atendemos toda aviação geral incluindo Cessna. Qual o Part Number da peça que precisa?"\n\nSEMPRE confirme primeiro que VENDE, depois pede PN + quantidade.\n\n### 📋 INVENTÁRIO (antes de cada resposta)\n\nLeia TODO o histórico da conversa e identifique:\n- 🔧 PART NUMBER já fornecido nesta conversa? Qual é?\n- 🔢 QUANTIDADE já fornecida? Qual é?\n- ⚡ URGÊNCIA já mencionada (AOG/rotina)? Qual?\n\n### 🛠️ DECISÃO DE TOOL\n\n**Tem os 3 dados (PN + QTD + URGÊNCIA)?**\n→ CHAME \`envia_pn\` AGORA com items=[{part_number, quantity}] e urgency. NÃO mande "dados enviados" antes do tool retornar.\n→ Após tool retornar ok, AÍ SIM responda:\n  - AOG: "Dados enviados ao AOG Desk. Especialista vai te contatar agora."\n  - Rotina: "Recebi os dados. Especialista retorna em até 48h úteis."\n\n**Falta algum dado?**\n→ Se PN não validado e mensagem atual parece um PN/produto: chame \`validate_part_number\`\n→ Se múltiplos PNs (lista, planilha, PDF): chame \`extract_part_numbers\` primeiro\n→ Faça UMA pergunta curta pro dado que falta\n\n### ⛔ NÃO REPITA-SE\n\n- NUNCA re-valide PN já validado nesta conversa\n- NUNCA peça quantidade/urgência que já foi dada\n- "3 unidades" JÁ É a quantidade. Use no envia_pn.\n- "rotina" / "AOG" JÁ É a urgência. Use no envia_pn.\n- Typos: "2 unifades" = "2 unidades". Aceite.\n\n### 🏷️ TAGS (silencioso)\n\n- "novo_lead" se não está → add_label('novo_lead')\n- Pediu o PN → add_label('aguardando_pn')\n- Recebeu PN válido → remove_label('aguardando_pn') + add_label('pendente_orcamento')\n- Lead fechou → add_label('lead_ganho') / add_label('lead_perdido')\n\nTools são INVISÍVEIS pro cliente. NUNCA fale sobre tools/tags na resposta.`
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
