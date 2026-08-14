/**
 * Trava de prazo de entrega.
 *
 * A empresa NÃO pode prometer prazo de entrega: depende de disponibilidade da peça,
 * origem, logística de importação e desembaraço. Prazo dito por alto vira frustração
 * do cliente. Quem informa o prazo real é o especialista humano, junto com a cotação.
 *
 * Caso real: a IA respondeu "10 a 20 dias" / "5 a 10 dias" (estava até escrito no prompt)
 * e o cliente fechou expectativa em cima disso.
 *
 * Aqui a garantia é determinística: se a resposta prometer prazo, o texto é trocado
 * pela mensagem padrão — independente do que o modelo tentou dizer.
 */

/** Quantidade de tempo: "10 a 20 dias", "em 15 dias", "2 semanas", "1 mês". */
const TIME_QTY = /\b\d{1,3}\s*(?:a|até|ou|-|–)\s*\d{1,3}\s*(?:dias?|semanas?|m[êe]s(?:es)?)\b|\b\d{1,3}\s*(?:dias?|semanas?|m[êe]s(?:es)?)\b/i

/** Contexto de ENTREGA (o que é proibido prometer). */
const DELIVERY_CTX = /entreg|chega(?:r|m)?\b|receber a peça|remessa|embarque|desembara|frete|transporte|importa[çc][ãa]o/i

/** Menção a prazo em geral. */
const PRAZO_CTX = /prazo|demora|leva\b|tempo de/i

/** Contexto de COTAÇÃO/pagamento — prazo de retorno da cotação e parcelas são permitidos. */
const QUOTE_CTX = /cota[çc][ãa]o|or[çc]amento|retorn|resposta|parcela|pagamento|faturament/i

/**
 * A resposta promete prazo de ENTREGA? (não confunde com prazo de retorno da cotação
 * — "cotação em até 48h úteis" — nem com parcelamento "30/60 dias").
 */
export function promisesDeliveryDeadline(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  if (!TIME_QTY.test(t)) return false
  const hasDelivery = DELIVERY_CTX.test(t)
  const hasPrazo = PRAZO_CTX.test(t)
  if (!hasDelivery && !hasPrazo) return false
  // Só fala de cotação/pagamento (sem entrega) → permitido.
  if (!hasDelivery && QUOTE_CTX.test(t)) return false
  return true
}

/** Resposta padrão, simpática, quando o cliente pede prazo. Encaminha pro humano. */
export const DEADLINE_SAFE_REPLY =
  'Sobre o prazo, prefiro não te passar uma data por cima: ela depende da disponibilidade da peça, '
  + 'da origem e da logística de importação, e eu não quero te dar uma informação que depois não se confirme. '
  + 'Já estou chamando um especialista do nosso time aqui pra te confirmar o prazo exato junto com a cotação. '
  + 'É rapidinho! 🙂'

/** Aplica a trava: devolve a mensagem segura se a resposta prometia prazo de entrega. */
export function guardDeliveryDeadline(text: string): { text: string; blocked: boolean } {
  if (promisesDeliveryDeadline(text)) {
    return { text: DEADLINE_SAFE_REPLY, blocked: true }
  }
  return { text, blocked: false }
}
