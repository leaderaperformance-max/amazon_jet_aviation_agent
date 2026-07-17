interface ChatwootCfg { baseUrl: string; accountId: number; userToken: string }

function api(cfg: ChatwootCfg, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'api_access_token': cfg.userToken, ...(init?.headers ?? {}) },
  })
}

/** Procura um contato já existente pelo número (evita o 422 de identifier duplicado). */
async function findExistingContactId(cfg: ChatwootCfg, phone: string): Promise<number | null> {
  try {
    const res = await api(cfg, `/contacts/search?q=${encodeURIComponent(phone)}`)
    if (!res.ok) return null
    const json = await res.json().catch(() => ({} as Record<string, unknown>))
    const payload = (json as { payload?: Array<{ id?: number }> }).payload
    const id = Array.isArray(payload) && payload.length ? payload[0].id : undefined
    return typeof id === 'number' ? id : null
  } catch {
    return null
  }
}

/** Cria (ou reusa) contato + conversa no inbox WhatsApp pro número do cliente. */
export async function ensureClientConversation(
  cfg: ChatwootCfg, input: { phone: string; name: string; inboxId: number },
): Promise<{ contactId: number; conversationId: number }> {
  // 1. Reusa contato existente; senão cria (checando res.ok e o contato dentro de um 422).
  let contactId = await findExistingContactId(cfg, input.phone)
  if (!contactId) {
    const cRes = await api(cfg, '/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: input.name, phone_number: `+${input.phone}`, identifier: input.phone }),
    })
    const cJson = await cRes.json().catch(() => ({} as Record<string, unknown>))
    contactId = (cJson as { payload?: { contact?: { id?: number } } })?.payload?.contact?.id
      ?? (cJson as { contact?: { id?: number } })?.contact?.id // Chatwoot devolve o existente no 422
      ?? (cJson as { id?: number })?.id
      ?? null
    if (!contactId) throw new Error(`chatwoot contact create ${cRes.status}`)
  }

  // 2. Cria a conversa no inbox WhatsApp.
  const vRes = await api(cfg, '/conversations', {
    method: 'POST',
    body: JSON.stringify({ inbox_id: input.inboxId, contact_id: contactId, source_id: input.phone }),
  })
  const vJson = await vRes.json().catch(() => ({} as Record<string, unknown>))
  const conversationId = (vJson as { id?: number })?.id
    ?? (vJson as { payload?: { id?: number } })?.payload?.id
  if (!conversationId) throw new Error(`chatwoot conversation create ${vRes.status}`)

  return { contactId, conversationId }
}
