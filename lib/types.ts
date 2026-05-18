export interface ChatwootSender {
  id: number
  identifier: string
  name: string
  phone_number: string | null
  type: 'contact' | 'user'
}

export interface ChatwootMessage {
  id: number
  content: string | null
  message_type: number // 0 = incoming, 1 = outgoing
  sender_type: 'Contact' | 'User'
  sender: ChatwootSender
}

export interface ChatwootWebhookBody {
  id: number
  messages: ChatwootMessage[]
  meta: {
    sender: ChatwootSender
  }
  event: string
}

export interface ChatwootWebhookPayload {
  body: ChatwootWebhookBody
}

export interface MemoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface InboxConfig {
  id: string
  name: string
  chatwoot_base_url: string
  chatwoot_account_id: number
  chatwoot_inbox_id: number
  chatwoot_user_token: string
  quepasa_host: string | null
  quepasa_token: string | null
  system_prompt: string
  enabled: boolean
}

export interface OpenAIConfig {
  apiKey: string
  model: string
}

export interface QuePasaConfig {
  host: string
  token: string
}

export const BUSINESS_LABELS = [
  'novo_lead',
  'aguardando_pn',
  'pendente_orcamento',
  'orcamento_enviado',
  'lead_ganho',
  'lead_perdido',
] as const

export type BusinessLabel = typeof BUSINESS_LABELS[number]

export const SYSTEM_LABEL = 'atendimento_ia' as const
export type SystemLabel = typeof SYSTEM_LABEL

export const TERMINAL_LABELS = ['lead_ganho', 'lead_perdido'] as const
export type TerminalLabel = typeof TERMINAL_LABELS[number]

export type ContactStatus = 'ia' | 'humano' | 'encerrado'

export interface Contact {
  id: string
  inbox_id: string
  chatwoot_conversation_id: number
  chatwoot_contact_id: number | null
  name: string | null
  phone_number: string | null
  whatsapp_identifier: string | null
  current_labels: string[]
  status: ContactStatus
  last_message: string | null
  last_message_at: string | null
  message_count: number
  first_seen_at: string
  summary: string | null
  summary_generated_at: string | null
}

export interface ContactUpsertInput {
  inbox_id: string
  chatwoot_conversation_id: number
  chatwoot_contact_id?: number | null
  name?: string | null
  phone_number?: string | null
  whatsapp_identifier?: string | null
  current_labels: string[]
  last_message: string
  last_message_at: string
}

// ---------------- Analytics (Phase 3) ----------------

export interface AnalyticsKpiDeltas {
  newContacts: number
  receivedMessages: number
  aiOnlyPercent: number
  avgResponseTimeSec: number
  leadsWon: number
  leadsLost: number
  conversionRate: number
}

export interface AnalyticsKpis {
  newContacts: number
  receivedMessages: number
  aiOnlyPercent: number          // 0..1
  avgResponseTimeSec: number
  leadsWon: number
  leadsLost: number
  conversionRate: number         // 0..1
  activeNow: number
  deltas: AnalyticsKpiDeltas
}

export interface FunnelStage {
  stage: string
  count: number
  conversionFromPrev: number | null  // 0..1, null no primeiro
}

export interface VolumePoint {
  date: string                    // YYYY-MM-DD
  messages: number
  newContacts: number
}

export interface TagCount {
  tag: string
  count: number
}

export interface InboxCount {
  inbox_id: string
  name: string
  count: number
}

export interface TopContact {
  id: string
  name: string | null
  phone_number: string | null
  current_labels: string[]
  message_count: number
  status: ContactStatus
  last_message_at: string | null
}

export interface AnalyticsResponse {
  kpis: AnalyticsKpis
  funnel: FunnelStage[]
  statusDistribution: { ia: number; humano: number; encerrado: number }
  volumeOverTime: VolumePoint[]
  tagDistribution: TagCount[]
  inboxDistribution: InboxCount[]
  topContacts: TopContact[]
}
