import { getAdminClient } from '@/lib/supabase/admin'
import { toBrazilWhatsApp } from '@/lib/phone'

/**
 * Retorna { name } do consultor se o número estiver cadastrado e ativo, senão null.
 * Usa o número canonicalizado (55 + DDD + 9) — cadastre os revendedores nesse formato.
 */
export async function findReseller(rawPhone: string | null | undefined): Promise<{ name: string } | null> {
  const phone = toBrazilWhatsApp(rawPhone)
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
