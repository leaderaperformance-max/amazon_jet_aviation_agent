import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveFunnel, listFunnelItems } from '@/lib/chatwoot/funnel'

const cfg = { baseUrl: 'https://chat.example.com', accountId: 14, userToken: 'tok' }

beforeEach(() => vi.restoreAllMocks())

describe('resolveFunnel', () => {
  it('acha o funil por identifier e mapeia steps por step_type', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ payload: [{
        id: 9, identifier: 'amazon_jet_vendas',
        funnel_steps: [
          { id: 34, step_type: 'start', identifier: 'leads_novos' },
          { id: 36, step_type: 'middle', identifier: 'oramento_enviado' },
          { id: 38, step_type: 'end', identifier: 'venda_fechada' },
        ],
      }] }),
    } as Response)

    const f = await resolveFunnel(cfg, 'amazon_jet_vendas')
    expect(f).toEqual({ funnelId: 9, steps: { start: 34, middle: 36, end: 38 } })
  })

  it('retorna null se o identifier não existe', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ payload: [] }),
    } as Response)
    expect(await resolveFunnel(cfg, 'inexistente')).toBeNull()
  })
})

describe('listFunnelItems', () => {
  it('lista itens de um step', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ payload: [{ id: 286, funnel_step_id: 36, start_in_step: 1782227449, amount: '0.0', status: 'active', label_list: ['novo_lead'], contact: { identifier: '55x@s.whatsapp.net', phone_number: '+55x', name: 'Leo' }, conversation: { id: 54503, display_id: 100, inbox_id: 45 } }] }),
    } as Response)

    const items = await listFunnelItems(cfg, 9, 36)
    expect(items).toHaveLength(1)
    expect(items[0].funnel_step_id).toBe(36)
    expect(items[0].contact.identifier).toBe('55x@s.whatsapp.net')
  })
})
