import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('inboxes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inboxes: data })
}

export async function POST(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('inboxes')
    .insert({
      name: body.name,
      chatwoot_base_url: body.chatwoot_base_url,
      chatwoot_account_id: body.chatwoot_account_id,
      chatwoot_inbox_id: body.chatwoot_inbox_id,
      chatwoot_user_token: body.chatwoot_user_token,
      quepasa_host: body.quepasa_host ?? null,
      quepasa_token: body.quepasa_token ?? null,
      system_prompt: body.system_prompt,
      enabled: body.enabled ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inbox: data })
}
