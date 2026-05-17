import type { QuePasaConfig } from '@/lib/types'

export async function sendMessage(
  config: QuePasaConfig,
  chatId: string,
  content: string
): Promise<void> {
  const url = `${config.host.replace(/\/$/, '')}/v4/send`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-QUEPASA-TOKEN': config.token,
        'X-QUEPASA-CHATID': chatId,
      },
      body: JSON.stringify({ text: content }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn(`QuePasa sendMessage failed: ${response.status} ${body}`)
    }
  } catch (err) {
    console.warn('QuePasa sendMessage error:', err)
  }
}
