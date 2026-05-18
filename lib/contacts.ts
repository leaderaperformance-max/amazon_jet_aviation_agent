import { getAdminClient } from '@/lib/supabase/admin'
import type { Contact, ContactStatus, ContactUpsertInput } from '@/lib/types'
import { SYSTEM_LABEL, TERMINAL_LABELS } from '@/lib/types'

const TABLE = 'contacts'

function computeStatus(labels: string[]): ContactStatus {
  if (labels.some(l => (TERMINAL_LABELS as readonly string[]).includes(l))) return 'encerrado'
  if (labels.includes(SYSTEM_LABEL)) return 'ia'
  return 'humano'
}

export interface UpsertResult {
  contact: Contact
  wasNew: boolean
}

export async function upsertContact(input: ContactUpsertInput): Promise<UpsertResult> {
  const supabase = getAdminClient()
  const status = computeStatus(input.current_labels)

  const { data: existing } = await supabase
    .from(TABLE)
    .select('id, message_count')
    .eq('inbox_id', input.inbox_id)
    .eq('chatwoot_conversation_id', input.chatwoot_conversation_id)
    .maybeSingle()

  const wasNew = !existing
  const nextCount = ((existing as { message_count: number } | null)?.message_count ?? 0) + 1

  const payload = {
    inbox_id: input.inbox_id,
    chatwoot_conversation_id: input.chatwoot_conversation_id,
    chatwoot_contact_id: input.chatwoot_contact_id ?? null,
    name: input.name ?? null,
    phone_number: input.phone_number ?? null,
    whatsapp_identifier: input.whatsapp_identifier ?? null,
    current_labels: input.current_labels,
    status,
    last_message: input.last_message,
    last_message_at: input.last_message_at,
    message_count: nextCount,
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'inbox_id,chatwoot_conversation_id' })
    .select()
    .single()

  if (error) throw error
  return { contact: data as Contact, wasNew }
}

export async function getContactById(id: string): Promise<Contact | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as Contact) ?? null
}

export async function updateContactLabels(
  contactId: string,
  labels: string[]
): Promise<void> {
  const supabase = getAdminClient()
  await supabase
    .from(TABLE)
    .update({ current_labels: labels, status: computeStatus(labels) })
    .eq('id', contactId)
}
