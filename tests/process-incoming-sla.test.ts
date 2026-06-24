import { describe, it, expect, vi, beforeEach } from 'vitest'

const { scheduleSla } = vi.hoisted(() => ({
  scheduleSla: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/qstash', () => ({ isQStashEnabled: vi.fn(() => true), scheduleSlaTakeover: scheduleSla, scheduleDrain: vi.fn() }))
vi.mock('@/lib/contacts', () => ({
  upsertContact: vi.fn().mockResolvedValue({ contact: { id: 'c1', current_labels: [] }, wasNew: false }),
  updateContactLabels: vi.fn(),
}))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]), saveMessage: vi.fn() }))
vi.mock('@/lib/agent', () => ({ runAgent: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))

import { processIncomingMessage } from '@/lib/process-incoming'

beforeEach(() => vi.clearAllMocks())

it('handoff (sem atendimento_ia, não novo) → agenda SLA takeover e NÃO responde', async () => {
  const inbox = { id: 'ix', system_prompt: 'P', quepasa_host: 'h', quepasa_token: 't', chatwoot_base_url: 'b', chatwoot_account_id: 14, chatwoot_user_token: 'tk' }
  const ctx = { chatwootInboxId: 45, conversationId: 100, sessionId: 's@x', senderName: null, senderPhone: null, senderIdent: 's@x', chatId: '55', chatwootContactId: 1, labels: [] }
  await processIncomingMessage(inbox as never, ctx as never, 'oi tem essa peça?')
  expect(scheduleSla).toHaveBeenCalledWith('s@x', expect.any(String), 900, { conversationId: 100, chatwootInboxId: 45 })
})
