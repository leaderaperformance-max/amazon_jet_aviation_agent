/**
 * Google Sheets integration via OAuth user token.
 *
 * We piggyback on the OAuth refresh_token saved by the Gmail integration
 * (table `email_accounts`). Personal Google accounts can't use Service
 * Accounts to create Drive files (no quota), so we create the spreadsheet
 * AS the connected user — file ends up in their Drive automatically.
 */

import { getAdminClient } from '@/lib/supabase/admin'
import { getAccessToken, EmailAccountRow } from '@/lib/google/gmail'

export interface SheetItem {
  part_number: string
  quantity: string | number
}

export interface CreatedSheet {
  spreadsheetId: string
  url: string
  title: string
}

/**
 * Find the OAuth account we should use to create sheets. Defaults to
 * the email configured in SHEET_SHARE_WITH (the company Gmail).
 */
async function loadSheetOAuthAccount(): Promise<EmailAccountRow> {
  const targetEmail = process.env.SHEET_SHARE_WITH ?? 'amazonjetaviation@gmail.com'
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('email_accounts')
    .select('id, email_address, refresh_token, access_token, expires_at, history_id')
    .eq('email_address', targetEmail)
    .eq('enabled', true)
    .maybeSingle()

  if (error || !data) {
    throw new Error(
      `No OAuth account configured for sheet creation (looking for ${targetEmail}). ` +
      `Connect Gmail in /dashboard/email first.`
    )
  }
  return data as EmailAccountRow
}

function formatTitle(customerName: string | null, urgency: 'AOG' | 'rotina'): string {
  const safeName = (customerName ?? 'Cliente').replace(/[\\/:*?"<>|]/g, ' ').trim()
  const now = new Date()
  const date = now.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
  const time = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
  const prefix = urgency === 'AOG' ? 'AOG ' : ''
  return `${prefix}Cotação - ${safeName} - ${date} ${time}`
}

export async function createPartsSheet(params: {
  customerName: string | null
  customerPhone: string | null
  items: SheetItem[]
  urgency: 'AOG' | 'rotina'
}): Promise<CreatedSheet> {
  const account = await loadSheetOAuthAccount()
  const token = await getAccessToken(account)
  const title = formatTitle(params.customerName, params.urgency)

  // 1) Create the spreadsheet in the user's Drive
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: {
          title: 'Parts',
          gridProperties: { rowCount: params.items.length + 10, columnCount: 2 },
        },
      }],
    }),
  })
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '')
    throw new Error(`sheets.create ${createRes.status}: ${err.slice(0, 200)}`)
  }
  const created = (await createRes.json()) as { spreadsheetId: string; spreadsheetUrl: string }

  // 2) Populate values
  const values = [
    ['PartNumber', 'Quantity'],
    ...params.items.map(i => [i.part_number, String(i.quantity)]),
  ]
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values/Parts!A1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    },
  )
  if (!updateRes.ok) {
    const err = await updateRes.text().catch(() => '')
    throw new Error(`sheets.values.update ${updateRes.status}: ${err.slice(0, 200)}`)
  }

  // 3) Format header (non-fatal)
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                },
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      }),
    },
  ).catch(err => console.warn('[sheets] format failed (non-fatal):', err))

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.spreadsheetUrl,
    title,
  }
}
