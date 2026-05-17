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
