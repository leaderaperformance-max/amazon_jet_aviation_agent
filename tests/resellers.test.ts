import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { findReseller } from '@/lib/resellers'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

function dbReturning(data: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }),
    }),
  }
}

describe('findReseller', () => {
  beforeEach(() => vi.clearAllMocks())
  it('acha consultor por número normalizado', async () => {
    mockGet.mockReturnValue(dbReturning({ name: 'Anderson' }))
    expect(await findReseller('+55 (95) 99172-0919')).toEqual({ name: 'Anderson' })
  })
  it('retorna null quando não acha', async () => {
    mockGet.mockReturnValue(dbReturning(null))
    expect(await findReseller('5511999999999')).toBeNull()
  })
  it('retorna null pra número vazio sem bater no banco', async () => {
    expect(await findReseller('')).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })
})
