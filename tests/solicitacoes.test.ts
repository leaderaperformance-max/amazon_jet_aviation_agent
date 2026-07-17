import { describe, it, expect } from 'vitest'
import { splitItemsByQuote, formatNumero, decideDispatch, mergeItems } from '@/lib/solicitacoes'

describe('mergeItems', () => {
  it('junta existentes + novos, dedup por PN, novo vence (qtd atualizada)', () => {
    const r = mergeItems(
      [{ part_number: 'ABC', quantity: '2' }, { part_number: 'XYZ', quantity: '1' }],
      [{ part_number: 'abc', quantity: '5' }, { part_number: 'NEW', quantity: '3' }],
    )
    expect(r).toEqual([
      { part_number: 'abc', quantity: '5' }, // ABC substituído, qtd nova 5, mantém a posição
      { part_number: 'XYZ', quantity: '1' },
      { part_number: 'NEW', quantity: '3' },
    ])
  })
  it('lista vazia + novos = novos', () => {
    expect(mergeItems([], [{ part_number: 'ABC', quantity: '2' }])).toEqual([{ part_number: 'ABC', quantity: '2' }])
  })
})

describe('splitItemsByQuote', () => {
  it('separa PN novo do repetido (case-insensitive + trim)', () => {
    const r = splitItemsByQuote(
      [{ part_number: ' abc123 ' }, { part_number: 'XYZ' }],
      ['ABC123'],
    )
    expect(r.repetidos.map(i => i.part_number)).toEqual([' abc123 '])
    expect(r.novos.map(i => i.part_number)).toEqual(['XYZ'])
  })
})

describe('formatNumero', () => {
  it('formata com 4 dígitos', () => {
    expect(formatNumero(1)).toBe('#0001')
    expect(formatNumero(102)).toBe('#0102')
    expect(formatNumero(9999)).toBe('#9999')
  })
  it('cresce pra 5 dígitos naturalmente', () => {
    expect(formatNumero(10000)).toBe('#10000')
  })
})

describe('decideDispatch', () => {
  const items = [{ part_number: 'ABC' }, { part_number: 'XYZ' }]
  it('primeira vez (não enviada) → enviada, todos os itens contam', () => {
    const r = decideDispatch({ sent_to_group_at: null, part_numbers: [] }, items)
    expect(r.action).toBe('enviada')
    expect(r.novos).toHaveLength(2)
  })
  it('já enviada + item novo → atualizada (só os novos)', () => {
    const r = decideDispatch({ sent_to_group_at: '2026-07-17T00:00:00Z', part_numbers: ['ABC'] }, items)
    expect(r.action).toBe('atualizada')
    expect(r.novos.map(i => i.part_number)).toEqual(['XYZ'])
  })
  it('já enviada + tudo repetido → possivel_duplicata (não dispara)', () => {
    const r = decideDispatch({ sent_to_group_at: '2026-07-17T00:00:00Z', part_numbers: ['ABC', 'XYZ'] }, items)
    expect(r.action).toBe('possivel_duplicata')
    expect(r.novos).toHaveLength(0)
  })
})
