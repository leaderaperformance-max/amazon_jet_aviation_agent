/**
 * Captura silenciosa de cotação — quando um ATENDENTE HUMANO está conduzindo a conversa.
 *
 * Regra aprovada em set/2026: atendente falou → a IA não responde mais aquele cliente.
 * Só que a COTAÇÃO não pode esperar. Caso real (Newton, 19/10/2026): o cliente mandou o
 * PN 3244809-8 às 16:07 e o grupo de cotação só recebeu às 16:23, quando o resgate
 * automático de 15 min entrou — o time reclamou antes disso ("a IA não está completando
 * pra mandar no grupo"). E quando um atendente tinha falado nas últimas 24h, a cotação
 * não chegava ao grupo nenhuma vez.
 *
 * Aqui as duas regras do negócio convivem:
 *  - "a IA não atropela o atendente humano" → NADA é enviado ao cliente;
 *  - "nunca deixe uma cotação passar"       → o grupo recebe na hora.
 */

/** Data solta (19/10, 19/10/2026) não é Part Number. */
const DATE_LIKE = /^\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?$/
/** Token com separador e pelo menos um dígito: 3244809-8, MS21266-2N, 010-01057-00. */
const PN_LIKE_TOKEN = /^[A-Za-z0-9]{2,}(?:[-/.][A-Za-z0-9]+)+$/
/** O cliente escreveu "PN"/"P/N"/"part number" — o código pode vir sem separador. */
const PN_KEYWORD = /\bp\s*\/?\s*n\b|\bpart\s*numbers?\b/i

/**
 * A mensagem tem cara de cotação com Part Number? Filtro barato e deterministico:
 * só vale a pena rodar o modelo quando há chance real de disparo (sem PN o envia_pn
 * é barrado de qualquer jeito — PN é regra máxima). Erra para o lado de rodar demais:
 * um falso positivo custa uma chamada; um falso negativo perde a cotação.
 */
export function mentionsPartNumberCandidate(text: string | null | undefined): boolean {
  const raw = (text ?? '').trim()
  if (!raw) return false
  if (PN_KEYWORD.test(raw)) return true

  // Tira URLs antes de olhar os tokens (link tem barra e dígito e enganaria o filtro).
  const semUrls = raw.replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
  for (const token of semUrls.split(/[\s,;:()[\]"'*|]+/)) {
    const t = token.replace(/[.,;:!?]+$/, '')
    if (t.length < 5 || !/\d/.test(t)) continue
    if (DATE_LIKE.test(t)) continue
    if (PN_LIKE_TOKEN.test(t)) return true
  }
  return false
}

/**
 * Diretiva do modo silencioso. O texto que o modelo escrever é DESCARTADO — só os
 * efeitos de tool (envia_pn → solicitação + grupo) valem.
 */
export const SILENT_CAPTURE_DIRECTIVE = `

---

## 🤫 MODO CAPTURA SILENCIOSA — ATENDENTE HUMANO NA CONVERSA

Um ATENDENTE HUMANO está conduzindo esta conversa com o cliente. **Nada do que você escrever será enviado — o texto da sua resposta é descartado.** Não cumprimente, não pergunte, não confirme: ninguém vai ler.

**Sua única tarefa:** se a mensagem do cliente traz pedido de cotação com PART NUMBER (no texto, na lista ou no documento), chame \`envia_pn\` AGORA com TODOS os itens, pra cotação chegar ao grupo de cotação imediatamente.

- Quantidade não dita → use a que dá pra inferir da mensagem ("um FCU" = 1).
- Urgência → \`rotina\`, a não ser que o PRÓPRIO cliente tenha escrito a sigla AOG.
- Documento/lista com PNs → extraia os PNs e mande todos.
- **Sem Part Number de verdade (só descrição), não chame nada** — o atendente humano cuida disso.
- Nunca chame \`envia_pn\` com descrição no lugar do PN.
`
