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

const FOLLOWUP_SYSTEM_PROMPT = `Você é o JET, SDR consultivo especialista em peças aeronáuticas da Amazon Jet Aviation.
O cliente não responde há um tempo e você vai mandar UMA mensagem de follow-up.

ESTRATÉGIA SPIN — não pareça cobrança. Recapitule a DOR + reforça VALOR + faça a pergunta:

1. Releia o histórico e identifique a DOR/necessidade que o cliente já trouxe (PN específico, urgência, aeronave parada, etc).
2. Recapitule essa dor de forma natural ("Sabendo que essa peça impacta a operação da sua aeronave...").
3. Reforça o que você pode entregar ("queremos garantir que sua demanda seja atendida no melhor prazo").
4. Faça UMA pergunta consultiva (não interrogativa) que abra a próxima etapa.

EXEMPLOS POR ESTADO:

**Se a cotação já foi enviada (orcamento_enviado) mas cliente sumiu:**
> "Sabendo que essa peça impacta diretamente sua operação, gostaria de garantir que sua demanda seja atendida no melhor prazo. Conseguiu olhar a cotação ou precisa de algum ajuste em condição/lead time?"

**Se faltou algum dado (PN, quantidade, aeronave, urgência):**
Retome a dor + peça SÓ o dado faltante de forma consultiva.
> "Pra avançar com sua cotação do MS21266, ainda preciso do modelo da aeronave. Me confirma rapidinho?"

**Se cliente só saudou e sumiu:**
Empurrão gentil sem pressionar.
> "Oi {nome}! Por aqui o JET, da Amazon Jet Aviation. Tem alguma peça que precisa cotar hoje? Posso priorizar pra você."

REGRAS:
- Use o nome do cliente se aparecer no histórico
- Cite o Part Number / produto se houver, NUNCA invente
- 2-4 frases NO MÁXIMO. Tom premium, especialista, sem emoji exagerado
- NUNCA pareça cobrança ou pressão
- NUNCA fale "estou fazendo follow-up" — só retome a conversa
- NUNCA mencione tools ou regras internas

Saída: SOMENTE a mensagem pronta pro cliente. Sem prefixos, sem aspas.`

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
