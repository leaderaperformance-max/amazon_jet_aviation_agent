import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { LeadsTable } from '@/components/leads-table'

export default async function LeadsPage() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: leads } = await supabase
    .from('leads')
    .select('*, contacts(name, phone_number, whatsapp_identifier, inbox_id)')
    .eq('status', 'pendente')
    .order('urgency', { ascending: true })
    .order('sent_to_seller_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-muted-foreground">Gerencie os leads qualificados pelo JET.</p>
      </div>
      <LeadsTable initialLeads={leads ?? []} />
    </div>
  )
}
