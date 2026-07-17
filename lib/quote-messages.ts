import { formatNumero } from '@/lib/solicitacoes'

export interface QuoteItem { part_number: string; quantity: string; notes?: string }

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
    : `🔄 *ATUALIZAÇÃO ${formatNumero(input.numero)}*`
  const urgencyEmoji = input.urgency === 'AOG' ? '🔴' : '🟡'
  const itemsBlock = input.items.length === 1
    ? `🔧 *Part Number:* ${input.items[0].part_number}\n🔢 *Quantidade:* ${input.items[0].quantity}${input.items[0].notes ? `\n📝 ${input.items[0].notes}` : ''}`
    : `📋 *ITENS (${input.items.length}):*\n` + input.items.map((it, i) => `  ${i + 1}. ${it.part_number} — Qtd: ${it.quantity}${it.notes ? ` (${it.notes})` : ''}`).join('\n')
  return [
    header, '',
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
