import { getAdminClient } from '@/lib/supabase/admin'
import type { InboxConfig, OpenAIConfig } from '@/lib/types'

export async function loadInboxByChatwootId(chatwootInboxId: number): Promise<InboxConfig | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('inboxes')
    .select('*')
    .eq('chatwoot_inbox_id', chatwootInboxId)
    .maybeSingle()

  if (error) throw error
  return data as InboxConfig | null
}

export async function loadOpenAIConfig(): Promise<OpenAIConfig> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('openai_api_key, openai_model')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  if (!data?.openai_api_key) throw new Error('OpenAI API key não configurada')

  return { apiKey: data.openai_api_key, model: data.openai_model ?? 'gpt-4o-mini' }
}
