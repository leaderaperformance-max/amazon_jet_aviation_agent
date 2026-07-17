/** Normaliza um número de telefone mantendo apenas dígitos. Ex.: "+55 (95) 99172-0919" → "5595991720919". */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

/**
 * Canonicaliza um número brasileiro pro padrão WhatsApp (E.164 sem "+"):
 * 55 (DDI) + DDD (2) + 9 (nono dígito do celular) + 8 dígitos = 13 dígitos.
 * Regras: garante o 55 na frente e o 9 depois do DDD se faltar. Idempotente pra
 * números já canônicos. Se não reconhecer o formato BR, devolve só os dígitos.
 */
export function toBrazilWhatsApp(raw: string | null | undefined): string {
  const digits = normalizePhone(raw)
  if (!digits) return ''
  // Tira o DDI 55 (só quando o tamanho indica DDI + número nacional).
  let local = digits
  if (local.startsWith('55') && (local.length === 12 || local.length === 13)) {
    local = local.slice(2)
  }
  // Agora `local` deve ser DDD (2) + número (8 sem o 9 / 9 com o 9).
  if (local.length === 10) {
    // DDD + 8 dígitos → celular sem o nono dígito: insere o 9 após o DDD.
    local = local.slice(0, 2) + '9' + local.slice(2)
  }
  if (local.length === 11) return '55' + local // DDD + 9 + 8 → celular completo
  return digits // formato não reconhecido: devolve os dígitos como estão
}
