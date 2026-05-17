import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendMessage } from '@/lib/chatwoot'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendMessage', () => {
  it('faz POST com URL, headers e body corretos a partir do config', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    await sendMessage(
      { baseUrl: 'https://chat.example.com', accountId: 14, userToken: 'tok-123' },
      42,
      'Olá!'
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/api/v1/accounts/14/conversations/42/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': 'tok-123',
        },
        body: JSON.stringify({
          content: 'Olá!',
          message_type: 'outgoing',
          private: false,
        }),
      }
    )
  })

  it('não lança erro quando fetch retorna não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await expect(
      sendMessage({ baseUrl: 'https://x.com', accountId: 1, userToken: 't' }, 1, 'oi')
    ).resolves.toBeUndefined()
  })

  it('não lança erro quando fetch dá throw', async () => {
    fetchMock.mockRejectedValue(new Error('net err'))
    await expect(
      sendMessage({ baseUrl: 'https://x.com', accountId: 1, userToken: 't' }, 1, 'oi')
    ).resolves.toBeUndefined()
  })
})
