import { getAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

/** Retorna { name } do consultor se o número estiver cadastrado e ativo, senão null. */
export async function findReseller(rawPhone: string | null | undefined): Promise<{ name: string } | null> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return null
  const db = getAdminClient()
  const { data } = await db
    .from('resellers')
    .select('name')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle()
  return data ? { name: (data as { name: string }).name } : null
}
