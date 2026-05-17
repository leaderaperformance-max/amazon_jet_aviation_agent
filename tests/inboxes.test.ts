import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}))

import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

describe('loadInboxByChatwootId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna inbox quando achada e enabled', async () => {
    const inbox = {
      id: 'abc', name: 'Amazon Jet', chatwoot_base_url: 'https://x.com',
      chatwoot_account_id: 14, chatwoot_inbox_id: 45,
      chatwoot_user_token: 'tok', system_prompt: 'prompt', enabled: true,
    }
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: inbox, error: null }),
          }),
        }),
      }),
    })

    const result = await loadInboxByChatwootId(45)
    expect(result).toEqual(inbox)
  })

  it('retorna null quando inbox não existe', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const result = await loadInboxByChatwootId(999)
    expect(result).toBeNull()
  })
})

describe('loadOpenAIConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna apiKey e model do app_settings', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { openai_api_key: 'sk-xxx', openai_model: 'gpt-4o-mini' },
              error: null,
            }),
          }),
        }),
      }),
    })

    const result = await loadOpenAIConfig()
    expect(result).toEqual({ apiKey: 'sk-xxx', model: 'gpt-4o-mini' })
  })

  it('lança erro se openai_api_key estiver vazia', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { openai_api_key: null, openai_model: 'gpt-4o-mini' },
              error: null,
            }),
          }),
        }),
      }),
    })

    await expect(loadOpenAIConfig()).rejects.toThrow('OpenAI API key não configurada')
  })
})
