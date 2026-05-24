import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { processAccount, ProcessResult } from '@/lib/email/process'
import type { EmailAccountRow } from '@/lib/google/gmail'

/**
 * GET /api/email/poll?secret=...
 *
 * Polls all enabled Gmail accounts, fetches new INBOX messages, processes
 * them (parse, run attachments through pipeline, summarize via LLM, notify
 * via WhatsApp).
 *
 * Auth: ?secret=CRON_SECRET or Vercel cron header.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  if (req.headers.get('user-agent')?.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = new URL(req.url).searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace(/^Bearer /i, '')
  return provided === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
  const { data: accounts, error } = await admin
    .from('email_accounts')
    .select('id, email_address, refresh_token, access_token, expires_at, history_id')
    .eq('enabled', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: ProcessResult[] = []
  for (const acc of (accounts ?? []) as EmailAccountRow[]) {
    try {
      const r = await processAccount(acc)
      results.push(r)
      console.log(`[email/poll] ${acc.email_address}: fetched=${r.fetched} processed=${r.processed} skipped=${r.skipped} errors=${r.errors.length}`)
    } catch (err) {
      results.push({
        account_id: acc.id,
        fetched: 0, processed: 0, skipped: 0,
        errors: [(err as Error).message],
      })
    }
  }

  return NextResponse.json({
    accounts: results.length,
    total_fetched: results.reduce((s, r) => s + r.fetched, 0),
    total_processed: results.reduce((s, r) => s + r.processed, 0),
    results,
  })
}
