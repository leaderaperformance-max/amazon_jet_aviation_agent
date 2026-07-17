import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { getOpenSolicitacao, openSolicitacao } from '@/lib/solicitacoes'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

const fresh = {
  id: 's1', numero: 1, client_phone: '55', client_name: null, state: 'aberta',
  part_numbers: [], items: [], lead_ids: [], via_reseller: false, reseller_name: null,
  reseller_phone: null, origin_session_id: '55', sent_to_group_at: null,
  opened_at: '2026-07-17T00:00:00Z', updated_at: '2026-07-17T00:00:00Z', closed_at: null,
}

function selectChain(data: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
            }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  }
}

describe('getOpenSolicitacao', () => {
  beforeEach(() => vi.clearAllMocks())
  it('retorna a aberta quando recente', async () => {
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain(fresh)) })
    const now = new Date('2026-07-17T01:00:00Z').getTime()
    expect(await getOpenSolicitacao('55', now)).toMatchObject({ id: 's1' })
  })
  it('fecha e retorna null quando parada > 48h', async () => {
    const chain = selectChain(fresh)
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue(chain) })
    const now = new Date('2026-07-20T00:00:00Z').getTime() // +72h
    expect(await getOpenSolicitacao('55', now)).toBeNull()
    expect(chain.update).toHaveBeenCalled()
  })
})

describe('openSolicitacao', () => {
  beforeEach(() => vi.clearAllMocks())
  it('insere e retorna a solicitação criada', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...fresh, numero: 7 }, error: null })
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) })
    const s = await openSolicitacao({ clientPhone: '55', originSessionId: '55' })
    expect(s.numero).toBe(7)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ client_phone: '55', origin_session_id: '55' }))
  })

  it('corrida no índice único (23505) → relê a aberta que o outro processo criou', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } })
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
    const existing = { ...fresh, id: 's-existing', numero: 9, updated_at: new Date().toISOString() }
    const getOpenChain = selectChain(existing) // reusa a chain de getOpenSolicitacao
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue({ insert, ...getOpenChain }) })
    const s = await openSolicitacao({ clientPhone: '55', originSessionId: '55' })
    expect(s.id).toBe('s-existing')
  })
})
