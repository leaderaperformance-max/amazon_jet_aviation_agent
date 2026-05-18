'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { VolumePoint } from '@/lib/types'

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const config = {
    messages: { label: 'Mensagens', color: '#3b82f6' },
    newContacts: { label: 'Novos contatos', color: '#22c55e' },
  }

  return (
    <Card>
      <CardHeader><CardTitle>Volume ao longo do tempo</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line type="monotone" dataKey="messages" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="newContacts" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
