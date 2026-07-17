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
})

describe('buildQuoteContextDirective', () => {
  it('injeta origem consultor + PNs já recebidos + #ID', () => {
    const d = buildQuoteContextDirective({ numero: 102, resellerName: 'Anderson', partNumbers: ['ABC', 'XYZ'] })
    expect(d).toContain('#0102')
    expect(d).toContain('Anderson')
    expect(d).toContain('ABC')
  })
})
