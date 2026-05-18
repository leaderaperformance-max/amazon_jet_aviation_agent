'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SummaryModal } from '@/components/summary-modal'
import type { Contact } from '@/lib/types'

interface Inbox { id: string; name: string; chatwoot_base_url: string; chatwoot_account_id: number }
interface Props { contacts: Contact[]; total: number; page: number; pageSize: number; inboxes: Inbox[] }

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

function labelBadge(label: string) {
  return (
    <span key={label} className="inline-flex px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 mr-1">
      {label}
    </span>
  )
}

export function ContactsTable({ contacts, total, page, pageSize, inboxes }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all')
  const [inboxId, setInboxId] = useState(searchParams.get('inbox_id') ?? 'all')
  const [modalContactId, setModalContactId] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const inboxMap = new Map(inboxes.map(i => [i.id, i]))
  const modalContact = contacts.find(c => c.id === modalContactId) ?? null

  function applyFilters(e?: React.FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status !== 'all') params.set('status', status)
    if (inboxId !== 'all') params.set('inbox_id', inboxId)
    params.set('page', '1')
    router.push(`/dashboard/contacts?${params.toString()}`)
  }

  function gotoPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/dashboard/contacts?${params.toString()}`)
  }

  function chatwootLink(c: Contact): string {
    const inbox = inboxMap.get(c.inbox_id)
    if (!inbox) return '#'
    return `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${c.chatwoot_conversation_id}`
  }

  return (
    <div className="space-y-4">
      <form onSubmit={applyFilters} className="flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Buscar por nome, telefone..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div>
          <Select value={status} onValueChange={(v) => setStatus(v ?? 'all')}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ia">IA</SelectItem>
              <SelectItem value="humano">Humano</SelectItem>
              <SelectItem value="encerrado">Encerrado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {inboxes.length > 1 && (
          <div>
            <Select value={inboxId} onValueChange={(v) => setInboxId(v ?? 'all')}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas inboxes</SelectItem>
                {inboxes.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="submit">Filtrar</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Última msg</TableHead>
            <TableHead>Última interação</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Primeiro contato</TableHead>
            <TableHead>Chatwoot</TableHead>
            <TableHead>Resumo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name ?? '-'}</TableCell>
              <TableCell>{c.phone_number ?? '-'}</TableCell>
              <TableCell>{c.current_labels.map(labelBadge)}</TableCell>
              <TableCell>{statusBadge(c.status)}</TableCell>
              <TableCell className="max-w-[200px] truncate">{c.last_message ?? '-'}</TableCell>
              <TableCell className="text-sm">{formatRelative(c.last_message_at)}</TableCell>
              <TableCell>{c.message_count}</TableCell>
              <TableCell className="text-sm">{new Date(c.first_seen_at).toLocaleDateString('pt-BR')}</TableCell>
              <TableCell>
                <Link href={chatwootLink(c)} target="_blank" className="text-blue-600 hover:underline">↗</Link>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => setModalContactId(c.id)}>
                  {c.summary ? 'Ver' : 'Gerar'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {contacts.length === 0 && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum contato.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">{total} contatos | página {page} de {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => gotoPage(page + 1)}>Próxima</Button>
        </div>
      </div>

      {modalContact && (
        <SummaryModal
          contactId={modalContact.id}
          contactName={modalContact.name}
          initialSummary={modalContact.summary}
          initialGeneratedAt={modalContact.summary_generated_at}
          open={!!modalContactId}
          onOpenChange={open => !open && setModalContactId(null)}
        />
      )}
    </div>
  )
}
