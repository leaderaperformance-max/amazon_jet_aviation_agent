import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { drainPending } from '@/lib/debounce'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

// Mock do claim atômico: .update().eq().eq().select() → { data: rows }
function mockClaim(rows: unknown[]) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null })
  const eq2 = vi.fn().mockReturnValue({ select })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const update = vi.fn().mockReturnValue({ eq: eq1 })
  return { db: { from: vi.fn().mockReturnValue({ update }) }, update, select }
}

describe('drainPending (claim atômico + merge)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mescla o texto e agrega anexos de todas as linhas, ordenado por received_at', async () => {
    const rows = [
      { id: 'b', content: 'segunda', received_at: '2026-07-22T10:00:02Z', context: { attachments: [{ x: 2 }], labels: ['novo'] } },
      { id: 'a', content: 'primeira', received_at: '2026-07-22T10:00:01Z', context: { attachments: [{ x: 1 }] } },
    ]
    const { db } = mockClaim(rows)
    mockGet.mockReturnValue(db)
    const r = await drainPending('s1')
    expect(r.ids).toEqual(['a', 'b']) // ordenado por received_at
    expect(r.combinedContent).toBe('primeira\n\nsegunda')
    expect(r.attachments).toEqual([{ x: 1 }, { x: 2 }])
    expect((r.context as { labels: string[] }).labels).toEqual(['novo']) // context da ÚLTIMA
  })

  it('ignora linhas de conteúdo vazio no merge (ex.: mensagem só com anexo)', async () => {
    const rows = [
      { id: 'a', content: 'quero cotar', received_at: '2026-07-22T10:00:01Z', context: {} },
      { id: 'b', content: '', received_at: '2026-07-22T10:00:02Z', context: { attachments: [{ pdf: 1 }] } },
    ]
    mockGet.mockReturnValue(mockClaim(rows).db)
    const r = await drainPending('s1')
    expect(r.combinedContent).toBe('quero cotar')
    expect(r.attachments).toEqual([{ pdf: 1 }])
  })

  it('segundo drain concorrente volta vazio (as linhas já foram reivindicadas)', async () => {
    mockGet.mockReturnValue(mockClaim([]).db) // update...select devolve 0 linhas
    const r = await drainPending('s1')
    expect(r.ids).toEqual([])
    expect(r.combinedContent).toBe('')
    expect(r.attachments).toEqual([])
    expect(r.context).toBeNull()
  })
})
