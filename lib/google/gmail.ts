/**
 * Gmail API client — minimal subset used by the email module.
 *
 * Uses raw fetch + the user's refresh_token to avoid pulling in googleapis SDK
 * (which is heavy and bundles a lot of stuff we don't need).
 */

import { refreshAccessToken } from '@/lib/google/oauth'
import { getAdminClient } from '@/lib/supabase/admin'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

export interface EmailAccountRow {
  id: string
  email_address: string
  refresh_token: string
  access_token: string | null
  expires_at: string | null
  history_id: string | null
}

/**
 * Return a valid access token for the account. Refreshes via Google if expired.
 * Updates the row in email_accounts with the new token.
 */
export async function getAccessToken(account: EmailAccountRow): Promise<string> {
  const now = Date.now()
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0
  // Refresh if token expires in less than 60s
  if (account.access_token && expiresAt - now > 60_000) {
    return account.access_token
  }

  const fresh = await refreshAccessToken(account.refresh_token)
  const newExpires = new Date(Date.now() + fresh.expires_in * 1000).toISOString()

  const admin = getAdminClient()
  await admin
    .from('email_accounts')
    .update({ access_token: fresh.access_token, expires_at: newExpires })
    .eq('id', account.id)

  return fresh.access_token
}

interface GmailHeader { name: string; value: string }
interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  historyId?: string
  payload?: GmailPart
}

export interface ParsedEmail {
  messageId: string
  threadId: string
  from: { name: string | null; address: string | null }
  to: string | null
  subject: string | null
  date: string | null
  bodyText: string
  bodyHtml: string
  attachments: ParsedAttachment[]
  labelIds: string[]
}

export interface ParsedAttachment {
  filename: string
  mimeType: string
  size: number
  attachmentId: string // used to download via getAttachment
}

function decodeBase64Url(b64: string): Buffer {
  return Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function parseFromHeader(raw: string): { name: string | null; address: string | null } {
  // Examples:
  // "Cliente Ltda" <cliente@exemplo.com>
  // cliente@exemplo.com
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/)
  if (m) return { name: m[1]?.trim() || null, address: m[2].trim() }
  return { name: null, address: raw.trim() }
}

function flattenParts(part: GmailPart | undefined, out: GmailPart[] = []): GmailPart[] {
  if (!part) return out
  out.push(part)
  if (part.parts) for (const p of part.parts) flattenParts(p, out)
  return out
}

/**
 * List message IDs more recent than the last seen history_id.
 *
 * If history_id is null (first poll), fall back to recent INBOX messages.
 * Returns the messageIds AND the new historyId to persist.
 */
export async function listNewMessageIds(
  account: EmailAccountRow,
  maxResults = 20
): Promise<{ messageIds: string[]; newHistoryId: string | null }> {
  const token = await getAccessToken(account)

  if (account.history_id) {
    // Use history.list to get only what changed since last time
    const url = `${GMAIL_API}/users/me/history?startHistoryId=${account.history_id}&historyTypes=messageAdded&labelId=INBOX`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      // 404 means historyId expired (Gmail keeps ~7 days). Fall back to listing.
      if (res.status === 404) return listRecentInbox(account, maxResults)
      throw new Error(`gmail history.list ${res.status}: ${await res.text().catch(() => '')}`)
    }
    const data = (await res.json()) as {
      history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[]
      historyId?: string
    }
    const ids = new Set<string>()
    for (const h of data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        // Only count incoming (INBOX) messages — skip sent
        if (!m.message.labelIds || m.message.labelIds.includes('INBOX')) {
          ids.add(m.message.id)
        }
      }
    }
    return { messageIds: Array.from(ids), newHistoryId: data.historyId ?? account.history_id }
  }

  return listRecentInbox(account, maxResults)
}

async function listRecentInbox(
  account: EmailAccountRow,
  maxResults: number
): Promise<{ messageIds: string[]; newHistoryId: string | null }> {
  const token = await getAccessToken(account)
  const url = `${GMAIL_API}/users/me/messages?labelIds=INBOX&maxResults=${maxResults}&q=is:unread`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`gmail messages.list ${res.status}: ${await res.text().catch(() => '')}`)
  const data = (await res.json()) as { messages?: { id: string }[]; resultSizeEstimate?: number }

  // Also fetch profile to get current historyId so next poll uses delta
  const profileRes = await fetch(`${GMAIL_API}/users/me/profile`, { headers: { Authorization: `Bearer ${token}` } })
  let newHistoryId: string | null = null
  if (profileRes.ok) {
    const p = (await profileRes.json()) as { historyId?: string }
    newHistoryId = p.historyId ?? null
  }

  return { messageIds: (data.messages ?? []).map(m => m.id), newHistoryId }
}

export async function getMessage(account: EmailAccountRow, messageId: string): Promise<ParsedEmail> {
  const token = await getAccessToken(account)
  const url = `${GMAIL_API}/users/me/messages/${messageId}?format=full`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`gmail messages.get ${res.status}`)
  const msg = (await res.json()) as GmailMessage

  const headers = msg.payload?.headers ?? []
  const getH = (n: string) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value ?? null

  const fromRaw = getH('from') ?? ''
  const from = parseFromHeader(fromRaw)

  // Walk parts; collect text/html bodies and attachments
  let bodyText = ''
  let bodyHtml = ''
  const attachments: ParsedAttachment[] = []
  for (const p of flattenParts(msg.payload)) {
    const mt = p.mimeType ?? ''
    const isAttach = !!p.filename && p.filename.length > 0 && !!p.body?.attachmentId
    if (isAttach && p.body?.attachmentId) {
      attachments.push({
        filename: p.filename!,
        mimeType: mt,
        size: p.body.size ?? 0,
        attachmentId: p.body.attachmentId,
      })
      continue
    }
    if (mt === 'text/plain' && p.body?.data && !bodyText) {
      bodyText = decodeBase64Url(p.body.data).toString('utf-8')
    } else if (mt === 'text/html' && p.body?.data && !bodyHtml) {
      bodyHtml = decodeBase64Url(p.body.data).toString('utf-8')
    }
  }

  return {
    messageId: msg.id,
    threadId: msg.threadId,
    from,
    to: getH('to'),
    subject: getH('subject'),
    date: getH('date'),
    bodyText,
    bodyHtml,
    attachments,
    labelIds: msg.labelIds ?? [],
  }
}

export async function getAttachment(
  account: EmailAccountRow,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const token = await getAccessToken(account)
  const url = `${GMAIL_API}/users/me/messages/${messageId}/attachments/${attachmentId}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`gmail attachments.get ${res.status}`)
  const data = (await res.json()) as { data?: string; size?: number }
  if (!data.data) throw new Error('attachment has no data')
  return decodeBase64Url(data.data)
}

export async function markAsRead(account: EmailAccountRow, messageId: string): Promise<void> {
  const token = await getAccessToken(account)
  await fetch(`${GMAIL_API}/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  })
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
