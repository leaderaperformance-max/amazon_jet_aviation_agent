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
  const map: Record<string, string> = {
    ia: 'bg-success/15 text-success',
    humano: 'bg-warning/15 text-warning',
    encerrado: 'bg-muted/40 text-muted-foreground',
  }
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase ${map[status] ?? ''}`}>
      {status}
    </span>
  )
}

function tagPill(label: string) {
  const terminal: Record<string, string> = {
    lead_ganho: 'bg-success/12 text-success',
    lead_perdido: 'bg-danger/12 text-danger',
  }
  const cls = terminal[label] ?? 'bg-accent/12 text-accent'
  return (
    <span key={label} className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium mr-1 ${cls}`}>
      {label}
    </span>
  )
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
                  <Link href={`/dashboard/contacts?q=${encodeURIComponent(c.phone_number ?? '')}`} className="hover:text-accent transition-colors">
                    {c.name ?? '-'}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{c.phone_number ?? '-'}</TableCell>
                <TableCell>{c.current_labels.map(tagPill)}</TableCell>
                <TableCell className="tabular-nums">{c.message_count}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatRelative(c.last_message_at)}</TableCell>
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
