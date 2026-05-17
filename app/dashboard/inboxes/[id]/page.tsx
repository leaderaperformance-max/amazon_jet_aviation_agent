import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { InboxForm } from '@/components/inbox-form'

export default async function EditInboxPage({ params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data } = await supabase.from('inboxes').select('*').eq('id', params.id).maybeSingle()
  if (!data) notFound()

  return <InboxForm inbox={data} />
}
