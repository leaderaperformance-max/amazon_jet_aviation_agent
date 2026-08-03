/**
 * Rede de segurança: o cliente NUNCA pode receber o raciocínio interno da IA.
 *
 * Caso real: a IA respondeu "Parece que o contato está interessado em aviação, mas não
 * traz perguntas sobre peças... Vou encerrar a conversa de forma cortês:" seguido da
 * mensagem entre aspas — tudo isso foi entregue ao cliente.
 *
 * Aqui a limpeza é determinística (não depende do modelo obedecer o prompt):
 *  1. Preâmbulo + mensagem entre aspas → sobra só a mensagem.
 *  2. Linhas de meta-comentário (falar SOBRE o cliente em 3ª pessoa, anunciar o que
 *     vai fazer, separadores visuais) são removidas.
 */

/** Linha que é raciocínio/meta-comentário, não mensagem pro cliente. */
function isMetaLine(line: string): boolean {
  const l = line.trim()
  if (!l) return false
  // Separador visual usado pra dividir "raciocínio" da "mensagem".
  if (/^[-—─_*=]{3,}$/.test(l)) return true
  // Rótulo explícito de bloco interno.
  if (/^(an[áa]lise|racioc[íi]nio|observa[çc][ãa]o|nota interna|contexto|avalia[çc][ãa]o|decis[ãa]o)\s*:/i.test(l)) return true
  // Anúncio do que vai fazer ("Vou encerrar a conversa...", "Vou responder assim:").
  if (/^(vou|irei|vamos)\s+(encerrar|responder|dizer|informar|explicar|enviar\s+a\s+mensagem|mandar\s+a\s+mensagem|seguir\s+com|prosseguir|perguntar|finalizar)/i.test(l)) return true
  // Fala SOBRE o cliente em 3ª pessoa — a IA fala COM o cliente ("você"), nunca sobre ele.
  if (/\b(o|a)\s+(contato|cliente|lead|usu[áa]rio)\b[^.!?]*\b(est[áa]|parece|mencionou|n[ãa]o|se\s+enquadra|demonstra|quer|busca)\b/i.test(l)) return true
  if (/\bn[ãa]o\s+se\s+enquadra\b|\bperfil\s+de\s+cliente\b/i.test(l)) return true
  return false
}

/**
 * Se houver um bloco entre aspas que é claramente "a mensagem pronta" (e há
 * preâmbulo antes dele, ou ele é praticamente a resposta inteira), devolve só ele.
 */
function extractQuotedMessage(text: string): string | null {
  const re = /[“"]([\s\S]{40,})[”"]/g
  let best: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!best || m[1].length > best[1].length) best = m
  }
  if (!best) return null
  const inner = best[1].trim()
  const before = text.slice(0, best.index).trim()
  // Só desembrulha quando a mensagem é a parte dominante da resposta.
  if (inner.length < 40) return null
  if (before.length === 0 || inner.length >= before.length * 0.5) return inner
  return null
}

/** Limpa a resposta antes de ir pro cliente. Idempotente e seguro pra texto normal. */
export function sanitizeReply(raw: string): string {
  const original = (raw ?? '').trim()
  if (!original) return original

  let text = original

  const quoted = extractQuotedMessage(text)
  if (quoted) text = quoted

  const cleaned = text
    .split('\n')
    .filter(line => !isMetaLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Nunca devolve vazio: se a limpeza comeu tudo, mantém o texto que veio.
  return cleaned || text.trim() || original
}
