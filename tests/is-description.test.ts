import { describe, it, expect } from 'vitest'
import { isLikelyDescription } from '@/lib/part-number'

describe('isLikelyDescription — trava descrição≠PN no envia_pn', () => {
  it('DESCRIÇÕES do caso real são barradas', () => {
    for (const d of [
      'Par de luzes de navegação/strobo',
      'Luz de beacon',
      'Par de farol de ponta de asas',
      'Antenas de CHT do Garmin G3X',
      'Instrumento de Painel Horímetro',
      'Tela G3X Touch Garmin 10,6 polegadas (GDU 460)',
      'Farol de pouso do capô xenon',
    ]) {
      expect(isLikelyDescription(d), `deveria barrar: ${d}`).toBe(true)
    }
  })

  it('PART NUMBERS reais passam (não são barrados)', () => {
    for (const pn of [
      'K10-00016-13',
      '010-01057-00',
      'AN814-4BL',
      '658720M010',
      'MS28741-4-0100',
      'GDU 460',
      'GDU-460',
      '0542008',
      '800114-14',
    ]) {
      expect(isLikelyDescription(pn), `NÃO deveria barrar: ${pn}`).toBe(false)
    }
  })

  it('vazio/nulo → false (não barra)', () => {
    expect(isLikelyDescription('')).toBe(false)
    expect(isLikelyDescription(null)).toBe(false)
    expect(isLikelyDescription('   ')).toBe(false)
  })
})
