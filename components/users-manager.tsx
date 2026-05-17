'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface User { id: string; email: string; created_at: string }

export function UsersManager({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setMsg('Convite enviado!')
      setEmail('')
      router.refresh()
    } else {
      const body = await res.json()
      setMsg(body.error || 'Erro')
    }
    setLoading(false)
  }

  async function remove(userId: string) {
    if (!confirm('Remover este usuário?')) return
    await fetch('/api/settings/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="flex gap-2 max-w-md">
        <Input type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} required />
        <Button type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Convidar'}</Button>
      </form>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.id}>
              <TableCell>{u.email} {u.id === currentUserId && <span className="text-xs text-muted-foreground">(você)</span>}</TableCell>
              <TableCell>{new Date(u.created_at).toLocaleDateString('pt-BR')}</TableCell>
              <TableCell className="text-right">
                {u.id !== currentUserId && (
                  <Button variant="ghost" size="sm" onClick={() => remove(u.id)}>Remover</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
