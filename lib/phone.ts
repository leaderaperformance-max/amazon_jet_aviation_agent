/** Normaliza um número de telefone mantendo apenas dígitos. Ex.: "+55 (95) 99172-0919" → "5595991720919". */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}
