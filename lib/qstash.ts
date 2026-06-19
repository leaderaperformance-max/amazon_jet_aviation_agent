/**
 * QStash (Upstash) — fila com delay pro debounce de mensagens.
 *
 * Em vez de bloquear a função serverless por N segundos (anti-padrão que
 * estoura o limite de 60s da Vercel), publicamos uma mensagem no QStash com
 * delay. Depois do delay, o QStash chama de volta /api/process-pending.
 *
 * Se QSTASH_TOKEN não estiver configurado, isQStashEnabled() retorna false e
 * o webhook cai num fallback (processa na hora, sem agrupar).
 */

// Base do QStash. Conta EU usa qstash-eu-central-1; configurável via QSTASH_URL.
function qstashBase(): string {
  return (process.env.QSTASH_URL ?? 'https://qstash.upstash.io').replace(/\/$/, '')
}

export function isQStashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN && !!process.env.APP_URL
}

/**
 * Agenda o processamento de uma sessão pra daqui `delaySeconds`.
 * O callback bate em /api/process-pending com { sessionId, triggerAt }.
 */
export async function scheduleDrain(
  sessionId: string,
  triggerAt: string,
  delaySeconds: number,
): Promise<void> {
  const token = process.env.QSTASH_TOKEN
  const appUrl = process.env.APP_URL
  const secret = process.env.CRON_SECRET
  if (!token || !appUrl) throw new Error('QStash not configured')

  const callback = `${appUrl.replace(/\/$/, '')}/api/process-pending?secret=${secret}`

  // QStash espera a URL de destino CRUA após /v2/publish/ (não URL-encoded).
  const res = await fetch(`${qstashBase()}/v2/publish/${callback}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': `${delaySeconds}s`,
      // Dedup not used — each message schedules its own callback; the worker
      // skips stale ones via the triggerAt comparison.
    },
    body: JSON.stringify({ sessionId, triggerAt }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`QStash publish ${res.status}: ${err.slice(0, 200)}`)
  }
}
