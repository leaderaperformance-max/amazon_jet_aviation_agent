import { describe, it, expect } from 'vitest'
import { buildGroupMessage, buildQuoteConfirmation } from '@/lib/quote-messages'

describe('buildQuoteConfirmation — resposta padrão com listagem de PNs', () => {
  const base = {
    action: 'enviada' as const, numero: 17, clientName: 'Wanderson',
    clientPhone: '5531999999999', urgency: 'rotina',
  }

  it('traz #ID, cliente e lista TODOS os PNs (caso real: 38 itens)', () => {
    const items = Array.from({ length: 38 }, (_, i) => ({ part_number: `LW-${1000 + i}`, quantity: '1' }))
    const m = buildQuoteConfirmation({ ...base, items })
    expect(m).toContain('SOLICITAÇÃO #0017')
    expect(m).toContain('👤 *Cliente:* Wanderson')
    expect(m).toContain('*ITENS (38):*')
    expect(m).toContain('1. LW-1000 — Qtd: 1')
    expect(m).toContain('38. LW-1037 — Qtd: 1') // o último item aparece: nada de truncar
    // NUNCA resumir
    expect(m).not.toMatch(/Total de itens/i)
  })

  it('não vaza dados de documento (e-mail/matrícula/modelo)', () => {
    const m = buildQuoteConfirmation({ ...base, items: [{ part_number: 'AN960-416', quantity: '2' }] })
    expect(m).not.toMatch(/e-?mail/i)
    expect(m).not.toMatch(/matrícula/i)
    expect(m).not.toMatch(/modelo/i)
  })

  it('atualização usa o header de atualização', () => {
    const m = buildQuoteConfirmation({ ...base, action: 'atualizada', items: [{ part_number: 'X1', quantity: '1' }] })
    expect(m).toContain('ATUALIZAÇÃO DA #0017')
  })
})

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
  it('atualização deixa claríssimo que é atualização (header + aviso)', () => {
    const m = buildGroupMessage({ ...base, action: 'atualizada' })
    expect(m).toContain('ATUALIZAÇÃO DA #0102')
    expect(m).toContain('NÃO é um pedido novo')
    expect(m).toContain('Lista completa')
  })
  it('primeira vez NÃO mostra o aviso de atualização', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada' })
    expect(m).not.toContain('NÃO é um pedido novo')
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

describe('disparo no grupo durante atendimento humano', () => {
  const base = {
    action: 'enviada' as const, numero: 125, channelLabel: 'WhatsApp',
    clientName: 'Newton', clientPhone: '5567992975008', urgency: 'rotina',
    items: [{ part_number: '3244809-8', quantity: '1' }],
    chatwootUrl: 'https://cw/app/accounts/14/conversations/293',
  }

  it('avisa o time que o cliente NÃO recebeu resposta da IA', () => {
    const msg = buildGroupMessage({ ...base, handledByHuman: true })
    expect(msg).toContain('ATENDIMENTO HUMANO')
    expect(msg).toContain('precisa dar o retorno')
    expect(msg).toContain('3244809-8') // a cotação vai completa do mesmo jeito
  })

  it('fluxo normal não leva esse aviso', () => {
    expect(buildGroupMessage(base)).not.toContain('ATENDIMENTO HUMANO')
  })
})
