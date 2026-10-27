/**
 * Confirmações de entrega da ponte QuePasa chegam ao Chatwoot como se fossem
 * MENSAGEM DO CLIENTE: `source_id: "deliveryreceipt"` e, no corpo, o id da
 * mensagem que ACABAMOS de enviar (ex.: "3EB0AA73505440D4AFFC02").
 *
 * Sem filtro vira loop infinito: a IA responde → o WhatsApp confirma a entrega →
 * a confirmação volta como mensagem nova → a IA responde de novo. Em 27/10/2026
 * três conversas ficaram ~25 min nesse ciclo, e a IA ainda tratava o id como
 * Part Number ("Recebi o Part Number 3EB0...").
 */

interface ReceiptShaped {
  source_id?: string | null
  content?: string | null
  content_attributes?: { items?: { quepasa?: { msgid?: string | null } } } | null
}

/** Id de mensagem do WhatsApp: hex maiúsculo, longo e SEM separador. */
const WHATSAPP_MSG_ID = /^[0-9A-F]{18,32}$/

/**
 * Part Number de verdade é curto e quase sempre tem separador ou letra fora de
 * A-F ("MS21266-2N", "010-01057-00", "3244809-8"). Um bloco de 18+ caracteres
 * só com 0-9A-F e nenhum separador é id do WhatsApp, não peça.
 */
export function looksLikeWhatsAppMessageId(text: string | null | undefined): boolean {
  return WHATSAPP_MSG_ID.test((text ?? '').trim())
}

/** A mensagem é uma confirmação de entrega/leitura da ponte, não fala do cliente. */
export function isQuepasaReceipt(msg: ReceiptShaped | null | undefined): boolean {
  if (!msg) return false
  const marks = [msg.source_id, msg.content_attributes?.items?.quepasa?.msgid]
  if (marks.some(m => typeof m === 'string' && /receipt/i.test(m))) return true
  // Rede de segurança: variante de recibo sem a marca, só com o id no corpo.
  return looksLikeWhatsAppMessageId(msg.content)
}
