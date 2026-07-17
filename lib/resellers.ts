import { getAdminClient } from '@/lib/supabase/admin'
import { phoneMatchCandidates } from '@/lib/phone'

/**
 * Retorna { name } do consultor se o número bater com algum cadastrado e ativo.
 * Casa as formas plausíveis do número (BR 55… e US 1…, com/sem DDI) — robusto ao
 * formato que o gateway entrega. Cadastre os revendedores na forma canônica.
 */
export async function findReseller(rawPhone: string | null | undefined): Promise<{ name: string } | null> {
  const candidates = phoneMatchCandidates(rawPhone)
  if (!candidates.length) return null
  const db = getAdminClient()
  const { data } = await db
    .from('resellers')
    .select('name')
    .in('phone', candidates)
    .eq('active', true)
    .limit(1)
  return data && data.length ? { name: (data[0] as { name: string }).name } : null
}
