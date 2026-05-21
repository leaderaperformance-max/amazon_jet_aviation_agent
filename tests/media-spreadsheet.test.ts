import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { extractSpreadsheetText } from '@/lib/media/spreadsheet'

describe('extractSpreadsheetText', () => {
  it('extrai conteúdo de XLSX simples', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['PN', 'Qtd', 'Condition'],
      ['MS21266-2N', 2, 'NEW'],
      ['AN3-5A', 10, 'OVH'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Lista')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const result = extractSpreadsheetText(buf)
    expect(result.text).toContain('MS21266-2N')
    expect(result.text).toContain('AN3-5A')
    expect(result.sheetsCount).toBe(1)
  })
})
