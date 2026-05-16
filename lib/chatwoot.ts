export async function sendMessage(
  conversationId: number,
  content: string
): Promise<void> {
  const baseUrl = process.env.CHATWOOT_BASE_URL
  const token = process.env.CHATWOOT_USER_TOKEN
  const accountId = process.env.CHATWOOT_ACCOUNT_ID

  if (!baseUrl || !token || !accountId) {
    console.warn(
      'Chatwoot env vars missing: CHATWOOT_BASE_URL, CHATWOOT_USER_TOKEN, or CHATWOOT_ACCOUNT_ID'
    )
    return
  }

  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': token,
      },
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
    })

    if (!response.ok) {
      console.warn(
        `Chatwoot API returned non-ok status: ${response.status} ${response.statusText}`
      )
    }
  } catch (error) {
    console.warn('Failed to send message to Chatwoot:', error)
  }
}
