'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Pie, PieChart, Cell } from 'recharts'

interface Props {
  distribution: { ia: number; humano: number; encerrado: number }
}

export function StatusDonut({ distribution }: Props) {
  const data = [
    { name: 'IA', value: distribution.ia, fill: '#22c55e' },
    { name: 'Humano', value: distribution.humano, fill: '#eab308' },
    { name: 'Encerrado', value: distribution.encerrado, fill: '#9ca3af' },
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
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                {data.map(d => <Cell key={d.name} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <p className="absolute inset-0 flex items-center justify-center text-3xl font-bold pointer-events-none">{total}</p>
        </div>
        <div className="flex justify-center gap-4 mt-4 text-sm">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: d.fill }} />
              <span>{d.name}: {d.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
