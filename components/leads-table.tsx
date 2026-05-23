'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Lead {
  id: string
  contact_id: string
  part_number: string
  quantity: string
  urgency: string
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  sent_to_seller_at: string
  status: 'pendente' | 'em_atendimento' | 'fechado_ganho' | 'fechado_perdido'
  contacts?: {
    name: string | null
    phone_number: string | null
    whatsapp_identifier: string | null
    inbox_id: string
  } | null
}

interface LeadsTableProps {
  initialLeads: Lead[]
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_atendimento: 'Em Atendimento',
  fechado_ganho: 'Fechado (Ganho)',
  fechado_perdido: 'Fechado (Perdido)',
}

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  em_atendimento: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fechado_ganho: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  fechado_perdido: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}

export function LeadsTable({ initialLeads }: LeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [urgencyFilter, setUrgencyFilter] = useState<string>('todas')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [loading, setLoading] = useState<string | null>(null)

  async function fetchLeads(status: string, urgency: string) {
    const params = new URLSearchParams()
    if (status !== 'todos') params.set('status', status)
    if (urgency !== 'todas') params.set('urgency', urgency)
    const res = await fetch(`/api/leads?${params.toString()}`)
    if (res.ok) {
      const { leads: data } = await res.json()
      setLeads(data ?? [])
    }
  }

  async function handleStatusFilter(value: string | null) {
    const v = value ?? 'todos'
    setStatusFilter(v)
    await fetchLeads(v, urgencyFilter)
  }

  async function handleUrgencyFilter(value: string | null) {
    const v = value ?? 'todas'
    setUrgencyFilter(v)
    await fetchLeads(statusFilter, v)
  }

  async function updateStatus(id: string, status: Lead['status']) {
    setLoading(id)
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
      }
    } finally {
      setLoading(null)
    }
  }

  async function resendLead(id: string) {
    setLoading(id)
    try {
      const res = await fetch(`/api/leads/${id}/resend`, { method: 'POST' })
      if (res.ok) {
        alert('Lead reenviado pro vendedor.')
      } else {
        const { error } = await res.json().catch(() => ({ error: 'erro desconhecido' }))
        alert(`Falha ao reenviar: ${error}`)
      }
    } finally {
      setLoading(null)
    }
  }

  const filtered = leads.filter(l => {
    if (statusFilter !== 'todos' && l.status !== statusFilter) return false
    if (urgencyFilter !== 'todas' && l.urgency !== urgencyFilter) return false
    if (fromDate && l.sent_to_seller_at < fromDate) return false
    if (toDate) {
      // inclusive end-of-day
      const end = new Date(toDate + 'T23:59:59.999Z').toISOString()
      if (l.sent_to_seller_at > end) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="w-48">
          <Select value={statusFilter} onValueChange={handleStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_atendimento">Em Atendimento</SelectItem>
              <SelectItem value="fechado_ganho">Fechado (Ganho)</SelectItem>
              <SelectItem value="fechado_perdido">Fechado (Perdido)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={urgencyFilter} onValueChange={handleUrgencyFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Urgência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="AOG">AOG</SelectItem>
              <SelectItem value="rotina">Rotina</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          placeholder="De"
          title="Data inicial"
        />
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          placeholder="Até"
          title="Data final"
        />
        {(fromDate || toDate) && (
          <Button size="sm" variant="ghost" onClick={() => { setFromDate(''); setToDate('') }}>
            Limpar
          </Button>
        )}
        <span className="text-sm text-muted-foreground">{filtered.length} lead(s)</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            const params = new URLSearchParams()
            if (statusFilter !== 'todos') params.set('status', statusFilter)
            if (urgencyFilter !== 'todas') params.set('urgency', urgencyFilter)
            if (fromDate) params.set('from', fromDate)
            if (toDate) params.set('to', toDate)
            window.location.href = `/api/leads/export?${params.toString()}`
          }}
        >
          ⬇️ Exportar CSV
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Part Number</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Urgência</TableHead>
              <TableHead>Enviado há</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum lead encontrado.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(lead => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">
                  {lead.customer_name ?? lead.contacts?.name ?? '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.customer_phone ?? lead.contacts?.phone_number ?? '—'}
                </TableCell>
                <TableCell className="font-mono text-sm">{lead.part_number}</TableCell>
                <TableCell>{lead.quantity}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    lead.urgency === 'AOG'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }`}>
                    {lead.urgency === 'AOG' ? '🔴 AOG' : '🟡 Rotina'}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {timeAgo(lead.sent_to_seller_at)}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status] ?? ''}`}>
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </TableCell>
                <TableCell className="text-sm max-w-[200px] truncate text-muted-foreground">
                  {lead.notes ?? '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {lead.status !== 'em_atendimento' && lead.status !== 'fechado_ganho' && lead.status !== 'fechado_perdido' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading === lead.id}
                        onClick={() => updateStatus(lead.id, 'em_atendimento')}
                      >
                        Atender
                      </Button>
                    )}
                    {lead.status !== 'fechado_ganho' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading === lead.id}
                        onClick={() => updateStatus(lead.id, 'fechado_ganho')}
                      >
                        Ganho
                      </Button>
                    )}
                    {lead.status !== 'fechado_perdido' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading === lead.id}
                        onClick={() => updateStatus(lead.id, 'fechado_perdido')}
                      >
                        Perdido
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading === lead.id}
                      onClick={() => resendLead(lead.id)}
                      title="Reenviar notificação ao vendedor"
                    >
                      🔁
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
