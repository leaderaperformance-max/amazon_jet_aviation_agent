import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory } from '@/lib/memory'
import { getContactById } from '@/lib/contacts'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'

const SYSTEM_PROMPT = `Resuma essa conversa em até 5 bullets (•). Capture: nome do contato,
intenção principal, dados técnicos (Part Number, modelo, urgência), estágio atual
(cotação? aguardando? fechamento?), e próximos passos. Use frases curtas e densas.
Se faltar informação, indique explicitamente.`

export async function generateSummary(contactId: string): Promise<{ summary: string }> {
  const contact = await getContactById(contactId)
  if (!contact) throw new Error('Contato não encontrado')
  if (!contact.whatsapp_identifier) throw new Error('whatsapp_identifier ausente')

  const history = await loadHistory(contact.whatsapp_identifier)
  const conversation = history.map(m => `${m.role}: ${m.content}`).join('\n')

  const openaiCfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: openaiCfg.apiKey })

  const { text } = await generateText({
    model: openai(openaiCfg.model),
    system: SYSTEM_PROMPT,
    prompt: `Contato: ${contact.name ?? 'sem nome'}\n\nConversa:\n${conversation}`,
  })

  const supabase = getAdminClient()
  await supabase
    .from('contacts')
    .update({ summary: text, summary_generated_at: new Date().toISOString() })
    .eq('id', contactId)

  return { summary: text }
}
