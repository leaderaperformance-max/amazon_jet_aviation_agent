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

import { POST } from '@/app/api/webhook/route'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'

const mockRunAgent = runAgent as ReturnType<typeof vi.fn>
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>
const mockLoadInbox = loadInboxByChatwootId as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const baseInbox = {
  id: 'uuid', name: 'AJ', chatwoot_base_url: 'https://x.com',
  chatwoot_account_id: 14, chatwoot_inbox_id: 45,
  chatwoot_user_token: 'tok',
  quepasa_host: 'https://qp.example.com', quepasa_token: 'qp-token',
  system_prompt: 'PROMPT', enabled: true,
}

const validPayload = {
  body: {
    id: 13,
    inbox_id: 45,
    messages: [{
      id: 1, content: 'preciso de uma peça', message_type: 0,
      sender_type: 'Contact',
      sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' },
    }],
    meta: { sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João', phone_number: '+5511999999999' } },
    event: 'automation_event.message_created',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadInbox.mockResolvedValue(baseInbox)
  mockLoadOpenAI.mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' })
})

describe('POST /api/webhook', () => {
  it('skip quando inbox não existe', async () => {
    mockLoadInbox.mockResolvedValue(null)
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip quando inbox está disabled', async () => {
    mockLoadInbox.mockResolvedValue({ ...baseInbox, enabled: false })
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip mensagens outgoing (message_type === 1)', async () => {
    const p = { ...validPayload, body: { ...validPayload.body,
      messages: [{ ...validPayload.body.messages[0], message_type: 1 }] } }
    const res = await POST(makeRequest(p))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip content vazio', async () => {
    const p = { ...validPayload, body: { ...validPayload.body,
      messages: [{ ...validPayload.body.messages[0], content: null }] } }
    const res = await POST(makeRequest(p))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip quando QuePasa não está configurado', async () => {
    mockLoadInbox.mockResolvedValue({ ...baseInbox, quepasa_host: null, quepasa_token: null })
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('processa mensagem válida e envia via QuePasa com chatId limpo', async () => {
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockLoadInbox).toHaveBeenCalledWith(45)
    expect(mockRunAgent).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      'preciso de uma peça',
      'PROMPT',
      'sk-test',
      'gpt-4o-mini'
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      { host: 'https://qp.example.com', token: 'qp-token' },
      '5511999999999',
      'Reply do JET.'
    )
  })
})
