import { getAdminClient } from '@/lib/supabase/admin'
import { normalizePhone, toBrazilWhatsApp } from '@/lib/phone'

/**
 * Retorna { name } do consultor se o número bater com algum cadastrado e ativo.
 * Casa tanto a forma canônica (55 + DDD + 9) quanto os dígitos crus — robusto ao
 * formato que o gateway entrega (com ou sem DDI). Cadastre os revendedores na forma canônica.
 */
export async function findReseller(rawPhone: string | null | undefined): Promise<{ name: string } | null> {
  const candidates = Array.from(new Set([normalizePhone(rawPhone), toBrazilWhatsApp(rawPhone)].filter(Boolean)))
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
