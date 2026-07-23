import type { QuePasaConfig } from '@/lib/types'

/**
 * Envia mensagem via QuePasa. Retorna true só quando o gateway ACEITOU o envio
 * (HTTP 2xx e success !== false). O gateway cai/flapa; sem esse sinal, o chamador
 * marcava a cotação como "enviada ao grupo" sem ninguém ter recebido.
 * Tenta `attempts` vezes (flaps curtos se recuperam no retry).
 */
export async function sendMessage(
  config: QuePasaConfig,
  chatId: string,
  content: string,
  opts: { attempts?: number; retryDelayMs?: number } = {},
): Promise<boolean> {
  const url = `${config.host.replace(/\/$/, '')}/v4/send`
  const attempts = opts.attempts ?? 3
  const retryDelayMs = opts.retryDelayMs ?? 1500

  console.log(`[QuePasa] POST ${url} chatId=${chatId} contentLen=${content.length}`)

  for (let attempt = 1; attempt <= attempts; attempt++) {
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
      console.log(`[QuePasa] attempt ${attempt}/${attempts} status=${response.status} body=${body.slice(0, 300)}`)
      if (response.ok) {
        // QuePasa pode devolver 200 com {"success":false,...} — trata como falha.
        try {
          const j = JSON.parse(body) as { success?: boolean }
          if (j?.success === false) throw new Error('success=false')
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e // body não-JSON com 2xx = ok
        }
        return true
      }
      throw new Error(`http ${response.status}`)
    } catch (err) {
      console.warn(`[QuePasa] attempt ${attempt}/${attempts} failed:`, err)
      if (attempt < attempts) await new Promise(r => setTimeout(r, retryDelayMs))
    }
  }
  return false
}
