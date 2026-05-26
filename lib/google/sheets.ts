/**
 * Google Sheets integration via Service Account.
 *
 * Creates a new spreadsheet per lead with the items requested by the customer,
 * formatted exactly like the PartsToLoad.csv template (PartNumber, Quantity),
 * and shares it with the company Gmail account so the team can access.
 */

import { GoogleAuth } from 'google-auth-library'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
]

interface ServiceAccountKey {
  type: 'service_account'
  project_id: string
  private_key: string
  client_email: string
  [k: string]: unknown
}

function loadServiceAccountKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env missing')
  // We store it base64-encoded so multi-line private keys survive env injection
  const decoded = Buffer.from(raw, 'base64').toString('utf-8')
  try {
    return JSON.parse(decoded) as ServiceAccountKey
  } catch {
    // Fallback: maybe it was stored as raw JSON
    return JSON.parse(raw) as ServiceAccountKey
  }
}

let _auth: GoogleAuth | null = null
function getAuth(): GoogleAuth {
  if (_auth) return _auth
  const credentials = loadServiceAccountKey()
  _auth = new GoogleAuth({ credentials, scopes: SCOPES })
  return _auth
}

async function getAccessToken(): Promise<string> {
  const client = await getAuth().getClient()
  const { token } = await client.getAccessToken()
  if (!token) throw new Error('Failed to get Google access token')
  return token
}

export interface SheetItem {
  part_number: string
  quantity: string | number
}

export interface CreatedSheet {
  spreadsheetId: string
  url: string
  title: string
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

/**
 * Creates a new Google Sheet, populates it with the items, shares it
 * with the configured company email, and returns the public URL.
 */
export async function createPartsSheet(params: {
  customerName: string | null
  customerPhone: string | null
  items: SheetItem[]
  urgency: 'AOG' | 'rotina'
}): Promise<CreatedSheet> {
  const token = await getAccessToken()
  const title = formatTitle(params.customerName, params.urgency)

  // 1) Create spreadsheet (one sheet, no formatting yet)
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Parts', gridProperties: { rowCount: params.items.length + 10, columnCount: 2 } } }],
    }),
  })
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '')
    throw new Error(`sheets.create failed ${createRes.status}: ${err.slice(0, 200)}`)
  }
  const created = (await createRes.json()) as { spreadsheetId: string; spreadsheetUrl: string }

  // 2) Write header + rows
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
    throw new Error(`sheets.values.update failed ${updateRes.status}: ${err.slice(0, 200)}`)
  }

  // 3) Format header row (bold, frozen)
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

  // 4) Share with company email (writer access)
  const shareWith = process.env.SHEET_SHARE_WITH ?? 'amazonjetaviation@gmail.com'
  const shareRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}/permissions?sendNotificationEmail=false`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user',
        role: 'writer',
        emailAddress: shareWith,
      }),
    },
  )
  if (!shareRes.ok) {
    const err = await shareRes.text().catch(() => '')
    console.warn(`[sheets] share with ${shareWith} failed: ${err.slice(0, 200)}`)
  }

  return {
    spreadsheetId: created.spreadsheetId,
    url: created.spreadsheetUrl,
    title,
  }
}
