'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SummaryModalProps {
  contactId: string
  contactName: string | null
  initialSummary: string | null
  initialGeneratedAt: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SummaryModal({
  contactId, contactName, initialSummary, initialGeneratedAt, open, onOpenChange,
}: SummaryModalProps) {
  const [summary, setSummary] = useState(initialSummary)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function regenerate() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/contacts/${contactId}/summary`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Erro ao gerar resumo')
      setLoading(false)
      return
    }
    const body = await res.json()
    setSummary(body.summary)
    setGeneratedAt(new Date().toISOString())
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resumo — {contactName ?? 'Contato'}</DialogTitle>
        </DialogHeader>
        {summary ? (
          <>
            <pre className="whitespace-pre-wrap text-sm">{summary}</pre>
            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Gerado em {new Date(generatedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum resumo gerado ainda.</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={regenerate} disabled={loading}>
            {loading ? 'Gerando...' : summary ? 'Atualizar' : 'Gerar resumo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
