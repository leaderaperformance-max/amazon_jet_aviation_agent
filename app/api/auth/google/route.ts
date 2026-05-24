import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { buildAuthUrl } from '@/lib/google/oauth'
import { randomBytes } from 'crypto'

/**
 * GET /api/auth/google
 *
 * Kick off the OAuth flow to connect a Gmail account. The user must already
 * be logged into the dashboard.
 */
export async function GET() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))

  // CSRF protection: random state, stored in a short-lived cookie
  const state = randomBytes(16).toString('hex')
  const url = buildAuthUrl(state)

  const res = NextResponse.redirect(url)
  res.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 min
    path: '/',
  })
  return res
}
