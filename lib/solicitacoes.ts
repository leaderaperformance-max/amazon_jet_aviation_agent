import { getAdminClient } from '@/lib/supabase/admin'

export interface SolicitacaoItem {
  part_number: string
  quantity: string
  notes?: string
}

export interface Solicitacao {
  id: string
  numero: number
  client_phone: string
  client_name: string | null
  state: 'aberta' | 'enviada' | 'fechada'
  part_numbers: string[]
  items: SolicitacaoItem[]
  lead_ids: string[]
  via_reseller: boolean
  reseller_name: string | null
  reseller_phone: string | null
  origin_session_id: string
  sent_to_group_at: string | null
  opened_at: string
  updated_at: string
  closed_at: string | null
}

/**
 * Junta a lista existente com os items novos, deduplicando por Part Number
 * (case-insensitive + trim). Item novo com o mesmo PN SUBSTITUI o antigo
 * (quantidade/notes mais recentes vencem). Preserva a ordem: existentes primeiro.
 */
export function mergeItems(existing: SolicitacaoItem[], incoming: SolicitacaoItem[]): SolicitacaoItem[] {
  const norm = (p: string) => p.trim().toUpperCase()
  const byPn = new Map<string, SolicitacaoItem>()
  for (const it of existing) byPn.set(norm(it.part_number), it)
  for (const it of incoming) byPn.set(norm(it.part_number), it)
  return Array.from(byPn.values())
}

/** Separa items novos (PN inédito na solicitação) dos repetidos. Case-insensitive + trim. */
export function splitItemsByQuote<T extends { part_number: string }>(
  items: T[], existingPNs: string[],
): { novos: T[]; repetidos: T[] } {
  const norm = (p: string) => p.trim().toUpperCase()
  const set = new Set(existingPNs.map(norm))
  const novos: T[] = []
  const repetidos: T[] = []
  for (const it of items) (set.has(norm(it.part_number)) ? repetidos : novos).push(it)
  return { novos, repetidos }
}

/** Formata o número da solicitação: #0001 (4 dígitos, cresce pra 5 depois de 9999). */
export function formatNumero(numero: number): string {
  return `#${String(numero).padStart(4, '0')}`
}

export type DispatchAction = 'enviada' | 'atualizada' | 'possivel_duplicata'

/** Decide o que fazer com a solicitação dado o lote de items. Pura. */
export function decideDispatch<T extends { part_number: string }>(
  sol: { sent_to_group_at: string | null; part_numbers: string[] },
  items: T[],
): { action: DispatchAction; novos: T[] } {
  const { novos } = splitItemsByQuote(items, sol.part_numbers)
  if (!sol.sent_to_group_at) return { action: 'enviada', novos: items } // 1ª vez: tudo conta
  if (novos.length > 0) return { action: 'atualizada', novos }
  return { action: 'possivel_duplicata', novos: [] }
}

const IDLE_MS = () => parseInt(process.env.QUOTE_IDLE_HOURS ?? '48', 10) * 3600 * 1000

export async function getOpenSolicitacao(clientPhone: string, nowMs: number = Date.now()): Promise<Solicitacao | null> {
  const db = getAdminClient()
  const { data } = await db.from('solicitacoes')
    .select('*').eq('client_phone', clientPhone).is('closed_at', null)
    .order('opened_at', { ascending: false }).limit(1).maybeSingle()
  const s = data as Solicitacao | null
  if (!s) return null
  if (nowMs - new Date(s.updated_at).getTime() > IDLE_MS()) {
    await closeSolicitacao(s.id)
    return null
  }
  return s
}

export interface OpenSolicitacaoInput {
  clientPhone: string
  clientName?: string | null
  originSessionId: string
  viaReseller?: boolean
  resellerName?: string | null
  resellerPhone?: string | null
}

export async function openSolicitacao(input: OpenSolicitacaoInput): Promise<Solicitacao> {
  const db = getAdminClient()
  const { data, error } = await db.from('solicitacoes').insert({
    client_phone: input.clientPhone,
    client_name: input.clientName ?? null,
    origin_session_id: input.originSessionId,
    via_reseller: input.viaReseller ?? false,
    reseller_name: input.resellerName ?? null,
    reseller_phone: input.resellerPhone ?? null,
  }).select().single()
  if (error) throw error
  return data as Solicitacao
}

/**
 * Grava a lista COMPLETA e atual de items na solicitação (já mesclada via mergeItems)
 * e acumula os lead_ids. `part_numbers` é derivada dos items (fonte de verdade = items).
 */
export async function addToSolicitacao(id: string, items: SolicitacaoItem[], leadIds: string[]): Promise<void> {
  const db = getAdminClient()
  const { data } = await db.from('solicitacoes').select('lead_ids').eq('id', id).maybeSingle()
  const cur = data as { lead_ids: string[] } | null
  const lead_ids = Array.from(new Set([...(cur?.lead_ids ?? []), ...leadIds]))
  const part_numbers = items.map(i => i.part_number)
  await db.from('solicitacoes')
    .update({ items, part_numbers, lead_ids, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function markSent(id: string): Promise<void> {
  await getAdminClient().from('solicitacoes').update({
    state: 'enviada', sent_to_group_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function closeSolicitacao(id: string): Promise<void> {
  await getAdminClient().from('solicitacoes')
    .update({ state: 'fechada', closed_at: new Date().toISOString() }).eq('id', id)
}
