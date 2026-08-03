import { describe, it, expect } from 'vitest'
import { sanitizeReply } from '@/lib/reply-sanitizer'
import { buildQuoteConfirmation } from '@/lib/quote-messages'

describe('sanitizeReply — raciocínio interno nunca chega ao cliente', () => {
  it('caso real: remove a análise e entrega só a mensagem', () => {
    const raw = `Parece que o contato está interessado em aviação, mas não traz perguntas sobre peças ou necessidade de cotação. Como ele mencionou estar estudando para ser piloto privado, ele não se enquadra no perfil de cliente que podemos atender, uma vez que não está buscando informações sobre peças aeronáuticas.

Vou encerrar a conversa de forma cortês:

---

"Olá! Agradeço pelo seu contato, mas nosso foco é em fornecimento de peças aeronáuticas. Se você precisar de informações nesse sentido no futuro, ficamos à disposição. Boa sorte nos seus estudos para ser piloto!"`
    const out = sanitizeReply(raw)
    expect(out.startsWith('Olá! Agradeço pelo seu contato')).toBe(true)
    expect(out).not.toMatch(/Parece que o contato/)
    expect(out).not.toMatch(/Vou encerrar a conversa/)
    expect(out).not.toMatch(/não se enquadra/)
    expect(out).not.toContain('"')
    expect(out).not.toContain('---')
  })

  it('remove preâmbulo mesmo sem aspas', () => {
    const raw = `O cliente não mencionou o Part Number ainda.\n\nOlá! Me passa o Part Number da peça e a quantidade que já agilizo sua cotação.`
    const out = sanitizeReply(raw)
    expect(out).toBe('Olá! Me passa o Part Number da peça e a quantidade que já agilizo sua cotação.')
  })

  it('desembrulha mensagem inteira entre aspas', () => {
    const out = sanitizeReply('"Olá! Aqui é o Jet, da Amazon Jet Aviation. Como posso te ajudar hoje?"')
    expect(out).toBe('Olá! Aqui é o Jet, da Amazon Jet Aviation. Como posso te ajudar hoje?')
  })

  it('mensagem normal passa INTACTA', () => {
    const msg = 'Olá! Aqui é o Jet, da Amazon Jet Aviation. Me passa o Part Number da peça e a quantidade que já agilizo sua cotação.'
    expect(sanitizeReply(msg)).toBe(msg)
  })

  it('confirmação padrão de cotação passa INTACTA (não pode ser mutilada)', () => {
    const conf = buildQuoteConfirmation({
      action: 'enviada', numero: 17, clientName: 'Wanderson', clientPhone: '5531999999999',
      urgency: 'rotina', items: [{ part_number: 'AN814-4BL', quantity: '2' }, { part_number: '0542008', quantity: '1' }],
    })
    expect(sanitizeReply(conf)).toBe(conf)
  })

  it('fechamento com recap de PNs passa intacto', () => {
    const msg = 'Já estou verificando disponibilidade e melhores condições.\n\nConfirmei o pedido:\n• AN814-4BL — 2 un\n\nCostuma usar esse item com frequência?'
    expect(sanitizeReply(msg)).toBe(msg)
  })

  it('nunca devolve vazio', () => {
    expect(sanitizeReply('Vou encerrar a conversa agora.')).toBeTruthy()
    expect(sanitizeReply('')).toBe('')
  })

  it('é idempotente', () => {
    const raw = `Parece que o cliente não quer nada.\n\n"Olá! Posso te ajudar com alguma peça aeronáutica hoje?"`
    const once = sanitizeReply(raw)
    expect(sanitizeReply(once)).toBe(once)
  })
})
