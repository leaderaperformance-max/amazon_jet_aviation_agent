import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'

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
