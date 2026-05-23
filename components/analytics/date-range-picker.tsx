'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

function toYMD(d: Date): string {
  // Use local date to avoid UTC offset bugs (Brasília is UTC-3).
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface Props {
  initialFrom: string
  initialTo: string
}

export function DateRangePicker({ initialFrom, initialTo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function pushRange(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', from)
    params.set('to', to)
    router.push(`/dashboard?${params.toString()}`)
  }

  function applyPreset(daysBack: number | 'all') {
    const to = new Date()
    let from: Date
    if (daysBack === 'all') {
      from = new Date('2024-01-01')
    } else if (daysBack === 0) {
      from = new Date()
      from.setHours(0, 0, 0, 0)
    } else {
      from = new Date()
      from.setDate(from.getDate() - daysBack)
    }
    pushRange(toYMD(from), toYMD(to))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={initialFrom}
        onChange={e => pushRange(e.target.value, initialTo)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        title="Data inicial"
      />
      <span className="text-muted-foreground">—</span>
      <input
        type="date"
        value={initialTo}
        onChange={e => pushRange(initialFrom, e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        title="Data final"
      />
      <div className="flex gap-1 ml-2">
        <Button size="sm" variant="outline" onClick={() => applyPreset(0)}>Hoje</Button>
        <Button size="sm" variant="outline" onClick={() => applyPreset(7)}>7d</Button>
        <Button size="sm" variant="outline" onClick={() => applyPreset(30)}>30d</Button>
        <Button size="sm" variant="outline" onClick={() => applyPreset(90)}>90d</Button>
        <Button size="sm" variant="outline" onClick={() => applyPreset('all')}>Tudo</Button>
      </div>
    </div>
  )
}
