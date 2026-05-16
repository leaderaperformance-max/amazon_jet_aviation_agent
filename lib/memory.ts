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

export async function loadHistory(sessionId: string): Promise<MemoryMessage[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('id', { ascending: true })
    .limit(25)

  if (error) {
    throw new Error(`Failed to load history: ${error.message}`)
  }

  if (!data || data.length === 0) {
    return []
  }

  return data.map((row: { message: { type: string; content: string } }) => {
    const msg = row.message
    const role: 'user' | 'assistant' = msg.type === 'human' ? 'user' : 'assistant'
    const content = parseContent(msg.content)
    return { role, content }
  })
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
