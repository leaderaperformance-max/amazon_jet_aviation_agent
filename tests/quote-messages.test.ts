import { describe, it, expect } from 'vitest'
import { buildGroupMessage } from '@/lib/quote-messages'

const base = {
  numero: 102, channelLabel: 'WhatsApp', clientName: 'João', clientPhone: '5595999',
  urgency: 'AOG', items: [{ part_number: 'ABC', quantity: '2' }],
  chatwootUrl: 'https://cw/x',
}

describe('buildGroupMessage', () => {
  it('primeira vez usa 🆕 SOLICITAÇÃO #0102', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada' })
    expect(m).toContain('🆕 *SOLICITAÇÃO #0102*')
    expect(m).toContain('👤 *Cliente:* João')
  })
  it('atualização usa 🔄 ATUALIZAÇÃO #0102', () => {
    const m = buildGroupMessage({ ...base, action: 'atualizada' })
    expect(m).toContain('🔄 *ATUALIZAÇÃO #0102*')
  })
  it('inclui "via consultor" quando houver reseller', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada', resellerName: 'Anderson' })
    expect(m).toContain('🤝 *via consultor:* Anderson')
  })
  it('omite "via consultor" quando não houver', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada' })
    expect(m).not.toContain('via consultor')
  })
})
