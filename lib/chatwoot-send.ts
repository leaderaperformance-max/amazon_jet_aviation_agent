/**
 * Send a reply back through Chatwoot itself (for channels that don't use
 * an external gateway like QuePasa). Works for the Website widget, Email,
 * API channel, etc.
 */

interface ChatwootCfg {
  baseUrl: string
  accountId: number
  userToken: string
}

export async function sendChatwootReply(
  cfg: ChatwootCfg,
  conversationId: number,
  message: string,
): Promise<void> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/conversations/${conversationId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': cfg.userToken,
    },
    body: JSON.stringify({
      content: message,
      message_type: 'outgoing',
      private: false,
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`chatwoot send ${res.status}: ${err.slice(0, 200)}`)
  }
}
