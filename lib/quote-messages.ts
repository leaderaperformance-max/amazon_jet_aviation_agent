import { formatNumero } from '@/lib/solicitacoes'

export interface QuoteItem { part_number: string; quantity: string; notes?: string }

/**
 * Confirmação PADRÃO devolvida a quem enviou a cotação (consultor/revendedor).
 * Montada pelo sistema — não pelo modelo — pra a resposta nunca improvisar formato
 * nem resumir com "total de itens: N": a listagem dos PNs é obrigatória.
 */
export function buildQuoteConfirmation(input: {
  action: 'enviada' | 'atualizada'
  numero: number
  clientName: string | null
  clientPhone: string | null
  urgency: string
  items: QuoteItem[]
  resellerName?: string | null
}): string {
  const id = formatNumero(input.numero)
  const header = input.action === 'enviada'
    ? `✅ *SOLICITAÇÃO ${id} enviada ao grupo de cotação*`
    : `🔄 *ATUALIZAÇÃO DA ${id} enviada ao grupo de cotação*`
  const urgencyEmoji = input.urgency === 'AOG' ? '🔴' : '🟡'
  const itemsBlock = `📋 *ITENS (${input.items.length}):*\n`
    + input.items.map((it, i) => `${i + 1}. ${it.part_number} — Qtd: ${it.quantity}`).join('\n')
  return [
    header, '',
    `👤 *Cliente:* ${input.clientName ?? '(sem nome)'}`,
    input.clientPhone ? `📱 *WhatsApp:* ${input.clientPhone}` : null,
    `⚡ *Urgência:* ${input.urgency} ${urgencyEmoji}`, '',
    itemsBlock, '',
    'Assim que o time retornar com a cotação, aviso por aqui!',
  ].filter(Boolean).join('\n')
}

export function buildGroupMessage(input: {
  action: 'enviada' | 'atualizada'
  numero: number
  channelLabel: string
  clientName: string | null
  clientPhone: string | null
  urgency: string
  items: QuoteItem[]
  generalNotes?: string | null
  resellerName?: string | null
  sheetUrl?: string | null
  chatwootUrl: string
}): string {
  const header = input.action === 'enviada'
    ? `🆕 *SOLICITAÇÃO ${formatNumero(input.numero)}*`
    : `🔄🔄 *ATUALIZAÇÃO DA ${formatNumero(input.numero)}* 🔄🔄`
  // Deixa claríssimo que é atualização (não pedido novo) e que a lista abaixo é a COMPLETA.
  const subheader = input.action === 'atualizada'
    ? `⚠️ _Atualização da solicitação ${formatNumero(input.numero)} — NÃO é um pedido novo. Lista completa e atual abaixo (substitui a anterior)._`
    : null
  const urgencyEmoji = input.urgency === 'AOG' ? '🔴' : '🟡'
  const itemsBlock = input.items.length === 1
    ? `🔧 *Part Number:* ${input.items[0].part_number}\n🔢 *Quantidade:* ${input.items[0].quantity}${input.items[0].notes ? `\n📝 ${input.items[0].notes}` : ''}`
    : `📋 *ITENS (${input.items.length}):*\n` + input.items.map((it, i) => `  ${i + 1}. ${it.part_number} — Qtd: ${it.quantity}${it.notes ? ` (${it.notes})` : ''}`).join('\n')
  return [
    header,
    subheader, '',
    `📡 *Origem:* ${input.channelLabel}`,
    `👤 *Cliente:* ${input.clientName ?? '(sem nome)'}`,
    input.clientPhone ? `📱 *WhatsApp:* ${input.clientPhone}` : null,
    input.resellerName ? `🤝 *via consultor:* ${input.resellerName}` : null,
    `⚡ *Urgência:* ${input.urgency} ${urgencyEmoji}`, '',
    itemsBlock, '',
    input.generalNotes ? `📝 _${input.generalNotes}_` : null,
    input.sheetUrl ? `📊 *Planilha:* ${input.sheetUrl}` : null,
    '', '🔗 Atender em:', input.chatwootUrl,
  ].filter(Boolean).join('\n')
}
