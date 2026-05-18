import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const urgency = url.searchParams.get('urgency')

  let query = supabase
    .from('leads')
    .select('*, contacts(name, phone_number, whatsapp_identifier, inbox_id)')

  if (status && ['pendente', 'em_atendimento', 'fechado_ganho', 'fechado_perdido'].includes(status)) {
    query = query.eq('status', status)
  }
  if (urgency && ['AOG', 'rotina'].includes(urgency)) {
    query = query.eq('urgency', urgency)
  }

  // AOG first, then by date desc
  query = query.order('urgency', { ascending: true }).order('sent_to_seller_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}
