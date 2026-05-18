import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InboxToggle } from '@/components/inbox-toggle'

export default async function DashboardPage() {
  const supabase = getServerClient()
  const { data: inboxes } = await supabase
    .from('inboxes')
    .select('*')
    .order('created_at', { ascending: false })

  const total = inboxes?.length ?? 0
  const active = inboxes?.filter(i => i.enabled).length ?? 0

  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .gte('first_seen_at', since.toISOString())
  const { count: contactsTotal } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{todayCount ?? 0} <span className="text-base font-normal text-muted-foreground">hoje | {contactsTotal ?? 0} no total</span></p>
          <Link href="/dashboard/contacts" className="text-sm text-blue-600 hover:underline">Ver todos →</Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Status</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{active} <span className="text-base font-normal text-muted-foreground">de {total} inboxes ativas</span></p>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inboxes</h2>
        <Link href="/dashboard/inboxes/new" className={buttonVariants()}>+ Nova Inbox</Link>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Account ID</TableHead>
              <TableHead>Inbox ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inboxes?.map(inbox => (
              <TableRow key={inbox.id}>
                <TableCell className="font-medium">{inbox.name}</TableCell>
                <TableCell>{inbox.chatwoot_account_id}</TableCell>
                <TableCell>{inbox.chatwoot_inbox_id}</TableCell>
                <TableCell><InboxToggle id={inbox.id} initial={inbox.enabled} /></TableCell>
                <TableCell className="text-right">
                  <Link href={`/dashboard/inboxes/${inbox.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Editar</Link>
                </TableCell>
              </TableRow>
            ))}
            {(!inboxes || inboxes.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma inbox cadastrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
