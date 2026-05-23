import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { addLabel, removeLabel } from '@/lib/tags'

const STATUS_TO_LABEL: Record<string, string | null> = {
  pendente: null,
  em_atendimento: null,
  fechado_ganho: 'lead_ganho',
  fechado_perdido: 'lead_perdido',
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const status = body.status as string
  if (!['pendente', 'em_atendimento', 'fechado_ganho', 'fechado_perdido'].includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  // 1. Update lead status
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', params.id)
    .select('contact_id')
    .single()

  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 })

  // 2. If status maps to a Chatwoot label, sync it
  const targetLabel = STATUS_TO_LABEL[status]
  if (targetLabel && lead?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('chatwoot_conversation_id, current_labels, inbox_id')
      .eq('id', lead.contact_id)
      .single()

    if (contact?.chatwoot_conversation_id) {
      const { data: inbox } = await supabase
        .from('inboxes')
        .select('chatwoot_base_url, chatwoot_account_id, chatwoot_user_token')
        .eq('id', contact.inbox_id)
        .single()

      if (inbox) {
        const cfg = {
          baseUrl: inbox.chatwoot_base_url,
          accountId: inbox.chatwoot_account_id,
          userToken: inbox.chatwoot_user_token,
        }
        const labels: string[] = contact.current_labels ?? []

        // Remove the opposite outcome label, add the new one
        const opposite = targetLabel === 'lead_ganho' ? 'lead_perdido' : 'lead_ganho'
        let next = await removeLabel(cfg, contact.chatwoot_conversation_id, labels, opposite)
        next = await addLabel(cfg, contact.chatwoot_conversation_id, next, targetLabel)

        // Persist updated labels back to contacts row
        await supabase
          .from('contacts')
          .update({ current_labels: next })
          .eq('id', lead.contact_id)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
