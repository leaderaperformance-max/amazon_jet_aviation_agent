import { getAdminClient } from '@/lib/supabase/admin'
import { addLabel } from '@/lib/tags'
import { SYSTEM_LABEL } from '@/lib/types'
import { REACTIVATIONS_TABLE } from '@/lib/human-handoff'

/**
 * "#ia" numa NOTA PRIVADA do Chatwoot = atendente devolvendo a conversa pra IA antes
 * das 24h de pausa (lib/human-handoff.ts). Aceita "#ia", "#IA", "ok #ia volta"; não
 * pega "#iate" nem "via#ia".
 */
export function isReactivationCommand(text: string | null | undefined): boolean {
  return /(^|\s)#ia(?![a-z0-9_À-ÿ])/i.test(text ?? '')
}

/**
 * Sem nota de confirmação automática de propósito: a ponte WhatsApp (QuePasa) recebe
 * as mensagens de saída do Chatwoot e não temos como garantir que ela descarta notas
 * privadas — uma confirmação poderia chegar no WhatsApp do cliente. A prova de que
 * funcionou é a IA voltar a responder (e a linha em ia_reactivations).
 */
export async function reactivateAI(input: {
  sessionId: string
  conversationId: number
  labels: string[]
  chatwootCfg: { baseUrl: string; accountId: number; userToken: string }
  by: string | null
}): Promise<void> {
  const { error } = await getAdminClient()
    .from(REACTIVATIONS_TABLE)
    .upsert({
      session_id: input.sessionId,
      reactivated_at: new Date().toISOString(),
      reactivated_by: input.by,
      conversation_id: input.conversationId,
    }, { onConflict: 'session_id' })
  if (error) throw new Error(`reativação da IA falhou: ${error.message}`)

  // Sem a etiqueta a conversa continua em handoff — "#ia" devolve a etiqueta também.
  try {
    await addLabel(input.chatwootCfg, input.conversationId, input.labels, SYSTEM_LABEL)
  } catch (err) {
    console.warn('[ia-reactivation] addLabel falhou (não fatal):', err)
  }
}
