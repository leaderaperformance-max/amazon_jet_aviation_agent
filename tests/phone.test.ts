import { describe, it, expect } from 'vitest'
import { normalizePhone, toBrazilWhatsApp } from '@/lib/phone'

describe('normalizePhone', () => {
  it('mantém só dígitos', () => {
    expect(normalizePhone('+55 (95) 99172-0919')).toBe('5595991720919')
  })
  it('trata null/undefined/vazio', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('   ')).toBe('')
  })
})

describe('toBrazilWhatsApp', () => {
  it('mantém número já canônico (13 dígitos com 55)', () => {
    expect(toBrazilWhatsApp('5595991720919')).toBe('5595991720919')
  })
  it('põe o 55 quando falta (DDD + 9 + 8 = 11 dígitos)', () => {
    expect(toBrazilWhatsApp('95991720919')).toBe('5595991720919')
  })
  it('põe o 9 quando falta (DDD + 8 = 10 dígitos)', () => {
    expect(toBrazilWhatsApp('9591720919')).toBe('5595991720919')
  })
  it('põe 55 e 9 a partir de um formatado sem os dois', () => {
    expect(toBrazilWhatsApp('(95) 9172-0919')).toBe('5595991720919')
  })
  it('normaliza um número já com 55 e 9 mas formatado', () => {
    expect(toBrazilWhatsApp('+55 (95) 99172-0919')).toBe('5595991720919')
  })
  it('vazio → vazio', () => {
    expect(toBrazilWhatsApp('')).toBe('')
    expect(toBrazilWhatsApp(null)).toBe('')
  })
})
