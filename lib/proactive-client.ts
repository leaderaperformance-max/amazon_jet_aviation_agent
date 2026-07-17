import { ensureClientConversation } from '@/lib/chatwoot-outbound'
import { sendChatwootReply } from '@/lib/chatwoot-send'
import { sendMessage } from '@/lib/quepasa'
import { saveMessage } from '@/lib/memory'
import { addLabel } from '@/lib/tags'

export function buildProactiveMessage(input: {
  clientName: string
  resellerName: string
  items: Array<{ part_number: string; quantity: string }>
}): string {
  const many = input.items.length > 6
  const lead = many
    ? `Recebemos sua solicitação de cotação através do seu consultor ${input.resellerName}.`
    : `Recebemos seu pedido de cotação através do seu consultor ${input.resellerName}:\n`
      + input.items.map(it => `• ${it.part_number} — Qtd ${it.quantity}`).join('\n')
  return [
    `Olá, ${input.clientName}! Aqui é da Amazon Jet Aviation ✈️`, '',
    lead, '',
    'Nosso time já está trabalhando no seu orçamento e em breve retornamos com uma posição. Qualquer coisa, pode falar com a gente por aqui! 🙂',
  ].join('\n')
}

/** Alcança o cliente final proativamente (fluxo revendedor). Best-effort: não deve derrubar o disparo do grupo. */
export async function reachOutToClient(input: {
  chatwootCfg: { baseUrl: string; accountId: number; userToken: string }
  inboxId: number
  clientPhone: string
  clientName: string
  resellerName: string
  items: Array<{ part_number: string; quantity: string }>
  quepasaCfg?: { host: string; token: string } | null
  /** Etiqueta de qualificação posta na conversa do CLIENTE → dispara o card no Kanban (automação Chatwoot). */
  qualificationLabel?: string
}): Promise<void> {
  const text = buildProactiveMessage({
    clientName: input.clientName, resellerName: input.resellerName, items: input.items,
  })
  try {
    const { conversationId } = await ensureClientConversation(input.chatwootCfg, {
      phone: input.clientPhone, name: input.clientName, inboxId: input.inboxId,
    })
    // Etiqueta na conversa do CLIENTE → a automação do Chatwoot cria o card no funil.
    if (input.qualificationLabel) {
      try {
        await addLabel(input.chatwootCfg, conversationId, [], input.qualificationLabel)
      } catch (e) {
        console.warn(`[proactive] addLabel falhou (não fatal): ${(e as Error).message?.slice(0, 150)}`)
      }
    }
    await sendChatwootReply(input.chatwootCfg, conversationId, text)
  } catch (err) {
    console.warn(`[proactive] Chatwoot falhou, fallback QuePasa: ${(err as Error).message?.slice(0, 200)}`)
    if (input.quepasaCfg) {
      await sendMessage(input.quepasaCfg, input.clientPhone, text)
    }
  }
  // Semeia a memória do cliente (best-effort). NOTA: memória é keyada por sessionId
  // (= senderIdent do WhatsApp), que pode diferir do telefone normalizado. O mecanismo
  // CONFIÁVEL de contexto é o buildQuoteContextDirective (keyado por telefone). Este save
  // é um complemento pro histórico ficar coerente se as chaves casarem.
  await saveMessage(input.clientPhone, 'assistant', text)
}
