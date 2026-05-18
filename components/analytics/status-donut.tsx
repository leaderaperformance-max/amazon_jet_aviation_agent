'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Pie, PieChart, Cell } from 'recharts'

interface Props {
  distribution: { ia: number; humano: number; encerrado: number }
}

export function StatusDonut({ distribution }: Props) {
  const data = [
    { name: 'IA', value: distribution.ia, fill: 'hsl(var(--chart-3))' },
    { name: 'Humano', value: distribution.humano, fill: 'hsl(var(--chart-4))' },
    { name: 'Encerrado', value: distribution.encerrado, fill: 'hsl(var(--chart-6))' },
  ]
  const total = distribution.ia + distribution.humano + distribution.encerrado

  return (
    <Card>
      <CardHeader><CardTitle>Distribuição por Status</CardTitle></CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer config={{}} className="h-[260px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={104} strokeWidth={2}>
                {data.map(d => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[36px] font-bold tabular-nums leading-none">{total}</div>
            <div className="text-[10px] tracking-widest uppercase text-muted-foreground mt-1">Total</div>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-4 text-sm">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-muted-foreground">{d.name}: <span className="text-foreground font-medium">{d.value}</span></span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
