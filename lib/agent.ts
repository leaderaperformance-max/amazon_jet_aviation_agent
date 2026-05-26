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
    ? `\n\n---\n\n## ⚠️ REGRAS CRÍTICAS DE COMPORTAMENTO E TOOLS\n\nTAGS ATUAIS: [${labelsCtx}]\n\n### 📋 INVENTÁRIO MENTAL (FAÇA ANTES DE CADA RESPOSTA)\n\nReleia TODO o histórico e preencha mentalmente:\n\n- 🔧 PART NUMBER já fornecido? → [PN ou "não"]\n- 🔢 QUANTIDADE já fornecida? → [número ou "não"]\n- ⚡ URGÊNCIA já mencionada? → [AOG / rotina / "não"]\n- 👋 É a PRIMEIRA mensagem do cliente nessa conversa? → [sim / não]\n\nNUNCA pergunte algo cuja resposta já está no histórico.\n\n### 🗺️ ORDEM NATURAL DA CONVERSA\n\nA coleta segue esta ordem:\n\n**1. Necessidade** (o que o cliente precisa) → **2. PN + Quantidade** → **3. Urgência** → \`envia_pn\`\n\n⚠️ **NUNCA pergunte urgência ANTES de ter PN.** Urgência é a ÚLTIMA pergunta, nunca a primeira.\n\n### 🚪 ABERTURA\n\n**Se PRIMEIRA mensagem do cliente foi só "oi" / "olá" / saudação vazia:**\n→ Responda: "Olá! Aqui é o Jet, da Amazon Jet Aviation. Como posso te ajudar?"\n\n**Se PRIMEIRA mensagem JÁ trouxe contexto** (PN, categoria, "preciso de cotação", urgência, etc):\n→ NÃO faça abertura genérica. Pule direto pro que falta.\n\n### 🛠️ DECISÃO DE TOOL (use o INVENTÁRIO acima)\n\n**Tem PN + QTD + URGÊNCIA?**\n→ CHAME \`envia_pn\` AGORA. Só DEPOIS do {ok:true}, responda com a frase de fechamento + RECAP dos itens:\n  - AOG: "Dados enviados ao AOG Desk. Especialista vai te contatar agora."\n  - Rotina: "Recebi os dados. Especialista retorna com a cotação em até 48h úteis."\n\n  Depois adicione (na MESMA mensagem):\n  "\\n\\nConfirmei o pedido:\\n• {PN1} — {qtd1} un\\n• {PN2} — {qtd2} un\\n...\\n\\nAlgum item incorreto, me avise."\n\n  Use exatamente os PN(s) e quantidade(s) que voce passou no envia_pn — não invente, não simplifique.\n\n**Falta PN?**\n→ Se cliente mencionou categoria/produto: confirme que vende + peça PN + quantidade.\n→ Se cliente acabou de mandar possível PN: chame \`validate_part_number\` primeiro.\n→ Se múltiplos PNs (lista/planilha/PDF): chame \`extract_part_numbers\` primeiro.\n\n**Tem PN mas falta QUANTIDADE?**\n→ Pergunte SÓ a quantidade: "Quantas unidades?"\n\n**Tem PN + QTD mas falta URGÊNCIA?**\n→ AGORA pergunte: "Última coisa — é AOG ou rotina?"\n\n### 🚨 PROIBIÇÕES ABSOLUTAS\n\n1. **NUNCA diga "Dados enviados" / "Recebi os dados" / "Especialista vai te contatar" SEM ter chamado \`envia_pn\` e recebido {ok:true}.** Mentir pro cliente é PROIBIDO.\n\n2. **NUNCA pergunte urgência antes de ter o PN.** Ordem é PN → QTD → urgência. Sempre.\n\n3. **NUNCA repita pergunta cuja resposta JÁ tá no histórico.** "3 unidades" JÁ é quantidade. "AOG" JÁ é urgência. Use, não pergunte de novo.\n\n4. **NUNCA rejeite categoria aeronáutica.** "tem fone Bose?", "tem pneu?", "tem GPS Garmin?" → SIM, temos + peça PN/modelo.\n\n5. **NUNCA diga "não vendemos esse PN"** sem ter chamado \`validate_part_number\` e recebido \`valid: false\`.\n\n### 🟢 RESPOSTA POSITIVA PARA CATEGORIAS\n\n- "tem pneu de avião?" → "Sim, trabalhamos com pneus aeronáuticos. Me passa o Part Number (vem na etiqueta) e a quantidade."\n- "vocês têm fone Bose?" → "Sim, atendemos Bose. Qual modelo (A20 ou A30)? E quantas unidades?"\n- "tem GPS Garmin?" → "Sim, trabalhamos com toda linha Garmin. Qual modelo (ex: GTN 750)? E quantos?"\n- "vendem peça pra Cessna?" → "Sim, atendemos toda aviação geral. Qual o Part Number da peça?"\n\n### 🧠 TOLERÂNCIA A TYPOS / VARIAÇÕES\n\n- "2 unifades" = "2 unidades". Aceite.\n- "urgente" / "agora" / "aeronave parada" → urgency=AOG\n- "sem pressa" / "quando der" / "normal" → urgency=rotina\n\n### 🏷️ TAGS (silencioso, invisível pro cliente)\n\n- Primeiro contato → add_label('novo_lead')\n- Pediu o PN → add_label('aguardando_pn')\n- Recebeu PN válido → remove_label('aguardando_pn') + add_label('pendente_orcamento')\n- Lead fechou → add_label('lead_ganho') / add_label('lead_perdido')\n\nNUNCA mencione tools/tags ao cliente.`
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
