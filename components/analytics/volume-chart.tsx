'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { VolumePoint } from '@/lib/types'

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const config = {
    messages: { label: 'Mensagens', color: 'hsl(var(--chart-1))' },
    newContacts: { label: 'Novos contatos', color: 'hsl(var(--chart-2))' },
  }

  return (
    <Card>
      <CardHeader><CardTitle>Volume ao longo do tempo</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line type="monotone" dataKey="messages" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="newContacts" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
