import { getAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/quepasa'
import {
  EmailAccountRow, getAttachment, getMessage, htmlToText, listNewMessageIds, markAsRead, ParsedEmail,
} from '@/lib/google/gmail'
import { processBuffer } from '@/lib/media/process'
import { summarizeEmail } from '@/lib/email/summarize'

export interface ProcessResult {
  account_id: string
  fetched: number
  processed: number
  skipped: number
  errors: string[]
}

/**
 * Categorias que disparam notificação no WhatsApp. Os outros emails
 * (dúvida técnica, spam, interno, etc) continuam sendo salvos no DB
 * e aparecem no /dashboard/email, mas não interrompem o vendedor.
 */
const NOTIFY_CATEGORIES = new Set(['cotacao', 'rfq', 'ordem_compra', 'follow_up'])

interface InboxNotifyCfg {
  quepasa_host: string
  quepasa_token: string
  seller_phone: string
}

/**
 * Returns the first inbox with a seller_phone + quepasa config so we know
 * where to deliver the WhatsApp notification. (Single-tenant for now.)
 */
async function loadNotifyConfig(): Promise<InboxNotifyCfg | null> {
  const admin = getAdminClient()
  const { data } = await admin
    .from('inboxes')
    .select('quepasa_host, quepasa_token, seller_phone')
    .eq('enabled', true)
    .not('seller_phone', 'is', null)
    .not('quepasa_host', 'is', null)
    .limit(1)
    .maybeSingle()

  if (!data?.seller_phone || !data?.quepasa_host || !data?.quepasa_token) return null
  return data as InboxNotifyCfg
}

function formatSellerMessage(email: ParsedEmail, summary: Awaited<ReturnType<typeof summarizeEmail>>): string {
  const fromLabel = email.from.name
    ? `${email.from.name} <${email.from.address ?? '?'}>`
    : email.from.address ?? '(desconhecido)'

  const urgencyEmoji = summary.urgency === 'AOG' ? '🔴' : summary.urgency === 'rotina' ? '🟡' : '⚪'
  const categoryEmoji = ({
    cotacao: '💰',
    rfq: '📋',
    duvida_tecnica: '🔧',
    follow_up: '⏰',
    ordem_compra: '✅',
    spam: '🗑️',
    interno: '🏢',
    outros: '📧',
  } as Record<string, string>)[summary.category] ?? '📧'

  return [
    `📩 *NOVO EMAIL — ${categoryEmoji} ${summary.category.toUpperCase()}*`,
    '',
    `👤 *De:* ${fromLabel}`,
    `📌 *Assunto:* ${email.subject ?? '(sem assunto)'}`,
    `${urgencyEmoji} *Urgência:* ${summary.urgency}`,
    '',
    `📝 *Resumo:*`,
    summary.summary,
    summary.detected_pns.length > 0 ? `\n🔧 *Part Numbers:* ${summary.detected_pns.join(', ')}` : '',
    email.attachments.length > 0 ? `📎 *Anexos:* ${email.attachments.length} (${email.attachments.map(a => a.filename).join(', ')})` : '',
    '',
    `🔗 Abrir no Gmail:`,
    `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`,
  ].filter(Boolean).join('\n')
}

export async function processOneMessage(
  account: EmailAccountRow,
  messageId: string,
  notifyCfg: InboxNotifyCfg | null
): Promise<{ skipped: boolean; reason?: string }> {
  const admin = getAdminClient()

  // Dedup: skip if we already processed this Gmail message id
  const { data: existing } = await admin
    .from('email_summaries')
    .select('id')
    .eq('gmail_message_id', messageId)
    .maybeSingle()
  if (existing) return { skipped: true, reason: 'already processed' }

  const email = await getMessage(account, messageId)

  // Build a unified text representation of body
  const body = email.bodyText && email.bodyText.length > 50
    ? email.bodyText
    : email.bodyHtml ? htmlToText(email.bodyHtml) : (email.bodyText || email.bodyHtml)

  // Process each attachment (PDF/image/audio/spreadsheet) — reuse pipeline
  const attachmentTexts: string[] = []
  for (const att of email.attachments.slice(0, 5)) {
    // skip oversized > 20MB to avoid memory blowups
    if (att.size > 20 * 1024 * 1024) {
      attachmentTexts.push(`[${att.filename}: arquivo grande (${(att.size / 1024 / 1024).toFixed(1)}MB), não processado]`)
      continue
    }
    try {
      const buf = await getAttachment(account, messageId, att.attachmentId)
      const text = await processBuffer(buf, att.mimeType, att.filename)
      if (text) attachmentTexts.push(text)
    } catch (err) {
      attachmentTexts.push(`[${att.filename}: erro ao processar — ${(err as Error).message.slice(0, 80)}]`)
    }
  }

  // Categorize + summarize via LLM
  const summary = await summarizeEmail({
    from: email.from.name
      ? `${email.from.name} <${email.from.address ?? ''}>`
      : email.from.address ?? '',
    subject: email.subject ?? '',
    body,
    attachmentsText: attachmentTexts.join('\n\n'),
  })

  // Save to DB
  const { error: insertErr } = await admin.from('email_summaries').insert({
    email_account_id: account.id,
    gmail_message_id: email.messageId,
    gmail_thread_id: email.threadId,
    from_address: email.from.address,
    from_name: email.from.name,
    subject: email.subject,
    category: summary.category,
    summary: summary.summary,
    attachment_count: email.attachments.length,
    detected_pns: summary.detected_pns,
    received_at: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
  })
  if (insertErr) throw new Error(`insert: ${insertErr.message}`)

  // Only notify sales-relevant categories on WhatsApp. Everything else is
  // still saved to the dashboard but doesn't ping the seller.
  if (!NOTIFY_CATEGORIES.has(summary.category)) {
    await markAsRead(account, messageId).catch(() => {})
    console.log(`[email/process] ${email.messageId} category=${summary.category} → no whatsapp notify`)
    return { skipped: false }
  }

  // Send WhatsApp notification
  if (notifyCfg) {
    const text = formatSellerMessage(email, summary)
    // If it's a JID (contains @ — e.g. group "...@g.us"), pass as-is.
    // Otherwise strip non-digits for plain phone numbers.
    const recipient = notifyCfg.seller_phone.includes('@')
      ? notifyCfg.seller_phone
      : notifyCfg.seller_phone.replace(/[^\d]/g, '')
    try {
      await sendMessage(
        { host: notifyCfg.quepasa_host, token: notifyCfg.quepasa_token },
        recipient,
        text
      )
      await admin
        .from('email_summaries')
        .update({ notified_at: new Date().toISOString() })
        .eq('gmail_message_id', email.messageId)
    } catch (err) {
      console.warn(`[email/process] whatsapp send failed: ${(err as Error).message}`)
    }
  } else {
    console.warn('[email/process] no notify config — skipping whatsapp')
  }

  // Mark email as read so it doesn't show up in subsequent polls
  await markAsRead(account, messageId).catch(() => {})

  return { skipped: false }
}

export async function processAccount(account: EmailAccountRow, maxPerPoll = 5): Promise<ProcessResult> {
  const result: ProcessResult = { account_id: account.id, fetched: 0, processed: 0, skipped: 0, errors: [] }
  const notifyCfg = await loadNotifyConfig()

  const { messageIds, newHistoryId } = await listNewMessageIds(account, maxPerPoll)
  result.fetched = messageIds.length

  for (const id of messageIds) {
    try {
      const r = await processOneMessage(account, id, notifyCfg)
      if (r.skipped) result.skipped++
      else result.processed++
    } catch (err) {
      result.errors.push(`${id}: ${(err as Error).message.slice(0, 200)}`)
    }
  }

  // Update account: persist new history_id + last_polled_at
  const admin = getAdminClient()
  await admin
    .from('email_accounts')
    .update({
      history_id: newHistoryId ?? account.history_id,
      last_polled_at: new Date().toISOString(),
    })
    .eq('id', account.id)

  return result
}
