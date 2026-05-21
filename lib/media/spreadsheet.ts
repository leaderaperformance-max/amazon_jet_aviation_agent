import * as XLSX from 'xlsx'

const MAX_CHARS = 8000

export function extractSpreadsheetText(buffer: Buffer): { text: string; sheetsCount: number } {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const lines: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csvText = XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', blankrows: false })
    if (csvText.trim()) {
      lines.push(`=== Sheet: ${sheetName} ===`)
      lines.push(csvText)
    }
  }

  const full = lines.join('\n').trim()
  return {
    text: full.length > MAX_CHARS ? full.slice(0, MAX_CHARS) : full,
    sheetsCount: workbook.SheetNames.length,
  }
}
