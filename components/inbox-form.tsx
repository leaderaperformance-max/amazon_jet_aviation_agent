'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface InboxFormProps {
  inbox?: {
    id: string
    name: string
    chatwoot_base_url: string
    chatwoot_account_id: number
    chatwoot_inbox_id: number
    chatwoot_user_token: string
    quepasa_host: string | null
    quepasa_token: string | null
    system_prompt: string
    enabled: boolean
  }
  defaultSystemPrompt?: string
}

export function InboxForm({ inbox, defaultSystemPrompt }: InboxFormProps) {
  const router = useRouter()
  const isEdit = !!inbox

  const [name, setName] = useState(inbox?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(inbox?.chatwoot_base_url ?? '')
  const [accountId, setAccountId] = useState(String(inbox?.chatwoot_account_id ?? ''))
  const [inboxId, setInboxId] = useState(String(inbox?.chatwoot_inbox_id ?? ''))
  const [token, setToken] = useState(inbox?.chatwoot_user_token ?? '')
  const [quepasaHost, setQuepasaHost] = useState(inbox?.quepasa_host ?? '')
  const [quepasaToken, setQuepasaToken] = useState(inbox?.quepasa_token ?? '')
  const [enabled, setEnabled] = useState(inbox?.enabled ?? true)
  const [systemPrompt, setSystemPrompt] = useState(inbox?.system_prompt ?? defaultSystemPrompt ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const url = isEdit ? `/api/inboxes/${inbox!.id}` : '/api/inboxes'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        chatwoot_base_url: baseUrl,
        chatwoot_account_id: Number(accountId),
        chatwoot_inbox_id: Number(inboxId),
        chatwoot_user_token: token,
        quepasa_host: quepasaHost,
        quepasa_token: quepasaToken,
        system_prompt: systemPrompt,
        enabled,
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || 'Erro ao salvar')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('Excluir esta inbox? Isso não pode ser desfeito.')) return
    setLoading(true)
    await fetch(`/api/inboxes/${inbox!.id}`, { method: 'DELETE' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader><CardTitle>{isEdit ? 'Editar Inbox' : 'Nova Inbox'}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div className="rounded-md border p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Chatwoot (recepção do webhook)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="accountId">Account ID</Label>
                <Input id="accountId" type="number" value={accountId} onChange={e => setAccountId(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="inboxId">Inbox ID</Label>
                <Input id="inboxId" type="number" value={inboxId} onChange={e => setInboxId(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input id="baseUrl" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} required placeholder="https://chat.example.com" />
            </div>
            <div>
              <Label htmlFor="token">User Token</Label>
              <Input id="token" type="password" value={token} onChange={e => setToken(e.target.value)} required />
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">QuePasa (envio da resposta)</h3>
            <div>
              <Label htmlFor="quepasaHost">Host</Label>
              <Input id="quepasaHost" type="url" value={quepasaHost} onChange={e => setQuepasaHost(e.target.value)} required placeholder="https://leaderaperformance.apibridge.top" />
            </div>
            <div>
              <Label htmlFor="quepasaToken">Token (X-QUEPASA-TOKEN)</Label>
              <Input id="quepasaToken" type="password" value={quepasaToken} onChange={e => setQuepasaToken(e.target.value)} required />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="enabled">Inbox ativa</Label>
          </div>
          <div>
            <Label htmlFor="prompt">System Prompt</Label>
            <Textarea id="prompt" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} required rows={20} className="font-mono text-sm" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-between">
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
              <Button type="button" variant="outline" onClick={() => router.push('/dashboard')}>Cancelar</Button>
            </div>
            {isEdit && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>Excluir</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
