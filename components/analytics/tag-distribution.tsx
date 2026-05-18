'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { TagCount } from '@/lib/types'

export function TagDistribution({ data }: { data: TagCount[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Distribuição por Tag</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={{ count: { label: 'Contatos', color: '#3b82f6' } }} className="h-[260px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="tag" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={70} />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="#3b82f6" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
