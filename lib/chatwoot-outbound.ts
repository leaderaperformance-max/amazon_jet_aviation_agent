interface ChatwootCfg { baseUrl: string; accountId: number; userToken: string }

function post(cfg: ChatwootCfg, path: string, body: unknown): Promise<Response> {
  return fetch(`${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api_access_token': cfg.userToken },
    body: JSON.stringify(body),
  })
}

/** Cria (ou reusa) contato + conversa no inbox WhatsApp pro número do cliente. */
export async function ensureClientConversation(
  cfg: ChatwootCfg, input: { phone: string; name: string; inboxId: number },
): Promise<{ contactId: number; conversationId: number }> {
  const cRes = await post(cfg, '/contacts', {
    name: input.name, phone_number: `+${input.phone}`, identifier: input.phone,
  })
  const cJson = await cRes.json().catch(() => ({} as Record<string, unknown>))
  const contactId = (cJson as { payload?: { contact?: { id?: number } }; id?: number })?.payload?.contact?.id
    ?? (cJson as { id?: number })?.id
  if (!contactId) throw new Error(`chatwoot contact ${cRes.status}`)

  const vRes = await post(cfg, '/conversations', {
    inbox_id: input.inboxId, contact_id: contactId, source_id: input.phone,
  })
  const vJson = await vRes.json().catch(() => ({} as Record<string, unknown>))
  const conversationId = (vJson as { id?: number })?.id
    ?? (vJson as { payload?: { id?: number } })?.payload?.id
  if (!conversationId) throw new Error(`chatwoot conversation ${vRes.status}`)

  return { contactId, conversationId }
}
