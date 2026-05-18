interface ChatwootCfg {
  baseUrl: string
  accountId: number
  userToken: string
}

export async function syncLabels(
  cfg: ChatwootCfg,
  conversationId: number,
  labels: string[]
): Promise<void> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/conversations/${conversationId}/labels`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': cfg.userToken,
      },
      body: JSON.stringify({ labels }),
    })
    if (!response.ok) {
      console.warn(`[tags] syncLabels failed: ${response.status}`)
    }
  } catch (err) {
    console.warn('[tags] syncLabels error:', err)
  }
}

export async function addLabel(
  cfg: ChatwootCfg,
  conversationId: number,
  currentLabels: string[],
  label: string
): Promise<string[]> {
  if (currentLabels.includes(label)) return currentLabels
  const next = [...currentLabels, label]
  await syncLabels(cfg, conversationId, next)
  return next
}

export async function removeLabel(
  cfg: ChatwootCfg,
  conversationId: number,
  currentLabels: string[],
  label: string
): Promise<string[]> {
  if (!currentLabels.includes(label)) return currentLabels
  const next = currentLabels.filter(l => l !== label)
  await syncLabels(cfg, conversationId, next)
  return next
}
