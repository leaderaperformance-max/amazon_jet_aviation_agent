import { generateText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { injectCurrentDate } from '@/lib/prompt'
import type { MemoryMessage } from '@/lib/types'

/**
 * Detecta se a resposta do modelo AFIRMA que o lead foi enviado ao vendedor.
 * gpt-4o-mini às vezes gera esse texto de fechamento SEM chamar envia_pn,
 * o que faz o lead nunca ser criado (cliente ouve "dados enviados" e nada
 * acontece). Quando isso é detectado e envia_pn não foi chamado, forçamos
 * a tool (ver runAgent). Precisão alta: só pega frases de conclusão de envio.
 */
export function claimsLeadSent(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /dados enviados/.test(t) ||
    /(enviei|encaminhei|mandei) (o |os |seu |seus |as )?(pedido|dados|informaç)/.test(t) ||
    /vou enviar os dados/.test(t) ||
    /recebi os dados/.test(t) ||
    /especialista (vai|irá|ira|retorna|do aog|de )/.test(t) ||
    /aog desk/.test(t) ||
    /receber(á|a) a cotaç/.test(t) ||
    /cotaç(ã|a)o em at(é|e)/.test(t)
  )
}

export async function runAgent(
  sessionId: string,
  userMessage: string,
  systemPrompt: string,
  openaiApiKey: string,
  openaiModel: string,
  tools?: Record<string, unknown>,
  currentLabels: string[] = [],
  opts: { saveUserMessage?: boolean } = {},
): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)
  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const openai = createOpenAI({ apiKey: openaiApiKey })

  // Inject current labels + a strong directive about tool usage at the END of the system prompt.
  // The trailing position keeps the instruction fresh in the model's mind right before it acts.
  const labelsCtx = currentLabels.length > 0 ? currentLabels.join(', ') : '(nenhuma)'
  const toolDirective = tools
    ? `\n\n---\n\n## ⚠️ REGRAS CRÍTICAS DE COMPORTAMENTO E TOOLS\n\nTAGS ATUAIS: [${labelsCtx}]\n\n### 👤 MENSAGENS DO VENDEDOR HUMANO (CRÍTICO)\n\nMensagens no histórico com prefixo \`[atendente]:\` foram mandadas pelo VENDEDOR HUMANO (não pelo cliente, não por você). Significa que o vendedor assumiu a conversa em algum momento.\n\n**Regras quando ver \`[atendente]:\` no histórico:**\n- LEIA TUDO que o vendedor falou — esse é o contexto MAIS atual\n- NUNCA contradiga o que o vendedor falou\n- NUNCA repita pergunta que o vendedor já fez\n- NUNCA recomece o atendimento como se fosse o início — você está RETOMANDO\n- Trate o vendedor como colega: ele já tem contexto técnico, foi ele quem cuidou da conversa\n- Se o vendedor já passou cotação, preço, lead time, prazo, etc → use essas infos, não invente\n- Se o vendedor já pediu algo do cliente, espere a resposta — não pergunte de novo\n- Se a conversa parece "fechada" pelo vendedor (cliente vai pensar / vai responder depois) → seja breve, não force\n\n**Diferenciação:**\n- Linha com \`[atendente]:\` → fala do vendedor humano\n- Linha sem prefixo (role=user no histórico) → fala do cliente\n- Linha do role=assistant → fala SUA (de você, bot)\n\n### 📋 INVENTÁRIO MENTAL (FAÇA ANTES DE CADA RESPOSTA)\n\nReleia TODO o histórico e preencha mentalmente:\n\n- 🔧 PART NUMBER já fornecido? → [PN ou "não"]\n- 🔢 QUANTIDADE já fornecida? → [número ou "não"]\n- ✈️ AERONAVE (modelo) já mencionada? → [modelo ou "não"]\n- ⚡ URGÊNCIA já mencionada? → [AOG / rotina / "não"]\n- 👋 É a PRIMEIRA mensagem do cliente nessa conversa? → [sim / não]\n\nNUNCA pergunte algo cuja resposta já está no histórico.\n\n### 🗺️ ORDEM NATURAL DA CONVERSA\n\n(1) Necessidade → (2) PN + Quantidade → (3) **Aeronave + Urgência juntas** → \`envia_pn\`\n\n⚠️ **NUNCA pergunte urgência ANTES de ter PN.**\n⚠️ Aeronave + urgência sempre juntas, NÃO em turnos separados.\n\n### 🚪 ABERTURA — TOM CONSULTIVO\n\n**Se PRIMEIRA mensagem do cliente foi só "oi" / "olá" / saudação vazia:**\n→ Responda: "Olá! Aqui é o Jet, da Amazon Jet Aviation. Como posso te ajudar?"\n\n**Se PRIMEIRA mensagem JÁ trouxe PN / foto / pedido de cotação:**\n→ Reconheça AGINDO + faça AS DUAS perguntas estratégicas juntas:\n→ "Recebi seu PN! Já vou iniciar sua cotação. Pra agilizar, me confirma:\n   • Modelo da aeronave?\n   • Urgência (AOG ou rotina)?"\n\nNUNCA faça abertura genérica se cliente já deu contexto.\n\n### 🛠️ DECISÃO DE TOOL (use o INVENTÁRIO acima)\n\n**Tem PN + QTD + URGÊNCIA?**\n→ CHAME \`envia_pn\` AGORA com items + general_notes (inclua "Aeronave: {modelo}" se foi coletada).\n→ Só DEPOIS do {ok:true}, responda com fechamento + recap + pergunta consultiva:\n\n**AOG:**\n"Dados enviados ao AOG Desk. Especialista vai te contatar agora.\\n\\nConfirmei o pedido:\\n• {PN1} — {qtd1} un\\n• {PN2} — {qtd2} un\\n\\nEssa peça é crítica pra sua operação hoje?"\n\n**Rotina:**\n"Já estou verificando disponibilidade e melhores condições. Especialista retorna com a cotação em até 48h úteis.\\n\\nConfirmei o pedido:\\n• {PN1} — {qtd1} un\\n\\nCostuma usar esse item com frequência ou é pontual?"\n\n⚠️ Use exatamente os PN(s) e quantidade(s) passados no envia_pn.\n⚠️ Se cliente claramente está com pressa, OMITA a pergunta consultiva final.\n\n**Falta PN?**\n→ Se cliente mencionou categoria/produto: confirme que vende + peça PN + quantidade.\n→ Se cliente acabou de mandar possível PN: chame \`validate_part_number\` primeiro.\n→ Se múltiplos PNs (lista/planilha/PDF): chame \`extract_part_numbers\` primeiro.\n\n**Tem PN mas falta QUANTIDADE?**\n→ Pergunte SÓ a quantidade: "Quantas unidades?"\n\n**Tem PN + QTD mas falta URGÊNCIA?**\n→ AGORA pergunte: "Última coisa — é AOG ou rotina?"\n\n### 🚨 PROIBIÇÕES ABSOLUTAS\n\n1. **NUNCA diga "Dados enviados" / "Recebi os dados" / "Especialista vai te contatar" SEM ter chamado \`envia_pn\` e recebido {ok:true}.** Mentir pro cliente é PROIBIDO.\n\n2. **NUNCA pergunte urgência antes de ter o PN.** Ordem é PN → QTD → urgência. Sempre.\n\n3. **NUNCA repita pergunta cuja resposta JÁ tá no histórico.** "3 unidades" JÁ é quantidade. "AOG" JÁ é urgência. Use, não pergunte de novo.\n\n4. **NUNCA rejeite categoria aeronáutica.** "tem fone Bose?", "tem pneu?", "tem GPS Garmin?" → SIM, temos + peça PN/modelo.\n\n5. **NUNCA diga "não vendemos esse PN"** sem ter chamado \`validate_part_number\` e recebido \`valid: false\`.\n\n### 🟢 RESPOSTA POSITIVA PARA CATEGORIAS\n\n- "tem pneu de avião?" → "Sim, trabalhamos com pneus aeronáuticos. Me passa o Part Number (vem na etiqueta) e a quantidade."\n- "vocês têm fone Bose?" → "Sim, atendemos Bose. Qual modelo (A20 ou A30)? E quantas unidades?"\n- "tem GPS Garmin?" → "Sim, trabalhamos com toda linha Garmin. Qual modelo (ex: GTN 750)? E quantos?"\n- "vendem peça pra Cessna?" → "Sim, atendemos toda aviação geral. Qual o Part Number da peça?"\n\n### 🧠 TOLERÂNCIA A TYPOS / VARIAÇÕES\n\n- "2 unifades" = "2 unidades". Aceite.\n- "urgente" / "agora" / "aeronave parada" → urgency=AOG\n- "sem pressa" / "quando der" / "normal" → urgency=rotina\n\n### 🏷️ TAGS (silencioso, invisível pro cliente)\n\n- Primeiro contato → add_label('novo_lead')\n- Pediu o PN → add_label('aguardando_pn')\n- Recebeu PN válido → remove_label('aguardando_pn') + add_label('pendente_orcamento')\n- Lead fechou → add_label('lead_ganho') / add_label('lead_perdido')\n\nNUNCA mencione tools/tags ao cliente.`
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

  // ⚠️ SAFETY NET contra "phantom send": se a resposta afirma que o lead foi
  // enviado mas envia_pn NÃO foi chamado, o lead nunca seria criado. Forçamos
  // a tool via toolChoice — o modelo extrai PN/qtd/urgência do histórico e
  // envia_pn cria o lead + notifica o vendedor. O texto de fechamento original
  // (que prometeu o envio) volta pro cliente, agora verdadeiro.
  const hasEnviaPnTool = !!tools && Object.prototype.hasOwnProperty.call(tools, 'envia_pn')
  const calledEnviaPn = allToolCalls.some(t => t.toolName === 'envia_pn')
  if (hasEnviaPnTool && !calledEnviaPn && claimsLeadSent(text)) {
    console.warn(`[agent] ⚠️ PHANTOM SEND: resposta afirma envio mas envia_pn NÃO foi chamado. Forçando envia_pn...`)
    try {
      const forced = await generateText({
        ...generateParams,
        toolChoice: { type: 'tool', toolName: 'envia_pn' },
        // 1 step = só a chamada forçada da tool (que executa e cria o lead).
        // Evita um 2o step com toolChoice 'auto' que poderia duplicar o lead.
        stopWhen: stepCountIs(1),
      } as Parameters<typeof generateText>[0])
      const forcedSteps = (forced as { steps?: Array<{ toolCalls?: Array<{ toolName?: string }> }> }).steps ?? []
      const ok = forcedSteps.some(s => (s.toolCalls ?? []).some(tc => tc.toolName === 'envia_pn'))
      console.log(`[agent] forced envia_pn → ${ok ? 'OK (lead criado)' : 'FALHOU (modelo não chamou mesmo forçado)'}`)
    } catch (err) {
      console.error(`[agent] forced envia_pn error:`, err)
    }
  }

  if (opts.saveUserMessage !== false) {
    await saveMessage(sessionId, 'user', userMessage)
  }
  await saveMessage(sessionId, 'assistant', text)

  return text
}
