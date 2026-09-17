import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import {
  drainPending, completePending, releasePending, hasInFlightPending,
  PENDING_LEASE_SECONDS, SKIP_ATTACHMENTS_FROM_ATTEMPT,
} from '@/lib/debounce'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

// Mock do claim com aluguel: rpc('claim_pending_messages') → { data: rows }
function mockClaim(rows: unknown[]) {
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null })
  return { db: { rpc }, rpc }
}

describe('drainPending (claim com aluguel + merge)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reivindica pela função SQL com aluguel maior que o tempo máximo do worker (60s)', async () => {
    const { db, rpc } = mockClaim([])
    mockGet.mockReturnValue(db)
    await drainPending('s1')
    expect(rpc).toHaveBeenCalledWith('claim_pending_messages', { p_session_id: 's1', p_lease_seconds: PENDING_LEASE_SECONDS })
    expect(PENDING_LEASE_SECONDS).toBeGreaterThan(60)
  })

  it('mescla o texto e agrega anexos de todas as linhas, ordenado por received_at', async () => {
    const rows = [
      { id: 'b', content: 'segunda', received_at: '2026-07-22T10:00:02Z', context: { attachments: [{ x: 2 }], labels: ['novo'] }, attempts: 1 },
      { id: 'a', content: 'primeira', received_at: '2026-07-22T10:00:01Z', context: { attachments: [{ x: 1 }] }, attempts: 1 },
    ]
    mockGet.mockReturnValue(mockClaim(rows).db)
    const r = await drainPending('s1')
    expect(r.ids).toEqual(['a', 'b']) // ordenado por received_at
    expect(r.combinedContent).toBe('primeira\n\nsegunda')
    expect(r.attachments).toEqual([{ x: 1 }, { x: 2 }])
    expect((r.context as { labels: string[] }).labels).toEqual(['novo']) // context da ÚLTIMA
    expect(r.attempt).toBe(1)
    expect(r.skippedAttachments).toBe(0)
  })

  it('ignora linhas de conteúdo vazio no merge (ex.: mensagem só com anexo)', async () => {
    const rows = [
      { id: 'a', content: 'quero cotar', received_at: '2026-07-22T10:00:01Z', context: {}, attempts: 1 },
      { id: 'b', content: '', received_at: '2026-07-22T10:00:02Z', context: { attachments: [{ pdf: 1 }] }, attempts: 1 },
    ]
    mockGet.mockReturnValue(mockClaim(rows).db)
    const r = await drainPending('s1')
    expect(r.combinedContent).toBe('quero cotar')
    expect(r.attachments).toEqual([{ pdf: 1 }])
  })

  it('segundo drain concorrente volta vazio (as linhas estão alugadas por outro worker)', async () => {
    mockGet.mockReturnValue(mockClaim([]).db)
    const r = await drainPending('s1')
    expect(r.ids).toEqual([])
    expect(r.combinedContent).toBe('')
    expect(r.attachments).toEqual([])
    expect(r.context).toBeNull()
    expect(r.attempt).toBe(0)
  })

  it('reprocessamento: informa a tentativa (maior entre as linhas)', async () => {
    const rows = [
      { id: 'a', content: 'oi', received_at: '2026-09-14T00:26:27Z', context: {}, attempts: 2 },
      { id: 'b', content: 'tem a peça?', received_at: '2026-09-14T00:26:40Z', context: {}, attempts: 1 },
    ]
    mockGet.mockReturnValue(mockClaim(rows).db)
    const r = await drainPending('s1')
    expect(r.attempt).toBe(2)
  })

  it('anexo que já derrubou tentativas demais fica de fora (não trava a resposta pra sempre)', async () => {
    const rows = [
      { id: 'a', content: 'segue a lista', received_at: '2026-09-14T00:26:27Z', context: { attachments: [{ pdf: 'pesado' }] }, attempts: SKIP_ATTACHMENTS_FROM_ATTEMPT },
      { id: 'b', content: '', received_at: '2026-09-14T00:27:00Z', context: { attachments: [{ foto: 'nova' }] }, attempts: 1 },
    ]
    mockGet.mockReturnValue(mockClaim(rows).db)
    const r = await drainPending('s1')
    expect(r.attachments).toEqual([{ foto: 'nova' }]) // o anexo novo ainda é lido
    expect(r.skippedAttachments).toBe(1)
    expect(r.combinedContent).toBe('segue a lista') // o texto do cliente nunca se perde
  })
})

describe('completePending / releasePending / hasInFlightPending', () => {
  beforeEach(() => vi.clearAllMocks())

  function mockUpdate() {
    const calls: { update?: unknown; in?: unknown[]; eq?: unknown[] } = {}
    const chain: Record<string, unknown> = {}
    chain.update = vi.fn((v: unknown) => { calls.update = v; return chain })
    chain.in = vi.fn((...a: unknown[]) => { calls.in = a; return chain })
    chain.eq = vi.fn((...a: unknown[]) => { calls.eq = a; return chain })
    chain.then = (resolve: (v: unknown) => void) => resolve({ error: null })
    mockGet.mockReturnValue({ from: vi.fn(() => chain) })
    return calls
  }

  it('completePending: marca processed=true só nas linhas reivindicadas', async () => {
    const calls = mockUpdate()
    await completePending(['a', 'b'])
    expect(calls.update).toEqual({ processed: true })
    expect(calls.in).toEqual(['id', ['a', 'b']])
  })

  it('releasePending: devolve pra fila (limpa o aluguel) sem mexer no que já foi concluído', async () => {
    const calls = mockUpdate()
    await releasePending(['a'])
    expect(calls.update).toEqual({ claimed_at: null })
    expect(calls.in).toEqual(['id', ['a']])
    expect(calls.eq).toEqual(['processed', false])
  })

  it('sem linhas → não toca no banco', async () => {
    await completePending([])
    await releasePending([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('hasInFlightPending: true quando há linha não concluída com aluguel vigente', async () => {
    const chain: Record<string, unknown> = {}
    const gt = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.gt = gt
    chain.limit = vi.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null })
    mockGet.mockReturnValue({ from: vi.fn(() => chain) })
    expect(await hasInFlightPending('s1')).toBe(true)
    expect(gt).toHaveBeenCalledWith('claimed_at', expect.any(String))
  })
})
