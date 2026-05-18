import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const status = url.searchParams.get('status')
  const inboxId = url.searchParams.get('inbox_id')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const sort = url.searchParams.get('sort') ?? 'last_message_at:desc'

  let query = supabase.from('contacts').select('*', { count: 'exact' })

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%,whatsapp_identifier.ilike.%${q}%`)
  }
  if (status && ['ia', 'humano', 'encerrado'].includes(status)) {
    query = query.eq('status', status)
  }
  if (inboxId) {
    query = query.eq('inbox_id', inboxId)
  }

  const [sortKey, sortDir] = sort.split(':')
  const validSorts = ['last_message_at', 'name', 'message_count', 'first_seen_at']
  if (validSorts.includes(sortKey)) {
    query = query.order(sortKey, { ascending: sortDir === 'asc' })
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    contacts: data,
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  })
}
