import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { TopContact } from '@/lib/types'

function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    ia: 'bg-green-100 text-green-800',
    humano: 'bg-yellow-100 text-yellow-800',
    encerrado: 'bg-gray-100 text-gray-800',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? ''}`}>{status.toUpperCase()}</span>
}

export function TopContactsTable({ contacts }: { contacts: TopContact[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Top 10 contatos do período</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Última interação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/dashboard/contacts?q=${encodeURIComponent(c.phone_number ?? '')}`} className="hover:underline">
                    {c.name ?? '-'}
                  </Link>
                </TableCell>
                <TableCell>{c.phone_number ?? '-'}</TableCell>
                <TableCell>
                  {c.current_labels.map(l => (
                    <span key={l} className="inline-flex px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 mr-1">{l}</span>
                  ))}
                </TableCell>
                <TableCell>{c.message_count}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell className="text-sm">{formatRelative(c.last_message_at)}</TableCell>
              </TableRow>
            ))}
            {contacts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
