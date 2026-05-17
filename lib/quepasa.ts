import type { QuePasaConfig } from '@/lib/types'

export async function sendMessage(
  config: QuePasaConfig,
  chatId: string,
  content: string
): Promise<void> {
  const url = `${config.host.replace(/\/$/, '')}/v4/send`

  console.log(`[QuePasa] POST ${url} chatId=${chatId} contentLen=${content.length}`)

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
    const body = await response.text().catch(() => '')
    console.log(`[QuePasa] response status=${response.status} body=${body.slice(0, 500)}`)
  } catch (err) {
    console.error('[QuePasa] fetch error:', err)
  }
}
