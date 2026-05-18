import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { generateSummary } from '@/lib/summarize'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await generateSummary(params.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro ao gerar resumo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
