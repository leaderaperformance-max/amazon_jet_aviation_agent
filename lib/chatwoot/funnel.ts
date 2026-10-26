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
  /** Primeira etapa de cada tipo — compatibilidade. Prefira `stepsByType`. */
  steps: { start: number; middle: number; end: number }
  /**
   * TODAS as etapas de cada tipo, na ordem do funil. O kanban do Amazon Jet tem DUAS
   * etapas 'middle' (39 e 36) e a versão antiga só pegava a primeira — 23 cards nunca
   * entrariam no follow-up.
   */
  stepsByType: { start: number[]; middle: number[]; end: number[] }
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
  const allByType = (t: string) => f.funnel_steps.filter(s => s.step_type === t).map(s => s.id)
  const start = allByType('start'), middle = allByType('middle'), end = allByType('end')
  if (!start.length || !middle.length || !end.length) return null
  return {
    funnelId: f.id,
    steps: { start: start[0], middle: middle[0], end: end[0] },
    stepsByType: { start, middle, end },
  }
}

export async function listFunnelItems(cfg: ChatwootCfg, funnelId: number, stepId: number): Promise<FunnelItem[]> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/funnels/${funnelId}/funnel_steps/${stepId}/funnel_items`
  const res = await fetch(url, { headers: headers(cfg) })
  if (!res.ok) throw new Error(`funnel_items ${res.status}`)
  const data = await res.json()
  return (data.payload ?? data) as FunnelItem[]
}
