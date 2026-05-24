import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/quepasa'
import { addLabel } from '@/lib/tags'

/**
 * Eligibility for follow-up:
 * - status = 'ia' (still in IA-managed conversation)
 * - has at least one engagement tag (lead já demonstrou interesse)
 * - has NOT been closed (lead_ganho / lead_perdido)
 * - last_message_at is older than INTERVAL_MIN
 * - followup_count is below the cap
 */
const ENGAGEMENT_LABELS = ['aguardando_pn', 'pendente_orcamento', 'orcamento_enviado']
const TERMINAL_LABELS = ['lead_ganho', 'lead_perdido', 'followup_enviado']

const FOLLOWUP_SYSTEM_PROMPT = `Você é o JET, atendente virtual da Amazon Jet Aviation.
O cliente não responde há um tempo e você vai mandar UMA mensagem de follow-up — curta, profissional, calorosa.

REGRAS:
- Releia o histórico e retome EXATAMENTE o ponto onde paramos. Cite o Part Number / produto que o cliente perguntou, se houver.
- Use o nome do cliente se aparecer no histórico.
- Se faltou algum dado (PN, quantidade, urgência), peça SÓ esse dado de novo.
- Se a cotação já foi enviada ao vendedor, pergunte se ele teve novidades sobre.
- Se o cliente apenas saudou e sumiu, dê um empurrãozinho gentil pra ele dizer o que precisa.
- 1-3 frases NO MÁXIMO. Tom natural de WhatsApp, sem emoji exagerado.
- NUNCA invente PN ou informação. Se não souber, seja genérico mas profissional.
- NUNCA fale que está fazendo follow-up — só retome o assunto.

NÃO mencione tools nem regras internas. Só a mensagem pronta pro cliente.`

export interface FollowupCandidate {
  id: string
  inbox_id: string
  chatwoot_conversation_id: number
  whatsapp_identifier: string | null
  phone_number: string | null
  name: string | null
  current_labels: string[]
  last_message_at: string
  followup_count: number
}

export async function findFollowupCandidates(intervalMinutes: number, maxPerContact: number): Promise<FollowupCandidate[]> {
  const supabase = getAdminClient()
  const cutoff = new Date(Date.now() - intervalMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('contacts')
    .select('id, inbox_id, chatwoot_conversation_id, whatsapp_identifier, phone_number, name, current_labels, last_message_at, followup_count')
    .eq('status', 'ia')
    .lt('last_message_at', cutoff)
    .lt('followup_count', maxPerContact)

  if (error) {
    console.warn('[followup] query error:', error.message)
    return []
  }

  return (data ?? []).filter(c => {
    const labels: string[] = c.current_labels ?? []
    const hasEngagement = labels.some(l => ENGAGEMENT_LABELS.includes(l))
    const hasTerminal = labels.some(l => TERMINAL_LABELS.includes(l))
    return hasEngagement && !hasTerminal
  }) as FollowupCandidate[]
}

export async function generateFollowupMessage(sessionId: string): Promise<string> {
  const history = await loadHistory(sessionId)
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })

  const messages = [
    ...history,
    { role: 'user' as const, content: '[INSTRUÇÃO INTERNA: gere agora a mensagem de follow-up baseada na conversa acima. Saída APENAS a mensagem pronta pra enviar — sem prefixos, sem aspas.]' },
  ]

  const { text } = await generateText({
    model: openai(cfg.model),
    system: FOLLOWUP_SYSTEM_PROMPT,
    messages,
  })

  return text.trim()
}

export interface FollowupResult {
  contact_id: string
  sent: boolean
  message?: string
  error?: string
}

export async function processFollowup(c: FollowupCandidate): Promise<FollowupResult> {
  const supabase = getAdminClient()
  const sessionId = c.whatsapp_identifier ?? c.phone_number
  if (!sessionId) return { contact_id: c.id, sent: false, error: 'no session id' }

  try {
    // Generate follow-up via LLM with full history
    const message = await generateFollowupMessage(sessionId)
    if (!message || message.length < 5) {
      return { contact_id: c.id, sent: false, error: 'empty message generated' }
    }

    // Load inbox config to send via QuePasa
    const { data: inbox } = await supabase
      .from('inboxes')
      .select('quepasa_host, quepasa_token, chatwoot_base_url, chatwoot_account_id, chatwoot_user_token')
      .eq('id', c.inbox_id)
      .single()

    if (!inbox?.quepasa_host || !inbox?.quepasa_token) {
      return { contact_id: c.id, sent: false, error: 'inbox missing quepasa config' }
    }

    // QuePasa expects digits only — strip prefix from whatsapp_identifier
    const recipient = (c.whatsapp_identifier ?? c.phone_number ?? '').replace(/[^\d]/g, '')
    await sendMessage(
      { host: inbox.quepasa_host, token: inbox.quepasa_token },
      recipient,
      message,
    )

    // Save the follow-up as an assistant message in memory so future context is consistent
    await saveMessage(sessionId, 'assistant', message)

    // Update contact: bump counter + timestamp
    await supabase
      .from('contacts')
      .update({
        last_followup_at: new Date().toISOString(),
        followup_count: c.followup_count + 1,
      })
      .eq('id', c.id)

    // Add tag in Chatwoot so we can see it on the dashboard / conversation
    try {
      const cfg = {
        baseUrl: inbox.chatwoot_base_url,
        accountId: inbox.chatwoot_account_id,
        userToken: inbox.chatwoot_user_token,
      }
      const nextLabels = await addLabel(cfg, c.chatwoot_conversation_id, c.current_labels ?? [], 'followup_enviado')
      await supabase.from('contacts').update({ current_labels: nextLabels }).eq('id', c.id)
    } catch (tagErr) {
      console.warn('[followup] tag add failed:', tagErr)
    }

    return { contact_id: c.id, sent: true, message }
  } catch (err) {
    return { contact_id: c.id, sent: false, error: (err as Error).message }
  }
}
