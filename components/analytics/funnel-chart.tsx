import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FunnelStage } from '@/lib/types'

export function FunnelChart({ funnel }: { funnel: FunnelStage[] }) {
  const max = Math.max(...funnel.map(f => f.count), 1)

  return (
    <Card>
      <CardHeader><CardTitle>Funil de Conversão</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {funnel.map(f => {
            const width = (f.count / max) * 100
            const conv = f.conversionFromPrev !== null
              ? ` · ${(f.conversionFromPrev * 100).toFixed(0)}%`
              : ''
            return (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{f.stage}</span>
                  <span className="text-muted-foreground tabular-nums">{f.count}{conv}</span>
                </div>
                <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${width}%`,
                      background: 'linear-gradient(90deg, hsl(var(--chart-1)) 0%, hsl(var(--chart-3)) 100%)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
