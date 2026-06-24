import { getAdminClient } from '@/lib/supabase/admin'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { addLabel } from '@/lib/tags'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { buildAgentTools } from '@/lib/process-incoming'
import { SYSTEM_LABEL } from '@/lib/types'

type Activity = 'responded' | 'newer_inbound' | 'silent'

export function classifyActivitySince(
  rows: Array<{ type: string; content: string }>,
): Activity {
  let newerInbound = false
  for (const r of rows) {
    const isAtendente = r.type === 'human' && r.content.startsWith('[atendente]:')
    if (r.type === 'ai' || isAtendente) return 'responded'
    if (r.type === 'human') newerInbound = true
  }
  return newerInbound ? 'newer_inbound' : 'silent'
}

export async function activitySince(sessionId: string, sinceAt: string): Promise<Activity> {
  const db = getAdminClient()
  const { data } = await db.from('memory_chat_amazon_jet')
    .select('message, created_at').eq('session_id', sessionId).gt('created_at', sinceAt)
  const rows = (data ?? []).map((r: { message: { type: string; content: string } }) => r.message)
  return classifyActivitySince(rows)
}

const TAKEOVER_NUDGE =
  '[INSTRUÇÃO INTERNA: o cliente está aguardando resposta há 15 min e o vendedor humano não retornou. ' +
  'Assuma o atendimento AGORA e responda com base em TODO o histórico, inclusive o que o vendedor [atendente] já falou. ' +
  'Nunca contradiga nem repita o que o vendedor disse. Só a mensagem pronta pro cliente.]'

export async function checkAndTakeover(p: {
  sessionId: string; sinceAt: string; conversationId: number; chatwootInboxId: number
}): Promise<{ action: 'skipped_responded' | 'skipped_newer' | 'took_over' | 'error'; error?: string }> {
  const activity = await activitySince(p.sessionId, p.sinceAt)
  if (activity === 'responded') return { action: 'skipped_responded' }
  if (activity === 'newer_inbound') return { action: 'skipped_newer' }

  try {
    const inbox = await loadInboxByChatwootId(p.chatwootInboxId)
    if (!inbox || !inbox.enabled) return { action: 'error', error: 'inbox unavailable' }

    const chatwootCfg = {
      baseUrl: inbox.chatwoot_base_url, accountId: inbox.chatwoot_account_id, userToken: inbox.chatwoot_user_token,
    }
    const db = getAdminClient()
    const { data: contact } = await db.from('contacts')
      .select('id, current_labels').eq('whatsapp_identifier', p.sessionId).maybeSingle()
    if (!contact) return { action: 'error', error: 'contact not found' }

    const labels = await addLabel(chatwootCfg, p.conversationId, contact.current_labels ?? [], SYSTEM_LABEL)
    await db.from('contacts').update({ current_labels: labels, status: 'ia' }).eq('id', contact.id)

    const { tools, getLabels } = buildAgentTools({
      inbox, conversationId: p.conversationId, contactId: contact.id,
      senderName: null, senderPhone: null, chatwootCfg, initialLabels: labels,
    })
    const openai = await loadOpenAIConfig()
    const reply = await runAgent(
      p.sessionId, TAKEOVER_NUDGE, inbox.system_prompt, openai.apiKey, openai.model,
      tools, getLabels(), { saveUserMessage: false },
    )
    const recipient = p.sessionId.replace(/[^\d]/g, '')
    if (inbox.quepasa_host && inbox.quepasa_token) {
      await sendMessage({ host: inbox.quepasa_host, token: inbox.quepasa_token }, recipient, reply)
    }
    return { action: 'took_over' }
  } catch (err) {
    return { action: 'error', error: (err as Error).message }
  }
}
