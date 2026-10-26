import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveFunnel } from '@/lib/chatwoot/funnel'

const cfg = { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' }

// Funil real do Amazon Jet (26/10/2026): DUAS etapas 'middle'.
const funis = [{
  id: 9,
  identifier: 'amazon_jet_vendas',
  funnel_steps: [
    { id: 34, step_type: 'start' },
    { id: 39, step_type: 'middle' },
    { id: 36, step_type: 'middle' },
    { id: 38, step_type: 'end' },
  ],
}]

beforeEach(() => vi.restoreAllMocks())

describe('resolveFunnel', () => {
  it('devolve TODAS as etapas de cada tipo (a 2ª do meio ficava de fora)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ payload: funis }) } as Response)
    const f = await resolveFunnel(cfg, 'amazon_jet_vendas')
    expect(f?.stepsByType.middle).toEqual([39, 36])
    expect(f?.stepsByType.start).toEqual([34])
    expect(f?.stepsByType.end).toEqual([38])
    expect(f?.steps.middle).toBe(39) // compatibilidade: primeira de cada tipo
  })

  it('funil sem alguma etapa → null (nada dispara)', async () => {
    const semEnd = [{ ...funis[0], funnel_steps: funis[0].funnel_steps.filter(s => s.step_type !== 'end') }]
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ payload: semEnd }) } as Response)
    expect(await resolveFunnel(cfg, 'amazon_jet_vendas')).toBeNull()
  })

  it('identifier que não existe → null', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ payload: funis }) } as Response)
    expect(await resolveFunnel(cfg, 'outro_funil')).toBeNull()
  })
})
