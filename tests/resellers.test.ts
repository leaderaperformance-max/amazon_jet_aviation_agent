import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { findReseller } from '@/lib/resellers'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

function dbReturning(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  }
}

describe('findReseller', () => {
  beforeEach(() => vi.clearAllMocks())
  it('acha consultor por número (casa canônico ou cru)', async () => {
    mockGet.mockReturnValue(dbReturning([{ name: 'Anderson' }]))
    expect(await findReseller('+55 (95) 99172-0919')).toEqual({ name: 'Anderson' })
  })
  it('retorna null quando não acha', async () => {
    mockGet.mockReturnValue(dbReturning([]))
    expect(await findReseller('5511999999999')).toBeNull()
  })
  it('retorna null pra número vazio sem bater no banco', async () => {
    expect(await findReseller('')).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })
})
