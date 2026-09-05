import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]) }))
import { clientMentionedAOG } from '@/lib/urgency-guard'

describe('trava de AOG — só vale se o cliente escreveu a sigla', () => {
  it('aceita quando o cliente escreve AOG (variações da sigla)', () => {
    expect(clientMentionedAOG(['é AOG, aeronave no hangar'])).toBe(true)
    expect(clientMentionedAOG(['aog urgente'])).toBe(true)
    expect(clientMentionedAOG(['situação A.O.G.'])).toBe(true)
    expect(clientMentionedAOG(['aircraft on ground'])).toBe(true)
  })

  it('NÃO aceita urgência/emergência/aeronave parada sem a sigla', () => {
    expect(clientMentionedAOG(['é uma emergência!'])).toBe(false)
    expect(clientMentionedAOG(['muito urgente, pra ontem'])).toBe(false)
    expect(clientMentionedAOG(['a aeronave está parada esperando a peça'])).toBe(false)
    expect(clientMentionedAOG(['o mais rápido possível'])).toBe(false)
    expect(clientMentionedAOG(['preciso com pressa, avião em solo'])).toBe(false)
  })

  it('lista vazia / nulos → false', () => {
    expect(clientMentionedAOG([])).toBe(false)
    expect(clientMentionedAOG([null, undefined, ''])).toBe(false)
  })

  it('não confunde palavras que contêm as letras', () => {
    expect(clientMentionedAOG(['preciso de um cabo com plug'])).toBe(false)
    expect(clientMentionedAOG(['catálogo'])).toBe(false)
  })
})
