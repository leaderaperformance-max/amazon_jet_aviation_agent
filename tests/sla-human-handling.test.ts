import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { humanIsHandling } from '@/lib/human-handoff'

const H = 3_600_000
const now = new Date('2026-09-04T16:00:00Z').getTime()

describe('IA não reassume conversa que um humano está conduzindo', () => {
  it('humano falou há 16 min → IA NÃO volta (caso real: respondeu 12:26, IA entrou 12:42)', () => {
    expect(humanIsHandling(now - 16 * 60_000, now, 24)).toBe(true)
  })

  it('humano falou há 3 horas → ainda no cooldown, IA NÃO volta', () => {
    expect(humanIsHandling(now - 3 * H, now, 24)).toBe(true)
  })

  it('humano falou há mais de 24h → cooldown expirou, IA pode voltar', () => {
    expect(humanIsHandling(now - 25 * H, now, 24)).toBe(false)
  })

  it('nenhum humano falou na conversa → IA pode assumir normalmente', () => {
    expect(humanIsHandling(null, now, 24)).toBe(false)
  })

  it('janela configurável (SLA_HUMAN_COOLDOWN_HOURS)', () => {
    expect(humanIsHandling(now - 2 * H, now, 1)).toBe(false)
    expect(humanIsHandling(now - 2 * H, now, 6)).toBe(true)
  })
})

describe('nota privada "#ia" devolve a conversa pra IA antes das 24h', () => {
  it('#ia DEPOIS da fala do atendente → IA volta', () => {
    expect(humanIsHandling(now - 2 * H, now, 24, now - 10 * 60_000)).toBe(false)
  })

  it('atendente falou de novo DEPOIS do #ia → pausa recomeça', () => {
    expect(humanIsHandling(now - 5 * 60_000, now, 24, now - 3 * H)).toBe(true)
  })

  it('corrida entre os webhooks: fala do atendente registrada segundos depois do #ia ainda conta como anterior', () => {
    const reactivated = now - 10 * 60_000
    expect(humanIsHandling(reactivated + 20_000, now, 24, reactivated)).toBe(false)
  })
})
