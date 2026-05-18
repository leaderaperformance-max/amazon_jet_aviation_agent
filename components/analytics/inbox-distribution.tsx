'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { InboxCount } from '@/lib/types'

export function InboxDistribution({ data }: { data: InboxCount[] }) {
  if (data.length <= 1) return null
  return (
    <Card>
      <CardHeader><CardTitle>Atendimento por Inbox</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: 'Conversas', color: '#8b5cf6' } }} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="#8b5cf6" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
