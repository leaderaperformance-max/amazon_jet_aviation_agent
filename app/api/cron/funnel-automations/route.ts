import { NextRequest, NextResponse } from 'next/server'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { runFunnelAutomations } from '@/lib/funnel-automations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  if (req.headers.get('user-agent')?.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = new URL(req.url).searchParams.get('secret') ?? req.headers.get('authorization')?.replace(/^Bearer /i, '')
  return provided === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const chatwootInboxId = parseInt(process.env.FUNNEL_INBOX_ID ?? '45', 10)
  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox) return NextResponse.json({ error: 'inbox not found' }, { status: 500 })

  const cfg = {
    baseUrl: inbox.chatwoot_base_url,
    accountId: inbox.chatwoot_account_id,
    userToken: inbox.chatwoot_user_token,
  }
  const result = await runFunnelAutomations(cfg, {
    quepasa_host: inbox.quepasa_host, quepasa_token: inbox.quepasa_token,
  })
  console.log(`[cron/funnel] resolved=${result.resolved} checked=${result.checked} sent=${result.sent}`)
  return NextResponse.json(result)
}
