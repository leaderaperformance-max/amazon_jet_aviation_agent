'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Senhas não coincidem')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || 'Erro ao criar admin')
      setLoading(false)
      return
    }

    const supabase = getBrowserClient()
    await supabase.auth.signInWithPassword({ email, password })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader><CardTitle>Criar Primeiro Admin</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div>
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando...' : 'Criar admin'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
