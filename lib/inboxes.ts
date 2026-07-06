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
  // Segurança: a chave é lida PRIMEIRO da env var (OPENAI_API_KEY) — lugar seguro
  // pra secrets. O banco (app_settings) é só fallback. O model segue do banco.
  const envKey = process.env.OPENAI_API_KEY?.trim()

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('openai_api_key, openai_model')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error

  const apiKey = envKey || data?.openai_api_key
  if (!apiKey) throw new Error('OpenAI API key não configurada (defina OPENAI_API_KEY na Vercel)')

  return { apiKey, model: data?.openai_model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini' }
}
