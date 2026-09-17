import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/debounce', () => ({
  hasNewerPending: vi.fn(),
  hasInFlightPending: vi.fn(),
  completePending: vi.fn(),
  releasePending: vi.fn(),
}))
vi.mock('@/lib/inboxes', () => ({ loadInboxByChatwootId: vi.fn() }))
vi.mock('@/lib/process-incoming', () => ({
  processIncomingMessage: vi.fn(),
  drainAndBuildContent: vi.fn(),
}))

import { POST } from '@/app/api/process-pending/route'
import { hasNewerPending, hasInFlightPending, completePending, releasePending } from '@/lib/debounce'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { processIncomingMessage, drainAndBuildContent } from '@/lib/process-incoming'

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>

const ctx = { chatwootInboxId: 45, conversationId: 304, sessionId: '5562984689607@s.whatsapp.net', labels: ['atendimento_ia'] }

function req(body: object, secret = 'sec') {
  return new NextRequest(`http://localhost/api/process-pending?secret=${secret}`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}
const call = () => POST(req({ sessionId: ctx.sessionId, triggerAt: '2026-09-13T15:19:33Z' }))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'sec'
  m(hasNewerPending).mockResolvedValue(false)
  m(hasInFlightPending).mockResolvedValue(false)
  m(completePending).mockResolvedValue(undefined)
  m(releasePending).mockResolvedValue(undefined)
  m(loadInboxByChatwootId).mockResolvedValue({ id: 'ix', enabled: true })
  m(drainAndBuildContent).mockResolvedValue({ content: 'tenho interesse no anúncio', context: ctx, count: 1, ids: ['p1'], attempt: 1 })
})

describe('/api/process-pending — mensagem nunca some da fila', () => {
  it('sem o segredo → 401', async () => {
    const res = await POST(req({ sessionId: 's', triggerAt: 't' }, 'errado'))
    expect(res.status).toBe(401)
  })

  it('IA respondeu → a mensagem sai da fila (concluída assim que a resposta sai)', async () => {
    m(processIncomingMessage).mockImplementation(async (_i, _c, _t, opts: { onReplySent?: () => Promise<void> }) => {
      await opts.onReplySent?.()
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(completePending).toHaveBeenCalledWith(['p1'])
    expect(completePending).toHaveBeenCalledTimes(1)
    expect(releasePending).not.toHaveBeenCalled()
  })

  it('processamento terminou sem resposta (ex.: atendente conduzindo) → também sai da fila', async () => {
    m(processIncomingMessage).mockResolvedValue(undefined)
    const res = await call()
    expect(res.status).toBe(200)
    expect(completePending).toHaveBeenCalledWith(['p1'])
  })

  it('caso Engenheiro Rocha: falhou ANTES de responder → volta pra fila e responde 500 (QStash tenta de novo)', async () => {
    m(processIncomingMessage).mockRejectedValue(new Error('upsertContact: db timeout'))
    const res = await call()
    expect(res.status).toBe(500)
    expect(releasePending).toHaveBeenCalledWith(['p1'])
    expect(completePending).not.toHaveBeenCalled()
  })

  it('falhou DEPOIS de responder → NÃO reprocessa (sem resposta duplicada)', async () => {
    m(processIncomingMessage).mockImplementation(async (_i, _c, _t, opts: { onReplySent?: () => Promise<void> }) => {
      await opts.onReplySent?.()
      throw new Error('erro depois do envio')
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(releasePending).not.toHaveBeenCalled()
    expect(completePending).toHaveBeenCalledWith(['p1'])
  })

  it('retry: informa reprocessamento pro pipeline não duplicar a mensagem do cliente', async () => {
    m(drainAndBuildContent).mockResolvedValue({ content: 'oi', context: ctx, count: 1, ids: ['p1'], attempt: 2 })
    m(processIncomingMessage).mockResolvedValue(undefined)
    await call()
    expect(m(processIncomingMessage).mock.calls[0][3]).toMatchObject({ reprocessing: true })
  })

  it('primeira tentativa não é reprocessamento', async () => {
    m(processIncomingMessage).mockResolvedValue(undefined)
    await call()
    expect(m(processIncomingMessage).mock.calls[0][3]).toMatchObject({ reprocessing: false })
  })

  it('nada livre mas outra tentativa está com as linhas → 503 (QStash tenta depois, caso ela tenha morrido)', async () => {
    m(drainAndBuildContent).mockResolvedValue({ content: '', context: null, count: 0, ids: [], attempt: 0 })
    m(hasInFlightPending).mockResolvedValue(true)
    const res = await call()
    expect(res.status).toBe(503)
    expect(processIncomingMessage).not.toHaveBeenCalled()
  })

  it('nada pendente → 200 e não processa', async () => {
    m(drainAndBuildContent).mockResolvedValue({ content: '', context: null, count: 0, ids: [], attempt: 0 })
    const res = await call()
    expect(res.status).toBe(200)
    expect(processIncomingMessage).not.toHaveBeenCalled()
  })

  it('mensagem mais nova chegou → deixa o callback dela processar', async () => {
    m(hasNewerPending).mockResolvedValue(true)
    const res = await call()
    expect(res.status).toBe(200)
    expect(drainAndBuildContent).not.toHaveBeenCalled()
  })

  it('falha ao carregar a caixa de entrada → volta pra fila e 500', async () => {
    m(loadInboxByChatwootId).mockRejectedValue(new Error('db down'))
    const res = await call()
    expect(res.status).toBe(500)
    expect(releasePending).toHaveBeenCalledWith(['p1'])
  })
})
