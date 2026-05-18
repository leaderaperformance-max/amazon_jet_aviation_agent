import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FunnelStage } from '@/lib/types'

export function FunnelChart({ funnel }: { funnel: FunnelStage[] }) {
  const max = Math.max(...funnel.map(f => f.count), 1)

  return (
    <Card>
      <CardHeader><CardTitle>Funil de Conversão</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnel.map(f => {
            const width = (f.count / max) * 100
            const conv = f.conversionFromPrev !== null ? ` (${(f.conversionFromPrev * 100).toFixed(0)}%)` : ''
            return (
              <div key={f.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{f.stage}</span>
                  <span className="text-muted-foreground">{f.count}{conv}</span>
                </div>
                <div className="h-6 bg-gray-100 rounded">
                  <div
                    className="h-full rounded bg-gradient-to-r from-green-500 to-blue-500"
                    style={{ width: `${width}%` }}
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
