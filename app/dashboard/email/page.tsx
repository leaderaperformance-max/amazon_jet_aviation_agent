import { getServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Email — Amazon Jet</h1>
        <p className="text-muted-foreground">Conta(s) Gmail conectada(s) + resumos automáticos por IA.</p>
      </div>

      {searchParams.connected && (
        <div className="rounded-md border border-green-700 bg-green-900/20 px-3 py-2 text-sm">
          ✅ Conta conectada: <strong>{searchParams.connected}</strong>
        </div>
      )}
      {searchParams.error && (
        <div className="rounded-md border border-red-700 bg-red-900/20 px-3 py-2 text-sm">
          ❌ Erro: {searchParams.error}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contas conectadas ({accounts.length})</h2>
          <a href="/api/auth/google">
            <Button>+ Conectar Gmail</Button>
          </a>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta conectada ainda. Clica em &quot;Conectar Gmail&quot; pra começar.</p>
        ) : (
          <div className="rounded-md border">
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
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.email_address}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        a.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}>{a.enabled ? 'Ativa' : 'Desativada'}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.last_polled_at ? new Date(a.last_polled_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(a.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Resumos recentes ({summaries.length})</h2>
        {summaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem resumos ainda. Quando chegar um email novo, ele aparece aqui.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebido</TableHead>
                  <TableHead>De</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead>PNs</TableHead>
                  <TableHead>📎</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {s.received_at ? new Date(s.received_at).toLocaleString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{s.from_name ?? s.from_address ?? '—'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{s.subject ?? '—'}</TableCell>
                    <TableCell>
                      {s.category && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {s.category}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">{s.summary ?? '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{s.detected_pns?.join(', ') ?? '—'}</TableCell>
                    <TableCell className="text-sm">{s.attachment_count > 0 ? s.attachment_count : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
