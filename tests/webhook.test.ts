import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/agent', () => ({
  runAgent: vi.fn().mockResolvedValue('Reply do JET.'),
}))
vi.mock('@/lib/quepasa', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/inboxes', () => ({
  loadInboxByChatwootId: vi.fn(),
  loadOpenAIConfig: vi.fn(),
}))
vi.mock('@/lib/contacts', () => ({
  upsertContact: vi.fn(),
  updateContactLabels: vi.fn(),
}))
vi.mock('@/lib/memory', () => ({
  loadHistory: vi.fn().mockResolvedValue([]),
  saveMessage: vi.fn(),
}))
vi.mock('@/lib/tags', () => ({
  addLabel: vi.fn(),
  removeLabel: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  })),
}))
vi.mock('@/lib/media/process', () => ({
  processAttachment: vi.fn(),
}))
vi.mock('@/lib/part-number', () => ({
  validatePartNumber: vi.fn(),
  extractPartNumbersFromText: vi.fn().mockResolvedValue([]),
}))
// Track inserted content + context so the fallback can return them
let lastInsertedContent = 'oi'
let lastInsertedContext: unknown = null
vi.mock('@/lib/debounce', () => ({
  insertPending: vi.fn().mockImplementation(async (_s: string, content: string, _id: number, ctx: unknown) => {
    lastInsertedContent = content
    lastInsertedContext = ctx
    return { id: 'p1', received_at: '2026-05-18T00:00:00Z' }
  }),
  hasNewerPending: vi.fn().mockResolvedValue(false),
  drainPending: vi.fn().mockImplementation(async () => ({ ids: ['p1'], combinedContent: lastInsertedContent, context: lastInsertedContext, attachments: [] })),
}))
vi.mock('@/lib/leads', () => ({
  createLead: vi.fn().mockResolvedValue({ id: 'lead-1' }),
}))
// QStash off in tests → webhook usa o fallback (processa inline via processIncomingMessage)
vi.mock('@/lib/qstash', () => ({
  isQStashEnabled: vi.fn(() => false),
  scheduleDrain: vi.fn(),
}))
// O pipeline pesado foi extraído pra process-incoming; mockamos pra testar só o roteamento do webhook
vi.mock('@/lib/process-incoming', () => ({
  processIncomingMessage: vi.fn().mockResolvedValue(undefined),
  drainAndBuildContent: vi.fn().mockImplementation(async () => ({
    content: lastInsertedContent, context: lastInsertedContext, count: 1,
  })),
}))

import { POST } from '@/app/api/webhook/route'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel } from '@/lib/tags'
import { processIncomingMessage, drainAndBuildContent } from '@/lib/process-incoming'
import { insertPending } from '@/lib/debounce'

const mockRunAgent = runAgent as ReturnType<typeof vi.fn>
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>
const mockLoadInbox = loadInboxByChatwootId as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>
const mockUpsertContact = upsertContact as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>
const mockAddLabel = addLabel as ReturnType<typeof vi.fn>
const mockProcessIncoming = processIncomingMessage as ReturnType<typeof vi.fn>
const mockDrainBuild = drainAndBuildContent as ReturnType<typeof vi.fn>

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const baseInbox = {
  id: 'inbox-uuid', name: 'AJ', chatwoot_base_url: 'https://x.com',
  chatwoot_account_id: 14, chatwoot_inbox_id: 45,
  chatwoot_user_token: 'tok',
  quepasa_host: 'https://qp.example.com', quepasa_token: 'qp-token',
  system_prompt: 'PROMPT', enabled: true,
}

const incomingFromContact = {
  inbox_id: 45,
  id: 17,
  conversation: { labels: [] },
  messages: [{
    id: 1, content: 'oi', message_type: 0,
    conversation_id: 17,
    sender_type: 'Contact',
    sender: { id: 5, identifier: '5511999@s.whatsapp.net', phone_number: '+5511999', name: 'João' },
  }],
}

const incomingFromHuman = {
  inbox_id: 45,
  id: 17,
  conversation: { labels: ['atendimento_ia'] },
  messages: [{
    id: 2, content: 'oi sou humano', message_type: 1,
    conversation_id: 17,
    sender_type: 'User',
    sender: { id: 2, name: 'Atendente', identifier: '5511999@s.whatsapp.net', phone_number: '+5511999' },
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadInbox.mockResolvedValue(baseInbox)
  mockLoadOpenAI.mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' })
  mockUpsertContact.mockResolvedValue({
    contact: {
      id: 'contact-uuid', inbox_id: 'inbox-uuid', chatwoot_conversation_id: 17,
      current_labels: [], status: 'humano', message_count: 1,
    },
    wasNew: true,
  })
})

describe('POST /api/webhook (roteamento — fila QStash)', () => {
  it('Contact: enfileira (insertPending) e processa via processIncomingMessage', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockProcessIncoming).toHaveBeenCalled()
    // 3o arg é o conteúdo (texto do cliente)
    expect(mockProcessIncoming.mock.calls[0][2]).toBe('oi')
  })

  it('humano (User) salva na memória com [atendente]: e NÃO processa', async () => {
    await POST(makeRequest(incomingFromHuman))
    expect(mockSaveMessage).toHaveBeenCalledWith('5511999@s.whatsapp.net', 'user', '[atendente]: oi sou humano')
    expect(mockProcessIncoming).not.toHaveBeenCalled()
  })

  it('AgentBot é ignorado por completo', async () => {
    const p = {
      ...incomingFromContact,
      messages: [{ ...incomingFromContact.messages[0], message_type: 1, sender_type: 'AgentBot' }],
    }
    await POST(makeRequest(p))
    expect(mockSaveMessage).not.toHaveBeenCalled()
    expect(mockProcessIncoming).not.toHaveBeenCalled()
  })

  it('mensagem de GRUPO (@g.us) é ignorada — bot não responde em grupo', async () => {
    const p = {
      ...incomingFromContact,
      messages: [{
        ...incomingFromContact.messages[0],
        sender: { id: 5, identifier: '120363@g.us', phone_number: '', name: 'Grupo' },
      }],
      meta: { sender: { identifier: '120363@g.us' } },
    }
    await POST(makeRequest(p))
    expect(mockProcessIncoming).not.toHaveBeenCalled()
  })

  it('Contact: anexo vai no contexto (ctx.attachments) pro worker extrair depois', async () => {
    const payload = {
      ...incomingFromContact,
      messages: [{
        ...incomingFromContact.messages[0],
        content: null,
        attachments: [{ data_url: 'https://chat.example.com/a.pdf', content_type: 'application/pdf', file_type: 'file' }],
      }],
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    // insertPending recebe o ctx com os anexos (4o arg)
    const insertCtx = (insertPending as ReturnType<typeof vi.fn>).mock.calls[0][3] as { attachments?: unknown[] }
    expect(insertCtx.attachments).toHaveLength(1)
  })

  it('sem texto e sem anexo → ignora', async () => {
    const payload = {
      ...incomingFromContact,
      messages: [{ ...incomingFromContact.messages[0], content: '', attachments: [] }],
    }
    await POST(makeRequest(payload))
    expect(mockProcessIncoming).not.toHaveBeenCalled()
  })
})
