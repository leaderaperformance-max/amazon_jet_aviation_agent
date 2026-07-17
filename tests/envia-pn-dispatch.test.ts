import { describe, it, expect } from 'vitest'
import { decideDispatch } from '@/lib/solicitacoes'

// A lógica de disparo já é testada em solicitacoes.test.ts; aqui garantimos o contrato
// de status que o envia_pn retorna pro agente (possivel_duplicata quando nada novo).
describe('contrato de status do envia_pn', () => {
  it('possivel_duplicata quando nada novo numa já enviada', () => {
    const r = decideDispatch({ sent_to_group_at: 'x', part_numbers: ['ABC'] }, [{ part_number: 'abc' }])
    expect(r.action).toBe('possivel_duplicata')
  })
})
