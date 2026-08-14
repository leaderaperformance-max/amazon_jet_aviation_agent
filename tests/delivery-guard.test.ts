import { describe, it, expect } from 'vitest'
import { promisesDeliveryDeadline, guardDeliveryDeadline, DEADLINE_SAFE_REPLY } from '@/lib/delivery-guard'
import { buildQuoteConfirmation } from '@/lib/quote-messages'

describe('trava de prazo de entrega — casos REAIS do print', () => {
  it('bloqueia "10 a 20 dias / 5 a 10 dias"', () => {
    const m = 'Bom dia! O prazo de entrega varia conforme a peça e a urgência. Em situações normais, é de 10 a 20 dias após a aprovação. Para AOG, priorizamos entre 5 a 10 dias.'
    expect(promisesDeliveryDeadline(m)).toBe(true)
    expect(guardDeliveryDeadline(m)).toEqual({ text: DEADLINE_SAFE_REPLY, blocked: true })
  })
  it('bloqueia "prazo de entrega para AOG é de 5 a 10 dias"', () => {
    const m = 'O prazo de entrega para AOG é de 5 a 10 dias após a aprovação da cotação. Se precisar de mais alguma informação, é só avisar!'
    expect(promisesDeliveryDeadline(m)).toBe(true)
  })
  it('bloqueia variações ("entrega em 15 dias", "chega em 2 semanas")', () => {
    expect(promisesDeliveryDeadline('A entrega acontece em 15 dias.')).toBe(true)
    expect(promisesDeliveryDeadline('A peça chega em 2 semanas.')).toBe(true)
    expect(promisesDeliveryDeadline('O transporte leva 20 dias.')).toBe(true)
  })
})

describe('o que NÃO pode ser bloqueado (falso positivo quebraria o atendimento)', () => {
  it('prazo de RETORNO da cotação é permitido', () => {
    expect(promisesDeliveryDeadline('Nosso especialista retorna com a cotação em até 48h úteis.')).toBe(false)
    expect(promisesDeliveryDeadline('Retorno com a cotação em até 2 dias úteis.')).toBe(false)
  })
  it('parcelamento é permitido', () => {
    expect(promisesDeliveryDeadline('Pagamento: entrada, parcela 2 em 30 dias e parcela 3 em 60 dias.')).toBe(false)
  })
  it('mensagens normais passam', () => {
    expect(promisesDeliveryDeadline('Olá! Me passa o Part Number da peça e a quantidade que já agilizo sua cotação.')).toBe(false)
    expect(promisesDeliveryDeadline('Qual a urgência para o recebimento da peça?')).toBe(false)
  })
  it('confirmação de cotação com PNs passa intacta', () => {
    const conf = buildQuoteConfirmation({
      action: 'enviada', numero: 18, clientName: 'Maurício', clientPhone: '5518999999999',
      urgency: 'rotina', items: [{ part_number: 'AN814-4BL', quantity: '3' }],
    })
    expect(promisesDeliveryDeadline(conf)).toBe(false)
    expect(guardDeliveryDeadline(conf)).toEqual({ text: conf, blocked: false })
  })
})
