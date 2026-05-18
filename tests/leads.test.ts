import { describe, it, expect, vi, beforeEach } from 'vitest'

let insertResult: { data: unknown; error: unknown } = { data: null, error: null }
let updateResult: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'leads') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve(insertResult)),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve(updateResult)),
          })),
        }
      }
      return {}
    }),
  })),
}))

import { createLead, updateLeadStatus } from '@/lib/leads'

beforeEach(() => {
  vi.clearAllMocks()
  insertResult = { data: null, error: null }
  updateResult = { data: null, error: null }
})

describe('createLead', () => {
  it('returns the created lead', async () => {
    const mockLead = {
      id: 'lead-uuid-1',
      contact_id: 'contact-uuid',
      part_number: 'MS21266-2N',
      quantity: '2',
      urgency: 'AOG',
      customer_name: 'João Silva',
      customer_phone: '+5511999990000',
      notes: 'Aeronave Cessna 172',
      sent_to_seller_at: '2026-05-18T10:00:00Z',
      status: 'pendente',
    }
    insertResult = { data: mockLead, error: null }

    const result = await createLead({
      contact_id: 'contact-uuid',
      part_number: 'MS21266-2N',
      quantity: '2',
      urgency: 'AOG',
      customer_name: 'João Silva',
      customer_phone: '+5511999990000',
      notes: 'Aeronave Cessna 172',
    })

    expect(result.id).toBe('lead-uuid-1')
    expect(result.part_number).toBe('MS21266-2N')
    expect(result.status).toBe('pendente')
    expect(result.urgency).toBe('AOG')
  })

  it('creates lead with null optional fields', async () => {
    const mockLead = {
      id: 'lead-uuid-2',
      contact_id: 'contact-uuid',
      part_number: 'AN960-416',
      quantity: '10',
      urgency: 'rotina',
      customer_name: null,
      customer_phone: null,
      notes: null,
      sent_to_seller_at: '2026-05-18T10:00:00Z',
      status: 'pendente',
    }
    insertResult = { data: mockLead, error: null }

    const result = await createLead({
      contact_id: 'contact-uuid',
      part_number: 'AN960-416',
      quantity: '10',
      urgency: 'rotina',
    })

    expect(result.id).toBe('lead-uuid-2')
    expect(result.customer_name).toBeNull()
    expect(result.notes).toBeNull()
  })

  it('throws when supabase returns error', async () => {
    insertResult = { data: null, error: { message: 'DB error' } }

    await expect(
      createLead({
        contact_id: 'c',
        part_number: 'PN',
        quantity: '1',
        urgency: 'rotina',
      })
    ).rejects.toBeTruthy()
  })
})

describe('updateLeadStatus', () => {
  it('updates lead status without throwing', async () => {
    updateResult = { data: null, error: null }

    await expect(
      updateLeadStatus('lead-uuid-1', 'em_atendimento')
    ).resolves.toBeUndefined()
  })

  it('updates to fechado_ganho', async () => {
    updateResult = { data: null, error: null }

    await expect(
      updateLeadStatus('lead-uuid-1', 'fechado_ganho')
    ).resolves.toBeUndefined()
  })

  it('throws when supabase returns error', async () => {
    updateResult = { data: null, error: { message: 'update failed' } }

    await expect(
      updateLeadStatus('lead-uuid-1', 'fechado_perdido')
    ).rejects.toBeTruthy()
  })
})
