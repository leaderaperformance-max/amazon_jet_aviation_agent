import { Card, CardContent } from '@/components/ui/card'
import type { AnalyticsKpis } from '@/lib/types'

function fmtNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

function fmtPercent(p: number): string {
  return `${(p * 100).toFixed(0)}%`
}

function fmtSec(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`
  return `${(s / 60).toFixed(1)}min`
}

function Delta({ value }: { value: number }) {
  if (value === 0) return null
  const sign = value > 0 ? '▲' : '▼'
  const color = value > 0 ? 'text-success' : 'text-danger'
  return (
    <span className={`text-xs font-medium ${color} ml-2`}>
      {sign} {Math.abs(value * 100).toFixed(0)}%
    </span>
  )
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: number }) {
  return (
    <Card>
      <CardContent className="pt-6 pb-6">
        <div className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground mb-3">
          {label}
        </div>
        <div className="text-[36px] leading-none font-bold tabular-nums flex items-baseline">
          {value}
          {delta !== undefined && <Delta value={delta} />}
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards({ kpis }: { kpis: AnalyticsKpis }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Contatos novos" value={fmtNumber(kpis.newContacts)} delta={kpis.deltas.newContacts} />
        <Kpi label="Mensagens recebidas" value={fmtNumber(kpis.receivedMessages)} delta={kpis.deltas.receivedMessages} />
        <Kpi label="Atendidos só pela IA" value={fmtPercent(kpis.aiOnlyPercent)} />
        <Kpi label="Tempo médio de resposta" value={fmtSec(kpis.avgResponseTimeSec)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Leads ganhos" value={fmtNumber(kpis.leadsWon)} delta={kpis.deltas.leadsWon} />
        <Kpi label="Leads perdidos" value={fmtNumber(kpis.leadsLost)} delta={kpis.deltas.leadsLost} />
        <Kpi label="Taxa de conversão" value={fmtPercent(kpis.conversionRate)} delta={kpis.deltas.conversionRate} />
        <Kpi label="Em atendimento agora" value={fmtNumber(kpis.activeNow)} />
      </div>
    </div>
  )
}
