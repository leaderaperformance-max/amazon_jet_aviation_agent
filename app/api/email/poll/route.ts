import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getAdminClient } from '@/lib/supabase/admin'
import { processAccount } from '@/lib/email/process'
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

  const accs = (accounts ?? []) as EmailAccountRow[]

  // Fire-and-forget processing — we return 200 immediately so cron-job.org's
  // 30s timeout never fires. Vercel keeps the function alive for up to
  // `maxDuration` (60s) to finish the work via `waitUntil()`.
  waitUntil((async () => {
    for (const acc of accs) {
      try {
        const r = await processAccount(acc)
        console.log(`[email/poll] ${acc.email_address}: fetched=${r.fetched} processed=${r.processed} skipped=${r.skipped} errors=${r.errors.length}${r.errors.length ? ' details=' + JSON.stringify(r.errors) : ''}`)
      } catch (err) {
        console.warn(`[email/poll] account ${acc.id} failed:`, err)
      }
    }
  })())

  return NextResponse.json({ ok: true, accounts_queued: accs.length })
}
