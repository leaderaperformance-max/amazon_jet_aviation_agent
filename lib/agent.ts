import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { getSystemPrompt } from '@/lib/prompt'
import type { MemoryMessage } from '@/lib/types'

export async function runAgent(sessionId: string, userMessage: string): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)

  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: getSystemPrompt(),
    messages,
  })

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
