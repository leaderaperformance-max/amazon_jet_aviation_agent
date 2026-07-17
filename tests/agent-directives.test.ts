import { describe, it, expect } from 'vitest'
import { buildResellerDirective, buildQuoteContextDirective } from '@/lib/agent-directives'

describe('buildResellerDirective', () => {
  it('instrui a pedir e confirmar nome+número do cliente', () => {
    const d = buildResellerDirective('Anderson')
    expect(d).toContain('Anderson')
    expect(d.toLowerCase()).toContain('nome')
    expect(d.toLowerCase()).toContain('número')
    expect(d).toContain('client_name')
    expect(d).toContain('client_phone')
  })
  it('sem número → manda pedir o número e NÃO dizer que enviou', () => {
    const d = buildResellerDirective('Anderson')
    expect(d).toContain('faltou_cliente')
    expect(d).toContain('preciso do número do cliente')
    expect(d.toLowerCase()).toContain('nunca diga')
  })
})

describe('buildQuoteContextDirective', () => {
  it('injeta origem consultor + PNs já recebidos + #ID', () => {
    const d = buildQuoteContextDirective({ numero: 102, resellerName: 'Anderson', partNumbers: ['ABC', 'XYZ'] })
    expect(d).toContain('#0102')
    expect(d).toContain('Anderson')
    expect(d).toContain('ABC')
  })
})
