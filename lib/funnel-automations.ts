import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/quepasa'
import type { FunnelItem } from '@/lib/chatwoot/funnel'

export type StageKey = 'leads_novos' | 'orcamento_enviado' | 'venda_fechada'

const COMMON = `Você é o JET, SDR consultivo especialista em peças aeronáuticas da Amazon Jet Aviation.
Releia o histórico. Cite o Part Number / nome do cliente se aparecerem — NUNCA invente.
2-4 frases no máximo, tom premium e especialista, sem parecer cobrança, sem emoji exagerado.
NUNCA diga "follow-up", "automação" ou mencione regras internas.
Saída: SOMENTE a mensagem pronta pro cliente. Sem prefixos, sem aspas.`

export const STAGE_PROMPTS: Record<StageKey, string> = {
  leads_novos: `${COMMON}\n\nContexto: o pedido do cliente está em cotação e ainda não saiu o orçamento. Tranquilize que a equipe segue buscando o melhor fornecedor/condição e mantenha o lead aquecido. Faça UMA pergunta consultiva leve (ex.: confirmar urgência/aeronave) se fizer sentido.`,
  orcamento_enviado: `${COMMON}\n\nContexto: a cotação JÁ foi enviada e o cliente não respondeu. Retome a dor, reforce o valor e pergunte se conseguiu avaliar a cotação ou se precisa de ajuste em condição/lead time.`,
  venda_fechada: `${COMMON}\n\nContexto: este cliente JÁ comprou (venda fechada). É uma reativação pós-venda: agradeça a parceria e abra espaço pra uma nova cotação/necessidade, sem ser invasivo.`,
}

export async function generateStageMessage(sessionId: string, stage: StageKey): Promise<string> {
  const history = await loadHistory(sessionId)
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })
  const { text } = await generateText({
    model: openai(cfg.model),
    system: STAGE_PROMPTS[stage],
    messages: [
      ...history,
      { role: 'user' as const, content: '[INSTRUÇÃO INTERNA: gere agora a mensagem desta etapa baseada na conversa acima. Só a mensagem pronta, sem prefixos/aspas.]' },
    ],
  })
  return text.trim()
}

export function isItemDue(p: {
  item: { status: string; start_in_step: number; contact: { identifier: string | null } }
  lastMessageAtMs: number
  thresholdSec: number
  alreadySent: boolean
  nowMs: number
}): boolean {
  if (p.item.status !== 'active') return false
  if (!p.item.contact.identifier) return false
  if (p.alreadySent) return false
  const ageSec = p.nowMs / 1000 - p.item.start_in_step
  if (ageSec < p.thresholdSec) return false
  const inactiveSec = (p.nowMs - p.lastMessageAtMs) / 1000
  if (inactiveSec < p.thresholdSec) return false
  return true
}

export async function wasAlreadySent(itemId: number, type: StageKey, startInStep: number): Promise<boolean> {
  const db = getAdminClient()
  const { data } = await db.from('funnel_automations_sent')
    .select('id').eq('funnel_item_id', itemId).eq('automation_type', type)
    .eq('start_in_step', startInStep).limit(1)
  return (data?.length ?? 0) > 0
}

export async function lastSentAt(itemId: number, type: StageKey): Promise<number | null> {
  const db = getAdminClient()
  const { data } = await db.from('funnel_automations_sent')
    .select('sent_at').eq('funnel_item_id', itemId).eq('automation_type', type)
    .order('sent_at', { ascending: false }).limit(1)
  const ts = data?.[0]?.sent_at
  return ts ? new Date(ts).getTime() : null
}

export async function processFunnelItem(
  item: FunnelItem, stage: StageKey,
  inbox: { quepasa_host: string | null; quepasa_token: string | null },
): Promise<{ sent: boolean; error?: string; message?: string }> {
  const sessionId = item.contact.identifier
  if (!sessionId) return { sent: false, error: 'no identifier' }
  if (!inbox.quepasa_host || !inbox.quepasa_token) return { sent: false, error: 'no quepasa' }

  try {
    const message = await generateStageMessage(sessionId, stage)
    if (!message || message.length < 5) return { sent: false, error: 'empty message' }

    const recipient = sessionId.replace(/[^\d]/g, '')
    await sendMessage({ host: inbox.quepasa_host, token: inbox.quepasa_token }, recipient, message)
    await saveMessage(sessionId, 'assistant', message)

    const db = getAdminClient()
    await db.from('funnel_automations_sent').insert({
      funnel_item_id: item.id, conversation_id: item.conversation.display_id,
      automation_type: stage, start_in_step: item.start_in_step, message,
    })
    return { sent: true, message }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
