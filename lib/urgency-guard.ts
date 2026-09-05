import { loadHistory } from '@/lib/memory'

/**
 * Trava de AOG.
 *
 * Regra do negócio: AOG é prioridade máxima e só vale quando o CLIENTE diz "AOG"
 * com todas as letras. "É urgente", "emergência", "o mais rápido possível",
 * "aeronave parada" — nada disso classifica como AOG por conta própria; se todo
 * mundo entra como AOG, o AOG de verdade perde a prioridade.
 *
 * Aqui a garantia é determinística: se a IA marcar AOG sem o cliente ter falado
 * a palavra, a urgência cai para "rotina".
 */

/** Só a sigla escrita: AOG, A.O.G, aircraft on ground. */
const AOG_TERM = /\bA\.?\s?O\.?\s?G\b|aircraft\s+on\s+ground/i

/** Pura: o CLIENTE falou "AOG" em alguma das mensagens dele? */
export function clientMentionedAOG(clientMessages: Array<string | null | undefined>): boolean {
  return clientMessages.some(m => !!m && AOG_TERM.test(m))
}

/**
 * Confere no histórico da conversa (mensagens do cliente) + na mensagem atual se
 * a palavra AOG realmente apareceu. Mensagens do vendedor ([atendente]:) e da
 * própria IA não contam — senão a IA se auto-confirma.
 */
export async function clientSaidAOG(sessionId: string, currentMessage?: string): Promise<boolean> {
  try {
    const history = await loadHistory(sessionId)
    const fromClient = history
      .filter(h => h.role === 'user' && !h.content.startsWith('[atendente]:'))
      .map(h => h.content)
    if (currentMessage) fromClient.push(currentMessage)
    return clientMentionedAOG(fromClient)
  } catch (err) {
    console.warn('[urgency-guard] falha ao checar AOG no histórico:', err)
    return false // fail-closed: sem confirmação, não é AOG
  }
}
