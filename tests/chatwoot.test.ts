import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendMessage } from '@/lib/chatwoot'

describe('sendMessage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('successfully sends message with correct URL, headers, and body', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chat.leaderaperformance.com.br'
    process.env.CHATWOOT_USER_TOKEN = 'test-token-123'
    process.env.CHATWOOT_ACCOUNT_ID = '14'

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    await sendMessage(1, 'Hello from agent')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.leaderaperformance.com.br/api/v1/accounts/14/conversations/1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': 'test-token-123',
        },
        body: JSON.stringify({
          content: 'Hello from agent',
          message_type: 'outgoing',
          private: false,
        }),
      }
    )
  })

  it('does not throw on non-ok HTTP response (status 500)', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chat.leaderaperformance.com.br'
    process.env.CHATWOOT_USER_TOKEN = 'test-token-123'
    process.env.CHATWOOT_ACCOUNT_ID = '14'

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    // Should not throw
    await expect(sendMessage(2, 'Test message')).resolves.toBeUndefined()
  })

  it('does not throw on fetch network error', async () => {
    process.env.CHATWOOT_BASE_URL = 'https://chat.leaderaperformance.com.br'
    process.env.CHATWOOT_USER_TOKEN = 'test-token-123'
    process.env.CHATWOOT_ACCOUNT_ID = '14'

    fetchMock.mockRejectedValue(new Error('Network error'))

    // Should not throw
    await expect(sendMessage(3, 'Test message')).resolves.toBeUndefined()
  })
})
