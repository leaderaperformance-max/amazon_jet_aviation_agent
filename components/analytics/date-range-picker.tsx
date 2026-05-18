'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange } from 'react-day-picker'

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatBR(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

interface Props {
  initialFrom: string
  initialTo: string
}

export function DateRangePicker({ initialFrom, initialTo }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(initialFrom),
    to: new Date(initialTo),
  })

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
    pushRange(from, to)
  }

  function pushRange(from: Date, to: Date) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('from', toYMD(from))
    params.set('to', toYMD(to))
    router.push(`/dashboard?${params.toString()}`)
    setOpen(false)
  }

  function applyCustom() {
    if (range?.from && range?.to) pushRange(range.from, range.to)
  }

  const label = range?.from && range?.to
    ? `${formatBR(range.from)} — ${formatBR(range.to)}`
    : 'Selecionar período'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline">{label}</Button>} />
      <PopoverContent className="w-auto p-3" align="end">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => applyPreset(0)}>Hoje</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset(7)}>7d</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset(30)}>30d</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset(90)}>90d</Button>
            <Button size="sm" variant="outline" onClick={() => applyPreset('all')}>Tudo</Button>
          </div>
          <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />
          <Button onClick={applyCustom} disabled={!range?.from || !range?.to}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
