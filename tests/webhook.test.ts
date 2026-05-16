import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhook/route'

vi.mock('@/lib/agent', () => ({
  runAgent: vi.fn().mockResolvedValue('Resposta do JET.'),
}))

vi.mock('@/lib/chatwoot', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validPayload = {
  body: {
    id: 13,
    messages: [{
      id: 1,
      content: 'preciso de uma peça',
      message_type: 0,
      sender_type: 'Contact',
      sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' },
    }],
    meta: {
      sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' },
    },
    event: 'automation_event.message_created',
  },
}

describe('POST /api/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should skip outgoing messages (message_type === 1) and not call runAgent or sendMessage', async () => {
    const { runAgent } = await import('@/lib/agent')
    const { sendMessage } = await import('@/lib/chatwoot')

    const payload = {
      body: {
        ...validPayload.body,
        messages: [{
          ...validPayload.body.messages[0],
          message_type: 1,
        }],
      },
    }

    const req = makeRequest(payload)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(runAgent).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('should skip messages with null content and not call runAgent', async () => {
    const { runAgent } = await import('@/lib/agent')

    const payload = {
      body: {
        ...validPayload.body,
        messages: [{
          ...validPayload.body.messages[0],
          content: null,
        }],
      },
    }

    const req = makeRequest(payload)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(runAgent).not.toHaveBeenCalled()
  })

  it('should process valid message and call runAgent and sendMessage with correct args', async () => {
    const { runAgent } = await import('@/lib/agent')
    const { sendMessage } = await import('@/lib/chatwoot')

    const req = makeRequest(validPayload)
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(runAgent).toHaveBeenCalledWith('5511999999999@s.whatsapp.net', 'preciso de uma peça')
    expect(sendMessage).toHaveBeenCalledWith(13, 'Resposta do JET.')
  })
})
