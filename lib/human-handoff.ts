import { getAdminClient } from '@/lib/supabase/admin'
import { phoneMatchCandidates } from '@/lib/phone'

/**
 * IA FORA da conversa enquanto um atendente humano conduz.
 *
 * Regra de negócio (set/2026, pedido da Alessandra: "desativei e ter algum outro
 * mecanismo pra ela poder ativar de novo. Tipo um dia de espera"): quando um atendente
 * humano fala com o cliente, a IA sai daquela conversa por 24h — MESMO com a etiqueta
 * atendimento_ia. Antes ela respondia a próxima mensagem do cliente por cima do
 * atendente (49 casos em 14 dias). Pra trazer a IA de volta antes das 24h, o atendente
 * escreve uma nota privada "#ia" (lib/ia-reactivation.ts).
 */

const MEMORY_TABLE = 'memory_chat_amazon_jet'
export const REACTIVATIONS_TABLE = 'ia_reactivations'
const AGENT_PREFIX = '[atendente]:'

/**
 * Folga pra corrida entre os dois webhooks do Chatwoot: a fala do atendente (automação)
 * e a nota "#ia" (webhook da conta) chegam por filas diferentes e podem inverter a ordem
 * por alguns segundos. Fala registrada até 60s depois do "#ia" ainda conta como anterior.
 */
const REACTIVATION_GRACE_MS = 60_000

/** Horas que a IA fica FORA depois que um humano falou na conversa. */
export function humanCooldownHours(): number {
  const n = parseInt(process.env.SLA_HUMAN_COOLDOWN_HOURS ?? '24', 10)
  return Number.isFinite(n) && n >= 0 ? n : 24
}

/**
 * Pura: o atendente humano está conduzindo a conversa?
 * - nenhum atendente falou → não
 * - "#ia" depois da última fala do atendente → não (reativada)
 * - senão → sim, enquanto estiver dentro da janela
 */
export function humanIsHandling(
  lastAgentMs: number | null,
  nowMs: number,
  cooldownHours: number,
  reactivatedMs: number | null = null,
): boolean {
  if (lastAgentMs === null) return false
  if (reactivatedMs !== null && reactivatedMs + REACTIVATION_GRACE_MS >= lastAgentMs) return false
  return nowMs - lastAgentMs < cooldownHours * 3_600_000
}

/**
 * Textos que o PRÓPRIO sistema envia pela API do Chatwoot e que voltam pelo webhook como
 * se fossem de um atendente. Hoje: o contato proativo com o cliente final do consultor
 * (buildProactiveMessage). Exige as duas assinaturas pra não confundir com um vendedor
 * que cumprimente parecido.
 */
export function isSystemTemplateText(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  return /^Olá, [^\n]{1,80}! Aqui é da Amazon Jet Aviation/.test(t) && t.includes('através do seu consultor')
}

/** Chaves de memória em que a mesma pessoa pode estar: JID, só dígitos, com/sem o 9. */
export function sessionKeyVariants(sessionId: string): string[] {
  const out = new Set<string>([sessionId])
  const local = sessionId.split('@')[0]
  if (/^\d{8,15}$/.test(local)) {
    for (const c of phoneMatchCandidates(local)) {
      out.add(c)
      out.add(`${c}@s.whatsapp.net`)
    }
  }
  return Array.from(out)
}

const normalizeText = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * A mensagem que chegou como "atendente" é eco de algo que o sistema acabou de enviar?
 * Mensagens enviadas pela API do Chatwoot (contato proativo, respostas do Site/Instagram)
 * saem no nome do usuário do sistema — o mesmo usuário das mensagens digitadas direto
 * no celular da empresa. Por isso a checagem é pelo CONTEÚDO: mesmo texto que a IA
 * salvou na memória dessa pessoa nos últimos minutos.
 */
export async function isEchoOfOwnMessage(sessionId: string, text: string, windowMinutes = 15): Promise<boolean> {
  const body = normalizeText(text ?? '')
  if (!body) return false
  if (isSystemTemplateText(body)) return true
  try {
    const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
    const { data, error } = await getAdminClient()
      .from(MEMORY_TABLE)
      .select('message')
      .in('session_id', sessionKeyVariants(sessionId))
      .gt('created_at', since)
      .order('id', { ascending: false })
      .limit(30)
    if (error || !data) return false
    return (data as Array<{ message?: { type?: string; content?: string } }>).some(
      r => r.message?.type === 'ai' && normalizeText(r.message.content ?? '') === body,
    )
  } catch (err) {
    console.warn('[human-handoff] checagem de eco falhou (tratando como atendente):', err)
    return false
  }
}

/** Quando o atendente humano ([atendente]:) falou pela última vez nessa conversa. */
export async function lastAgentMessageAtMs(sessionId: string): Promise<number | null> {
  const { data } = await getAdminClient()
    .from(MEMORY_TABLE)
    .select('message, created_at')
    .eq('session_id', sessionId)
    .order('id', { ascending: false })
    .limit(40)
  const rows = (data ?? []) as Array<{ message: { type: string; content: string }; created_at: string }>
  for (const r of rows) {
    const content = r.message?.content ?? ''
    if (r.message?.type !== 'human' || !content.startsWith(AGENT_PREFIX)) continue
    // Eco antigo do contato proativo salvo como [atendente] não é humano.
    if (isSystemTemplateText(content.slice(AGENT_PREFIX.length))) continue
    return new Date(r.created_at).getTime()
  }
  return null
}

/** Quando um atendente devolveu a conversa pra IA com a nota privada "#ia". */
export async function lastReactivationAtMs(sessionId: string): Promise<number | null> {
  const { data, error } = await getAdminClient()
    .from(REACTIVATIONS_TABLE)
    .select('reactivated_at')
    .eq('session_id', sessionId)
    .maybeSingle()
  const at = (data as { reactivated_at?: string } | null)?.reactivated_at
  if (error || !at) return null
  const ms = Date.parse(at)
  return Number.isFinite(ms) ? ms : null
}

/** O atendente humano está conduzindo essa conversa agora? (IA deve ficar em silêncio) */
export async function isHumanHandling(sessionId: string, nowMs = Date.now()): Promise<boolean> {
  const lastAgent = await lastAgentMessageAtMs(sessionId)
  if (lastAgent === null) return false
  const reactivated = await lastReactivationAtMs(sessionId)
  return humanIsHandling(lastAgent, nowMs, humanCooldownHours(), reactivated)
}
