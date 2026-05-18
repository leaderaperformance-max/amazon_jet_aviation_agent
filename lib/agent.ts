import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { injectCurrentDate } from '@/lib/prompt'
import type { MemoryMessage } from '@/lib/types'

export async function runAgent(
  sessionId: string,
  userMessage: string,
  systemPrompt: string,
  openaiApiKey: string,
  openaiModel: string,
  tools?: Record<string, unknown>
): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)
  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const openai = createOpenAI({ apiKey: openaiApiKey })

  const generateParams: Parameters<typeof generateText>[0] = {
    model: openai(openaiModel),
    system: injectCurrentDate(systemPrompt),
    messages,
  }
  if (tools) (generateParams as { tools?: unknown }).tools = tools

  const { text } = await generateText(generateParams)

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
