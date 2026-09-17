import { supabase } from '@/lib/supabase'
import { MemoryMessage } from '@/lib/types'

const TABLE = 'memory_chat_amazon_jet'

function parseContent(content: string): string {
  if (content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        return parsed.join('\n')
      }
    } catch {
      // fall through to return as-is
    }
  }
  return content
}

const HISTORY_LIMIT = 25

/**
 * Carrega as ÚLTIMAS mensagens da conversa, em ordem cronológica.
 *
 * ⚠️ Bug histórico (corrigido): ordenava por id ASCENDENTE com limit, ou seja, pegava
 * as 25 mensagens MAIS ANTIGAS da sessão. Em conversas longas (revendedores têm meses
 * de histórico) o modelo enxergava junho e não via o que o cliente falou minutos antes —
 * daí PN de outro cliente entrar na cotação, perguntas repetidas e "esqueceu o que eu disse".
 * Busca DESC (as mais recentes) e inverte pra ordem cronológica.
 */
export async function loadHistory(sessionId: string): Promise<MemoryMessage[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('id', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) {
    throw new Error(`Failed to load history: ${error.message}`)
  }

  if (!data || data.length === 0) {
    return []
  }

  const rows = data.slice().reverse() // cronológico: mais antiga → mais recente

  return rows.map((row: { message: { type: string; content: string } }) => {
    const msg = row.message
    const role: 'user' | 'assistant' = msg.type === 'human' ? 'user' : 'assistant'
    const content = parseContent(msg.content)
    return { role, content }
  })
}

/**
 * Reprocessamento de mensagem que falhou no meio: o turno do cliente já foi salvo pela
 * tentativa anterior? (Evita o mesmo texto duas vezes no histórico que o modelo lê.)
 */
export async function recentUserMessageExists(
  sessionId: string,
  content: string,
  withinMinutes = 120,
): Promise<boolean> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString()
  const { data, error } = await supabase
    .from(TABLE)
    .select('message')
    .eq('session_id', sessionId)
    .gt('created_at', since)
    .order('id', { ascending: false })
    .limit(20)
  if (error || !data) return false
  return (data as Array<{ message?: { type?: string; content?: string } }>).some(
    r => r.message?.type === 'human' && r.message?.content === content,
  )
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const message =
    role === 'user'
      ? {
          type: 'human',
          content,
          additional_kwargs: {},
          response_metadata: {},
        }
      : {
          type: 'ai',
          content,
          tool_calls: [],
          additional_kwargs: {},
          response_metadata: {},
          invalid_tool_calls: [],
        }

  const { error } = await supabase.from(TABLE).insert({ session_id: sessionId, message })

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`)
  }
}
