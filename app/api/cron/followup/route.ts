import { NextRequest, NextResponse } from 'next/server'

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
  // ⚠️ DESATIVADO. O follow-up antigo re-gravava a lista INTEIRA de etiquetas da
  // conversa ao adicionar 'followup_enviado' — ressuscitando 'orcamento_enviado'
  // (etiqueta só do vendedor) e às vezes apagando 'orçamento_pendente'. Foi
  // substituído pelas automações do funil (/api/cron/funnel-automations), que
  // NÃO mexem em etiqueta. Mantido como no-op pro cron-job.org antigo não quebrar.
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  console.log('[cron/followup] DESATIVADO (no-op). Use /api/cron/funnel-automations.')
  return NextResponse.json({ ok: true, disabled: true, use: '/api/cron/funnel-automations' })
}
