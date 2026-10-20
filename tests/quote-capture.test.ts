import { describe, it, expect } from 'vitest'
import { mentionsPartNumberCandidate, SILENT_CAPTURE_DIRECTIVE } from '@/lib/quote-capture'

describe('filtro: a mensagem tem cara de cotação com Part Number?', () => {
  it('caso Newton (19/10/2026): mensagem encaminhada com o PN', () => {
    expect(mentionsPartNumberCandidate(
      'Descrição ......: FUEL CONTROL UNIT\nP/N .................: 3244809-8\nMotor : PT6A',
    )).toBe(true)
  })

  it('pega PN em formatos comuns do dia a dia', () => {
    expect(mentionsPartNumberCandidate('bom dia, preciso cotar MS21266-2N')).toBe(true)
    expect(mentionsPartNumberCandidate('010-01057-00')).toBe(true)
    expect(mentionsPartNumberCandidate('segue a lista: 0413362-2 e AN814-4BL')).toBe(true)
    expect(mentionsPartNumberCandidate('PN 3244809 quantidade 2')).toBe(true) // sem separador, mas disse "PN"
    expect(mentionsPartNumberCandidate('Part Number 3244809')).toBe(true)
  })

  it('não gasta chamada com conversa comum', () => {
    expect(mentionsPartNumberCandidate('Okok')).toBe(false)
    expect(mentionsPartNumberCandidate('Bom dia, tudo bem?')).toBe(false)
    expect(mentionsPartNumberCandidate('Como estamos com o orçamento?')).toBe(false)
    expect(mentionsPartNumberCandidate('obrigado!')).toBe(false)
    expect(mentionsPartNumberCandidate('')).toBe(false)
    expect(mentionsPartNumberCandidate(null)).toBe(false)
  })

  it('data e link não são Part Number', () => {
    expect(mentionsPartNumberCandidate('te mando dia 19/10')).toBe(false)
    expect(mentionsPartNumberCandidate('fechamos em 19/10/2026')).toBe(false)
    expect(mentionsPartNumberCandidate('https://www.instagram.com/reel/DedFrTVxOPy/?vrfl=ZXF2')).toBe(false)
  })

  it('a diretiva deixa explícito que nada vai pro cliente', () => {
    expect(SILENT_CAPTURE_DIRECTIVE).toContain('ATENDENTE HUMANO')
    expect(SILENT_CAPTURE_DIRECTIVE).toContain('descartado')
    expect(SILENT_CAPTURE_DIRECTIVE).toContain('envia_pn')
  })
})
