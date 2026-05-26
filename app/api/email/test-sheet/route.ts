import { NextRequest, NextResponse } from 'next/server'
import { createPartsSheet } from '@/lib/google/sheets'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const sheet = await createPartsSheet({
      customerName: 'Test Customer',
      customerPhone: '+5511999999999',
      items: [{ part_number: 'MS21266-2N', quantity: '4' }],
      urgency: 'rotina',
    })
    return NextResponse.json({ ok: true, sheet })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: (err as Error).message,
      stack: (err as Error).stack?.slice(0, 1000),
    })
  }
}
