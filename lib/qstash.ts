function qstashBase(): string {
  return (process.env.QSTASH_URL ?? 'https://qstash.upstash.io').replace(/\/$/, '')
}

export function isQStashEnabled(): boolean {
  return !!process.env.QSTASH_TOKEN && !!process.env.APP_URL
}

async function publishWithDelay(callbackPath: string, body: unknown, delaySeconds: number): Promise<void> {
  const token = process.env.QSTASH_TOKEN
  const appUrl = process.env.APP_URL
  const secret = process.env.CRON_SECRET
  if (!token || !appUrl) throw new Error('QStash not configured')

  const callback = `${appUrl.replace(/\/$/, '')}${callbackPath}?secret=${secret}`
  const res = await fetch(`${qstashBase()}/v2/publish/${callback}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': `${delaySeconds}s`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`QStash publish ${res.status}: ${err.slice(0, 200)}`)
  }
}

export async function scheduleDrain(sessionId: string, triggerAt: string, delaySeconds: number): Promise<void> {
  await publishWithDelay('/api/process-pending', { sessionId, triggerAt }, delaySeconds)
}

export async function scheduleSlaTakeover(
  sessionId: string, sinceAt: string, delaySeconds: number,
  extra: { conversationId: number; chatwootInboxId: number },
): Promise<void> {
  await publishWithDelay('/api/sla-takeover', { sessionId, sinceAt, ...extra }, delaySeconds)
}
