import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/quepasa'

/**
 * POST /api/leads/[id]/resend
 *
 * Re-sends the seller notification for an existing lead via WhatsApp.
 * Useful when the seller missed the original notification.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Load lead + related contact + inbox config
  const { data: lead, error } = await supabase
    .from('leads')
    .select(`
      id, part_number, quantity, urgency, customer_name, customer_phone, notes,
      contact_id,
      contacts!inner (
        chatwoot_conversation_id,
        inbox_id,
        inboxes!inner (
          chatwoot_base_url, chatwoot_account_id,
          quepasa_host, quepasa_token, seller_phone
        )
      )
    `)
    .eq('id', params.id)
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }

  // PostgREST returns nested as object or array depending on join — normalize
  const contact = Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts
  if (!contact) return NextResponse.json({ error: 'contact missing' }, { status: 500 })
  const inbox = Array.isArray(contact.inboxes) ? contact.inboxes[0] : contact.inboxes
  if (!inbox) return NextResponse.json({ error: 'inbox missing' }, { status: 500 })

  if (!inbox.seller_phone || !inbox.quepasa_host || !inbox.quepasa_token) {
    return NextResponse.json({ error: 'inbox not configured for seller notifications' }, { status: 400 })
  }

  const chatwootUrl = `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${contact.chatwoot_conversation_id}`
  const urgencyEmoji = lead.urgency === 'AOG' ? '🔴' : '🟡'

  const sellerMsg = [
    '🔁 *REENVIO — LEAD QUALIFICADO*',
    '',
    `👤 *Cliente:* ${lead.customer_name ?? '(sem nome)'}`,
    `📱 *WhatsApp:* ${lead.customer_phone ?? '(não informado)'}`,
    `⚡ *Urgência:* ${lead.urgency} ${urgencyEmoji}`,
    '',
    `🔧 *Part Number:* ${lead.part_number}`,
    `🔢 *Quantidade:* ${lead.quantity}`,
    lead.notes ? `📝 ${lead.notes}` : null,
    '',
    '🔗 Atender em:',
    chatwootUrl,
  ].filter(Boolean).join('\n')

  try {
    await sendMessage(
      { host: inbox.quepasa_host, token: inbox.quepasa_token },
      inbox.seller_phone,
      sellerMsg
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
