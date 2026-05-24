import { NextRequest, NextResponse } from 'next/server'
import { findFollowupCandidates, processFollowup } from '@/lib/followup'

/**
 * GET /api/cron/followup
 *
 * Triggered by Vercel cron (and can be called manually for testing).
 * Sends LLM-generated follow-ups to engaged-but-silent leads.
 *
 * Auth: either Vercel cron header OR ?secret=CRON_SECRET query param.
 *
 * Env:
 *  FOLLOWUP_INTERVAL_MINUTES — minutes of silence before sending (default 2880 = 48h)
 *  FOLLOWUP_MAX_PER_CONTACT  — cap per contact (default 1)
 *  CRON_SECRET               — required for manual invocation
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  // Vercel cron sets this header automatically
  if (req.headers.get('x-vercel-cron') === '1') return true
  if (req.headers.get('user-agent')?.startsWith('vercel-cron')) return true

  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = new URL(req.url).searchParams.get('secret') ?? req.headers.get('authorization')?.replace(/^Bearer /i, '')
  return provided === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const interval = parseInt(process.env.FOLLOWUP_INTERVAL_MINUTES ?? '2880', 10)
  const maxPer = parseInt(process.env.FOLLOWUP_MAX_PER_CONTACT ?? '1', 10)

  const candidates = await findFollowupCandidates(interval, maxPer)
  console.log(`[cron/followup] interval=${interval}min maxPer=${maxPer} candidates=${candidates.length}`)

  const results = []
  for (const c of candidates) {
    const r = await processFollowup(c)
    console.log(`[cron/followup] contact=${c.id} sent=${r.sent}${r.error ? ` err=${r.error}` : ''}`)
    results.push(r)
  }

  return NextResponse.json({
    interval_minutes: interval,
    candidates: candidates.length,
    sent: results.filter(r => r.sent).length,
    results,
  })
}
