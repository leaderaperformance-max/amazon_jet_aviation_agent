import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { exchangeCode, fetchUserEmail } from '@/lib/google/oauth'

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Google sends the user here after consent. Exchange the code for tokens,
 * fetch the email address, and upsert into email_accounts.
 */
export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/dashboard/email?error=${encodeURIComponent(error)}`, req.url))
  }
  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/email?error=missing_code', req.url))
  }

  // CSRF check
  const cookieState = req.cookies.get('g_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL('/dashboard/email?error=state_mismatch', req.url))
  }

  try {
    const tokens = await exchangeCode(code)
    if (!tokens.refresh_token) {
      // Without a refresh_token we can't keep polling. This happens if the user
      // had already authorized the app before — Google omits the refresh_token
      // unless prompt=consent forces re-consent. We do force it, but defend.
      return NextResponse.redirect(new URL('/dashboard/email?error=no_refresh_token', req.url))
    }

    const emailAddress = await fetchUserEmail(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const admin = getAdminClient()
    const { error: upsertErr } = await admin
      .from('email_accounts')
      .upsert(
        {
          email_address: emailAddress,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expires_at: expiresAt,
          enabled: true,
        },
        { onConflict: 'email_address' }
      )

    if (upsertErr) throw new Error(upsertErr.message)

    const res = NextResponse.redirect(new URL(`/dashboard/email?connected=${encodeURIComponent(emailAddress)}`, req.url))
    res.cookies.delete('g_oauth_state')
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(new URL(`/dashboard/email?error=${encodeURIComponent(msg)}`, req.url))
  }
}
