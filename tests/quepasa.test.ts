import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendMessage } from '@/lib/quepasa'

const cfg = { host: 'https://gw.example', token: 'tok' }
const fast = { retryDelayMs: 1 } // sem esperas reais nos testes

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }
}

describe('sendMessage (sinal de sucesso + retry)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('true quando o gateway aceita (2xx success)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { success: true })))
    expect(await sendMessage(cfg, '55999', 'oi', fast)).toBe(true)
  })

  it('false após esgotar tentativas com gateway desconectado (503)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(503, { success: false, status: 'Disconnected' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendMessage(cfg, '55999', 'oi', fast)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3) // tentou 3x
  })

  it('recupera no retry: falha na 1ª, sucesso na 2ª → true', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(res(200, { success: true }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendMessage(cfg, '55999', 'oi', fast)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('200 com success:false conta como falha (flap do gateway)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { success: false }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendMessage(cfg, '55999', 'oi', fast)).toBe(false)
  })

  it('2xx com body não-JSON conta como sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' }))
    expect(await sendMessage(cfg, '55999', 'oi', fast)).toBe(true)
  })
})
