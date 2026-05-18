import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { computeAnalytics } from '@/lib/analytics'

export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const result = await computeAnalytics(from, to)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
