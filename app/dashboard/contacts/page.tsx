import { getServerClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContactsTable } from '@/components/contacts-table'
import type { Contact } from '@/lib/types'

const PAGE_SIZE = 50

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; inbox_id?: string; page?: string }
}) {
  const supabase = getServerClient()

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const q = searchParams.q?.trim()
  const status = searchParams.status
  const inboxId = searchParams.inbox_id

  let query = supabase.from('contacts').select('*', { count: 'exact' })
  if (q) query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%,whatsapp_identifier.ilike.%${q}%`)
  if (status && ['ia', 'humano', 'encerrado'].includes(status)) query = query.eq('status', status)
  if (inboxId) query = query.eq('inbox_id', inboxId)
  query = query.order('last_message_at', { ascending: false, nullsFirst: false })
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data: contacts, count } = await query
  const { data: inboxes } = await supabase
    .from('inboxes')
    .select('id, name, chatwoot_base_url, chatwoot_account_id')

  return (
    <Card>
      <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
      <CardContent>
        <ContactsTable
          contacts={(contacts ?? []) as Contact[]}
          total={count ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          inboxes={inboxes ?? []}
        />
      </CardContent>
    </Card>
  )
}
