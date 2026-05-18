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

import { POST } from '@/app/api/webhook/route'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel } from '@/lib/tags'

const mockRunAgent = runAgent as ReturnType<typeof vi.fn>
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>
const mockLoadInbox = loadInboxByChatwootId as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>
const mockUpsertContact = upsertContact as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>
const mockAddLabel = addLabel as ReturnType<typeof vi.fn>

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

describe('POST /api/webhook', () => {
  it('upsert contact em toda mensagem', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockUpsertContact).toHaveBeenCalled()
  })

  it('salva mensagem do Contact na memória', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockSaveMessage).toHaveBeenCalledWith('5511999@s.whatsapp.net', 'user', 'oi')
  })

  it('salva mensagem do humano (User) com prefixo [atendente]:', async () => {
    mockUpsertContact.mockResolvedValue({
      contact: {
        id: 'c', inbox_id: 'i', chatwoot_conversation_id: 17,
        whatsapp_identifier: '5511999@s.whatsapp.net',
        current_labels: ['atendimento_ia'], status: 'ia', message_count: 5,
      },
      wasNew: false,
    })
    await POST(makeRequest(incomingFromHuman))
    expect(mockSaveMessage).toHaveBeenCalledWith('5511999@s.whatsapp.net', 'user', '[atendente]: oi sou humano')
  })

  it('humano (User) não dispara resposta', async () => {
    await POST(makeRequest(incomingFromHuman))
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('AgentBot é ignorado por completo', async () => {
    const p = {
      ...incomingFromContact,
      messages: [{ ...incomingFromContact.messages[0], message_type: 1, sender_type: 'AgentBot' }],
    }
    await POST(makeRequest(p))
    expect(mockSaveMessage).not.toHaveBeenCalled()
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('primeira mensagem do contato (wasNew=true) dispara resposta mesmo sem tag', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockRunAgent).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalled()
  })

  it('adiciona atendimento_ia após primeira resposta', async () => {
    mockAddLabel.mockResolvedValue(['atendimento_ia'])
    await POST(makeRequest(incomingFromContact))
    expect(mockAddLabel).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://x.com', accountId: 14 }),
      17,
      [],
      'atendimento_ia'
    )
  })

  it('Contact sem tag atendimento_ia e não é primeira → não responde', async () => {
    mockUpsertContact.mockResolvedValue({
      contact: {
        id: 'c', inbox_id: 'i', chatwoot_conversation_id: 17,
        current_labels: ['novo_lead'], status: 'humano', message_count: 3,
      },
      wasNew: false,
    })
    await POST(makeRequest(incomingFromContact))
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('Contact com tag atendimento_ia → responde', async () => {
    mockUpsertContact.mockResolvedValue({
      contact: {
        id: 'c', inbox_id: 'i', chatwoot_conversation_id: 17,
        current_labels: ['atendimento_ia'], status: 'ia', message_count: 3,
      },
      wasNew: false,
    })
    const p = {
      ...incomingFromContact,
      conversation: { labels: ['atendimento_ia'] },
    }
    await POST(makeRequest(p))
    expect(mockRunAgent).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalled()
  })
})
