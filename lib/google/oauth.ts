/**
 * Google OAuth 2.0 helper — manual implementation (no SDK) to keep deps light.
 * Used by Gmail integration for the email module.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  // Sheets/Drive — used to create per-lead spreadsheets in the user's Drive.
  // Personal Google accounts can't use Service Accounts for this (no Drive quota),
  // so we piggyback on the same OAuth grant.
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
]

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: 'Bearer'
  id_token?: string
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

/**
 * Build the URL the user is redirected to so they can authorize the app.
 * `state` is an opaque CSRF token — store it in a cookie before redirecting.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline', // gives us a refresh_token
    prompt: 'consent', // force refresh_token every time even if already consented
    include_granted_scopes: 'true',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange the one-time `code` Google sent us for an access+refresh token.
 */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: requireEnv('GOOGLE_REDIRECT_URI'),
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Google token exchange failed (${res.status}): ${err.slice(0, 200)}`)
  }
  return res.json() as Promise<TokenResponse>
}

/**
 * Use a refresh_token to get a fresh access_token (refresh_token itself doesn't
 * come back here — keep the one you stored).
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Google refresh failed (${res.status}): ${err.slice(0, 200)}`)
  }
  return res.json() as Promise<TokenResponse>
}

/**
 * Return the email address tied to an access token. Used during OAuth callback
 * to identify which Gmail account is being connected.
 */
export async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`)
  const data = (await res.json()) as { email?: string }
  if (!data.email) throw new Error('userinfo returned no email')
  return data.email
}
