import { getServerClient } from '@/lib/supabase/server'
import { computeAnalytics } from '@/lib/analytics'
import { DateRangePicker } from '@/components/analytics/date-range-picker'
import { KpiCards } from '@/components/analytics/kpi-cards'
import { FunnelChart } from '@/components/analytics/funnel-chart'
import { StatusDonut } from '@/components/analytics/status-donut'
import { VolumeChart } from '@/components/analytics/volume-chart'
import { TagDistribution } from '@/components/analytics/tag-distribution'
import { InboxDistribution } from '@/components/analytics/inbox-distribution'
import { TopContactsTable } from '@/components/analytics/top-contacts'
import { InboxStatusList } from '@/components/analytics/inbox-status'

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string }
}) {
  const { from: defaultFrom, to: defaultTo } = defaultRange()
  const from = searchParams.from ?? defaultFrom
  const to = searchParams.to ?? defaultTo

  const analytics = await computeAnalytics(from, to)

  const supabase = getServerClient()
  const { data: inboxes } = await supabase
    .from('inboxes')
    .select('id, name, chatwoot_account_id, chatwoot_inbox_id, enabled')
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Análise de Atendimento</h1>
        <DateRangePicker initialFrom={from} initialTo={to} />
      </div>

      <KpiCards kpis={analytics.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FunnelChart funnel={analytics.funnel} />
        <StatusDonut distribution={analytics.statusDistribution} />
      </div>

      <VolumeChart data={analytics.volumeOverTime} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TagDistribution data={analytics.tagDistribution} />
        <InboxDistribution data={analytics.inboxDistribution} />
      </div>

      <TopContactsTable contacts={analytics.topContacts} />

      <InboxStatusList inboxes={inboxes ?? []} />
    </div>
  )
}
