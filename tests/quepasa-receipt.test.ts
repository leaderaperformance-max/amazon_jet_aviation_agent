import { describe, it, expect } from 'vitest'
import { isQuepasaReceipt, looksLikeWhatsAppMessageId } from '@/lib/quepasa-receipt'

// Payloads reais da conversa 525 (PAULO RICARDO, 27/10/2026).
const recibo = {
  source_id: 'deliveryreceipt',
  content: '3EB0B98AECC7CF7E917159',
  content_attributes: { items: { quepasa: { from_device: false, msgid: 'deliveryreceipt' } } },
}
const clienteDeVerdade = {
  source_id: '3EB0C6342057AEE6BE2A71',
  content: 'Bom dia, gostaria de cotar o PN 3244809-8',
  content_attributes: { items: { quepasa: { from_device: false, msgid: '3EB0C6342057AEE6BE2A71' } } },
}

describe('isQuepasaReceipt', () => {
  it('confirmação de entrega é descartada (era o que virava loop)', () => {
    expect(isQuepasaReceipt(recibo)).toBe(true)
  })

  it('mensagem de verdade do cliente passa', () => {
    expect(isQuepasaReceipt(clienteDeVerdade)).toBe(false)
  })

  it('recibo de leitura também', () => {
    expect(isQuepasaReceipt({ ...recibo, source_id: 'readreceipt' })).toBe(true)
  })

  it('recibo sem a marca, só com o id no corpo, também é barrado', () => {
    expect(isQuepasaReceipt({ source_id: null, content: '3B7A2680D07DE53F6964' })).toBe(true)
  })

  it('mensagem vazia ou nula não quebra', () => {
    expect(isQuepasaReceipt(null)).toBe(false)
    expect(isQuepasaReceipt({ content: '' })).toBe(false)
  })
})

describe('looksLikeWhatsAppMessageId: não pode engolir Part Number de verdade', () => {
  it('ids que apareceram no loop', () => {
    for (const id of ['3EB0AA73505440D4AFFC02', '3B7A2680D07DE53F6964', '3BFCCF944AC6BA7A35B0', '3B3D3376B7B9D542D4D8']) {
      expect(looksLikeWhatsAppMessageId(id)).toBe(true)
    }
  })

  it('PNs reais do dia a dia continuam passando', () => {
    for (const pn of ['3244809-8', 'MS21266-2N', '010-01057-00', 'AN814-4BL', 'P778550-01', 'K10-00016-13', 'GDU 460', 'S1915-S', '857641-0010']) {
      expect(looksLikeWhatsAppMessageId(pn)).toBe(false)
    }
  })

  it('código curto parecido com hex não é confundido', () => {
    expect(looksLikeWhatsAppMessageId('ABC123')).toBe(false)
    expect(looksLikeWhatsAppMessageId('DEADBEEF')).toBe(false)
  })
})
