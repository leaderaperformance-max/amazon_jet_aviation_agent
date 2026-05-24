import { getServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/ui/section-card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Check, CircleAlert, Mail, Paperclip, Plus } from 'lucide-react'

interface EmailAccount {
  id: string
  email_address: string
  enabled: boolean
  last_polled_at: string | null
  created_at: string
}

interface EmailSummary {
  id: string
  from_name: string | null
  from_address: string | null
  subject: string | null
  category: string | null
  summary: string | null
  attachment_count: number
  detected_pns: string[] | null
  received_at: string | null
  notified_at: string | null
}

const CATEGORY_META: Record<string, { label: string; variant: 'brand' | 'success' | 'warning' | 'neutral' | 'danger' }> = {
  cotacao: { label: 'Cotação', variant: 'brand' },
  rfq: { label: 'RFQ', variant: 'brand' },
  ordem_compra: { label: 'Ordem de Compra', variant: 'success' },
  follow_up: { label: 'Follow-up', variant: 'warning' },
  duvida_tecnica: { label: 'Dúvida Técnica', variant: 'neutral' },
  spam: { label: 'Spam', variant: 'neutral' },
  interno: { label: 'Interno', variant: 'neutral' },
  outros: { label: 'Outros', variant: 'neutral' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 60000
  if (diff < 1) return 'agora'
  if (diff < 60) return `${Math.floor(diff)}m`
  if (diff < 1440) return `${Math.floor(diff / 60)}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default async function EmailDashboard({
  searchParams,
}: { searchParams: { connected?: string; error?: string } }) {
  const supabase = getServerClient()

  const { data: accountsData } = await supabase
    .from('email_accounts')
    .select('id, email_address, enabled, last_polled_at, created_at')
    .order('created_at', { ascending: false })
  const accounts = (accountsData ?? []) as EmailAccount[]

  const { data: summariesData } = await supabase
    .from('email_summaries')
    .select('id, from_name, from_address, subject, category, summary, attachment_count, detected_pns, received_at, notified_at')
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(50)
  const summaries = (summariesData ?? []) as EmailSummary[]

  // Stats
  const notifiedCount = summaries.filter(s => s.notified_at).length
  const spamCount = summaries.filter(s => s.category === 'spam').length
  const cotacaoCount = summaries.filter(s => s.category === 'cotacao' || s.category === 'rfq').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description="Contas Gmail conectadas + categorização automática por IA"
        actions={
          <a href="/api/auth/google">
            <Button>
              <Plus className="size-4" />
              Conectar Gmail
            </Button>
          </a>
        }
      />

      {searchParams.connected && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          <Check className="size-4" />
          Conta conectada: <strong className="font-medium">{searchParams.connected}</strong>
        </div>
      )}
      {searchParams.error && (
        <div className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <CircleAlert className="size-4" />
          {searchParams.error}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Contas ativas" value={accounts.filter(a => a.enabled).length} />
        <KpiTile label="Emails processados" value={summaries.length} />
        <KpiTile label="Cotações + RFQs" value={cotacaoCount} highlight />
        <KpiTile label="Notificados no WhatsApp" value={notifiedCount} />
      </div>

      {/* Connected accounts */}
      <SectionCard
        title="Contas conectadas"
        description={`${accounts.length} conta(s)`}
        padded={false}
      >
        {accounts.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Nenhuma conta conectada"
            description='Conecte uma conta Gmail pra começar a receber resumos automáticos.'
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último poll</TableHead>
                <TableHead>Conectado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(a => (
                <TableRow key={a.id} className="hover:bg-surface-2/60 transition-colors">
                  <TableCell className="font-medium">{a.email_address}</TableCell>
                  <TableCell>
                    <Badge variant={a.enabled ? 'success' : 'neutral'} dot>
                      {a.enabled ? 'Ativa' : 'Desativada'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {a.last_polled_at ? new Date(a.last_polled_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {new Date(a.created_at).toLocaleString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {/* Recent summaries */}
      <SectionCard
        title="Resumos recentes"
        description={`${summaries.length} email(s) processado(s) · ${spamCount} spam filtrado(s)`}
        padded={false}
      >
        {summaries.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Sem resumos ainda"
            description="Quando chegar um email novo, ele aparece aqui categorizado."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Recebido</TableHead>
                <TableHead>De</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead className="w-[140px]">Categoria</TableHead>
                <TableHead>Resumo</TableHead>
                <TableHead>PNs</TableHead>
                <TableHead className="w-[60px] text-right">📎</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map(s => {
                const meta = CATEGORY_META[s.category ?? 'outros'] ?? CATEGORY_META.outros
                return (
                  <TableRow key={s.id} className="hover:bg-surface-2/60 transition-colors">
                    <TableCell className="text-muted-foreground tabular-nums text-xs">
                      {formatDate(s.received_at)}
                    </TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">
                      {s.from_name ?? s.from_address ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-foreground/80">
                      {s.subject ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} dot={meta.variant !== 'neutral'}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[360px] truncate text-muted-foreground text-xs">
                      {s.summary ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/70">
                      {s.detected_pns?.length ? s.detected_pns.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.attachment_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                          <Paperclip className="size-3" />
                          {s.attachment_count}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}

function KpiTile({
  label, value, highlight = false,
}: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border border-border bg-surface px-4 py-3.5 shadow-xs ${highlight ? 'ring-1 ring-brand/20' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${highlight ? 'text-brand' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  )
}

function EmptyState({
  icon: Icon, title, description,
}: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-surface-2">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-3 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  )
}
