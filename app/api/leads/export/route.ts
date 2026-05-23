import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

/**
 * GET /api/leads/export?status=&urgency=&from=&to=
 *
 * Returns a CSV of leads matching the filters. Used by the "Exportar CSV"
 * button in the dashboard. All filters are optional.
 */
export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const urgency = url.searchParams.get('urgency')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  let query = supabase
    .from('leads')
    .select('*, contacts(name, phone_number)')
    .order('sent_to_seller_at', { ascending: false })

  if (status && ['pendente', 'em_atendimento', 'fechado_ganho', 'fechado_perdido'].includes(status)) {
    query = query.eq('status', status)
  }
  if (urgency && ['AOG', 'rotina'].includes(urgency)) {
    query = query.eq('urgency', urgency)
  }
  if (from) query = query.gte('sent_to_seller_at', from)
  if (to) {
    // Make `to` inclusive (end of day)
    const d = new Date(to + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    query = query.lt('sent_to_seller_at', d.toISOString().slice(0, 10))
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const headers = [
    'enviado_em', 'cliente', 'whatsapp', 'part_number', 'quantidade',
    'urgencia', 'status', 'notas',
  ]

  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const rows = (data ?? []).map(l => {
    const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
    return [
      l.sent_to_seller_at,
      l.customer_name ?? contact?.name ?? '',
      l.customer_phone ?? contact?.phone_number ?? '',
      l.part_number,
      l.quantity,
      l.urgency,
      l.status,
      l.notes ?? '',
    ].map(escape).join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  const filename = `leads-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
