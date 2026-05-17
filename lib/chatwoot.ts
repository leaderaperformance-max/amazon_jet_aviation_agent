import type { ChatwootApiConfig } from '@/lib/types'

export async function sendMessage(
  config: ChatwootApiConfig,
  conversationId: number,
  content: string
): Promise<void> {
  const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': config.userToken,
      },
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
    })
    if (!response.ok) {
      console.warn(`Chatwoot sendMessage failed: ${response.status}`)
    }
  } catch (err) {
    console.warn('Chatwoot sendMessage error:', err)
  }
}
