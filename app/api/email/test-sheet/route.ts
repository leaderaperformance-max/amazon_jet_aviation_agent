import { NextRequest, NextResponse } from 'next/server'
import { createPartsSheet } from '@/lib/google/sheets'
import { getAdminClient } from '@/lib/supabase/admin'
import { getAccessToken } from '@/lib/google/gmail'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Diagnostic: inspect granted scopes on the connected OAuth account
  const admin = getAdminClient()
  const { data: acc } = await admin
    .from('email_accounts')
    .select('id, email_address, refresh_token, access_token, expires_at, history_id, created_at')
    .eq('email_address', process.env.SHEET_SHARE_WITH ?? 'amazonjetaviation@gmail.com')
    .maybeSingle()

  if (!acc) return NextResponse.json({ ok: false, error: 'no OAuth account' })

  let scopes: string[] = []
  let tokenInfo: unknown = null
  try {
    const token = await getAccessToken(acc as Parameters<typeof getAccessToken>[0])
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`)
    tokenInfo = await r.json()
    scopes = ((tokenInfo as { scope?: string }).scope ?? '').split(' ')
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'token introspect failed: ' + (e as Error).message })
  }

  const hasSpreadsheets = scopes.includes('https://www.googleapis.com/auth/spreadsheets')
  const hasDriveFile = scopes.includes('https://www.googleapis.com/auth/drive.file')

  // Try sheet creation if scopes look right
  let sheetResult: unknown = null
  try {
    sheetResult = await createPartsSheet({
      customerName: 'Test Customer',
      customerPhone: '+5511999999999',
      items: [{ part_number: 'MS21266-2N', quantity: '4' }],
      urgency: 'rotina',
    })
  } catch (err) {
    sheetResult = { error: (err as Error).message.slice(0, 500) }
  }

  return NextResponse.json({
    account_email: acc.email_address,
    connected_at: acc.created_at,
    scopes,
    has_spreadsheets_scope: hasSpreadsheets,
    has_drive_file_scope: hasDriveFile,
    sheet_creation: sheetResult,
  })
}
