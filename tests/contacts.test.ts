import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}))

import { upsertContact, getContactById, updateContactLabels } from '@/lib/contacts'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

function mockSupabaseForUpsert(existing: { message_count: number } | null, returnedRow: Record<string, unknown>) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: existing, error: null })
  const selectChain = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
    }),
  })
  const upsertChainMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: returnedRow, error: null }),
    }),
  })

  mockGetAdminClient.mockReturnValue({
    from: vi.fn().mockImplementation(() => ({
      select: selectChain,
      upsert: upsertChainMock,
    })),
  })

  return { upsertChainMock, maybeSingleMock }
}

describe('upsertContact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('faz upsert com onConflict correto, calcula status=ia quando tem atendimento_ia', async () => {
    const { upsertChainMock } = mockSupabaseForUpsert(null, {
      id: 'uuid', message_count: 1, current_labels: ['atendimento_ia'], status: 'ia',
    })

    const result = await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      name: 'João',
      phone_number: '+5511999999999',
      whatsapp_identifier: '5511999999999@s.whatsapp.net',
      current_labels: ['atendimento_ia'],
      last_message: 'olá',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    expect(upsertChainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inbox_id: 'inbox-1',
        chatwoot_conversation_id: 13,
        current_labels: ['atendimento_ia'],
        status: 'ia',
        message_count: 1,
      }),
      { onConflict: 'inbox_id,chatwoot_conversation_id' }
    )
    expect(result.contact.id).toBe('uuid')
    expect(result.wasNew).toBe(true)
  })

  it('calcula status=encerrado quando tem lead_ganho', async () => {
    const { upsertChainMock } = mockSupabaseForUpsert(null, { id: 'x', status: 'encerrado' })

    await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      current_labels: ['lead_ganho'],
      last_message: 'fechou',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    const args = upsertChainMock.mock.calls[0][0]
    expect(args.status).toBe('encerrado')
  })

  it('calcula status=humano quando atendimento_ia ausente e sem terminais', async () => {
    const { upsertChainMock } = mockSupabaseForUpsert(null, { id: 'x', status: 'humano' })

    await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      current_labels: ['novo_lead'],
      last_message: 'x',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    const args = upsertChainMock.mock.calls[0][0]
    expect(args.status).toBe('humano')
  })

  it('incrementa message_count quando contato já existe', async () => {
    const { upsertChainMock } = mockSupabaseForUpsert({ message_count: 5 }, { id: 'x', message_count: 6 })

    const result = await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      current_labels: [],
      last_message: 'x',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    expect(upsertChainMock.mock.calls[0][0].message_count).toBe(6)
    expect(result.wasNew).toBe(false)
  })
})

describe('getContactById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna o contato pelo id', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'uuid', name: 'João' }, error: null }),
          }),
        }),
      }),
    })

    const result = await getContactById('uuid')
    expect(result?.name).toBe('João')
  })

  it('retorna null se não achar', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const result = await getContactById('nope')
    expect(result).toBeNull()
  })
})

describe('updateContactLabels', () => {
  beforeEach(() => vi.clearAllMocks())

  it('atualiza labels e recalcula status', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockGetAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) })

    await updateContactLabels('uuid', ['atendimento_ia', 'novo_lead'])

    expect(updateMock).toHaveBeenCalledWith({
      current_labels: ['atendimento_ia', 'novo_lead'],
      status: 'ia',
    })
    expect(eqMock).toHaveBeenCalledWith('id', 'uuid')
  })
})
