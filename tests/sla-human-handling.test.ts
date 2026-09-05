import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@/lib/inboxes', () => ({ loadInboxByChatwootId: vi.fn(), loadOpenAIConfig: vi.fn() }))
vi.mock('@/lib/agent', () => ({ runAgent: vi.fn() }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))
vi.mock('@/lib/process-incoming', () => ({ buildAgentTools: vi.fn() }))
vi.mock('@/lib/tags', () => ({ addLabel: vi.fn() }))
vi.mock('@/lib/resellers', () => ({ findReseller: vi.fn() }))
vi.mock('@/lib/solicitacoes', () => ({ getOpenSolicitacao: vi.fn(), formatNumero: (n: number) => `#${n}` }))
import { humanIsHandling } from '@/lib/sla-takeover'

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
