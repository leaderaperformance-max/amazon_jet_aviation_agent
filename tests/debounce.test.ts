import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockIn = vi.fn()
const mockEq = vi.fn()
const mockGt = vi.fn()
const mockLimit = vi.fn()
const mockOrder = vi.fn()
const mockRpc = vi.fn()

// We'll hold mutable state so tests can configure per-test
let insertResult: { data: unknown; error: unknown } = { data: null, error: null }
let selectResult: { data: unknown; error: unknown } = { data: null, error: null }
let updateResult: { data: unknown; error: unknown } = { data: null, error: null }
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'pending_messages') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(insertResult)),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gt: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve(selectResult)),
                })),
                order: vi.fn(() => Promise.resolve(selectResult)),
              })),
            })),
          })),
          update: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve(updateResult)),
          })),
        }
      }
      return {}
    }),
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
  })),
}))

import { insertPending, hasNewerPending, drainPending } from '@/lib/debounce'

beforeEach(() => {
  vi.clearAllMocks()
  insertResult = { data: null, error: null }
  selectResult = { data: null, error: null }
  updateResult = { data: null, error: null }
  rpcResult = { data: null, error: null }
})

describe('insertPending', () => {
  it('returns inserted id and received_at', async () => {
    insertResult = {
      data: { id: 'uuid-1', received_at: '2026-05-18T10:00:00Z' },
      error: null,
    }

    const result = await insertPending('session-abc', 'hello world', 42)
    expect(result.id).toBe('uuid-1')
    expect(result.received_at).toBe('2026-05-18T10:00:00Z')
  })

  it('throws when supabase returns error', async () => {
    insertResult = { data: null, error: { message: 'DB error' } }

    await expect(insertPending('session-abc', 'hello')).rejects.toBeTruthy()
  })
})

describe('hasNewerPending', () => {
  it('returns true when newer row exists', async () => {
    selectResult = { data: [{ id: 'uuid-2' }], error: null }

    const result = await hasNewerPending('session-abc', '2026-05-18T10:00:00Z')
    expect(result).toBe(true)
  })

  it('returns false when no newer row exists', async () => {
    selectResult = { data: [], error: null }

    const result = await hasNewerPending('session-abc', '2026-05-18T10:00:00Z')
    expect(result).toBe(false)
  })

  it('returns false when data is null', async () => {
    selectResult = { data: null, error: null }

    const result = await hasNewerPending('session-abc', '2026-05-18T10:00:00Z')
    expect(result).toBe(false)
  })
})

describe('drainPending', () => {
  it('combines multiple pending messages with \\n\\n separator', async () => {
    // RPC fails so fallback path is used
    rpcResult = { data: null, error: { message: 'rpc not found' } }
    selectResult = {
      data: [
        { id: 'id-1', content: 'first message', received_at: '2026-05-18T10:00:00Z' },
        { id: 'id-2', content: 'second message', received_at: '2026-05-18T10:00:05Z' },
      ],
      error: null,
    }
    updateResult = { data: null, error: null }

    const result = await drainPending('session-abc')
    expect(result.ids).toEqual(['id-1', 'id-2'])
    expect(result.combinedContent).toBe('first message\n\nsecond message')
  })

  it('returns empty combinedContent when no pending messages', async () => {
    rpcResult = { data: null, error: { message: 'rpc not found' } }
    selectResult = { data: [], error: null }
    updateResult = { data: null, error: null }

    const result = await drainPending('session-abc')
    expect(result.ids).toEqual([])
    expect(result.combinedContent).toBe('')
  })

  it('uses RPC result when RPC succeeds', async () => {
    rpcResult = {
      data: [
        { id: 'r1', content: 'msg a', received_at: '2026-05-18T10:00:00Z' },
        { id: 'r2', content: 'msg b', received_at: '2026-05-18T10:00:02Z' },
      ],
      error: null,
    }

    const result = await drainPending('session-abc')
    expect(result.combinedContent).toBe('msg a\n\nmsg b')
    expect(result.ids).toEqual(['r1', 'r2'])
  })
})
