export interface ChatwootCfg {
  baseUrl: string
  accountId: number
  userToken: string
}

export interface FunnelItem {
  id: number
  funnel_step_id: number
  start_in_step: number          // unix ts (segundos)
  amount: string
  status: string                 // 'active' | ...
  label_list: string[]
  contact: { identifier: string | null; phone_number: string | null; name: string | null }
  conversation: { id: number; display_id: number; inbox_id: number }
}

export interface ResolvedFunnel {
  funnelId: number
  steps: { start: number; middle: number; end: number }
}

function headers(cfg: ChatwootCfg) {
  return { 'Content-Type': 'application/json', api_access_token: cfg.userToken }
}

export async function resolveFunnel(cfg: ChatwootCfg, identifier: string): Promise<ResolvedFunnel | null> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/funnels`
  const res = await fetch(url, { headers: headers(cfg) })
  if (!res.ok) throw new Error(`funnels ${res.status}`)
  const data = await res.json()
  const funnels = data.payload ?? data
  const f = (funnels as Array<{ id: number; identifier: string; funnel_steps: Array<{ id: number; step_type: string }> }>)
    .find(x => x.identifier === identifier)
  if (!f) return null
  const byType = (t: string) => f.funnel_steps.find(s => s.step_type === t)?.id
  const start = byType('start'), middle = byType('middle'), end = byType('end')
  if (start == null || middle == null || end == null) return null
  return { funnelId: f.id, steps: { start, middle, end } }
}

export async function listFunnelItems(cfg: ChatwootCfg, funnelId: number, stepId: number): Promise<FunnelItem[]> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/funnels/${funnelId}/funnel_steps/${stepId}/funnel_items`
  const res = await fetch(url, { headers: headers(cfg) })
  if (!res.ok) throw new Error(`funnel_items ${res.status}`)
  const data = await res.json()
  return (data.payload ?? data) as FunnelItem[]
}
