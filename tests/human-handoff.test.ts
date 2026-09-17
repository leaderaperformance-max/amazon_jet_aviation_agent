import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => {
  const state = {
    memoryRows: [] as Array<{ message: { type: string; content: string }; created_at?: string }>,
    reactivation: null as { reactivated_at: string } | null,
    inArgs: [] as unknown[],
  }
  const db = {
    state,
    from: (table: string) => {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.gt = vi.fn(() => c)
      c.order = vi.fn(() => c)
      c.in = vi.fn((...a: unknown[]) => { state.inArgs = a; return c })
      c.limit = vi.fn(async () => ({ data: state.memoryRows, error: null }))
      c.maybeSingle = vi.fn(async () => ({ data: table === 'ia_reactivations' ? state.reactivation : null, error: null }))
      return c
    },
  }
  return { db }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn(() => db) }))
// proactive-client (só pra gerar o texto real da mensagem proativa) puxa esses módulos.
vi.mock('@/lib/memory', () => ({ saveMessage: vi.fn() }))
vi.mock('@/lib/chatwoot-outbound', () => ({ ensureClientConversation: vi.fn() }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))

import {
  isSystemTemplateText, sessionKeyVariants, isEchoOfOwnMessage, isHumanHandling, lastAgentMessageAtMs,
} from '@/lib/human-handoff'
import { buildProactiveMessage } from '@/lib/proactive-client'

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

beforeEach(() => {
  db.state.memoryRows = []
  db.state.reactivation = null
  db.state.inArgs = []
  delete process.env.SLA_HUMAN_COOLDOWN_HOURS
})

describe('isSystemTemplateText — contato proativo com o cliente do consultor', () => {
  it('reconhece a mensagem proativa de verdade (gerada pelo sistema)', () => {
    const msg = buildProactiveMessage({ clientName: 'Filemon Cardoso', resellerName: 'Anderson', items: [{ part_number: 'S1915-S', quantity: '2' }] })
    expect(isSystemTemplateText(msg)).toBe(true)
  })

  it('não confunde com vendedor que cumprimenta parecido', () => {
    expect(isSystemTemplateText('Olá, Filemon! Aqui é da Amazon Jet Aviation, tudo bem? Segue a cotação')).toBe(false)
    expect(isSystemTemplateText('Boa tarde Filemon, iremos tratar sua cotação como rotina!')).toBe(false)
    expect(isSystemTemplateText('')).toBe(false)
  })
})

describe('sessionKeyVariants', () => {
  it('JID sem o 9 casa com o telefone canônico salvo pelo contato proativo', () => {
    const v = sessionKeyVariants('556284689607@s.whatsapp.net')
    expect(v).toContain('556284689607@s.whatsapp.net')
    expect(v).toContain('5562984689607')
    expect(v).toContain('5562984689607@s.whatsapp.net')
  })

  it('sessão do site (não numérica) fica só com ela mesma', () => {
    expect(sessionKeyVariants('chatwoot-conv-284')).toEqual(['chatwoot-conv-284'])
  })
})

describe('isEchoOfOwnMessage — eco do sistema não é atendente', () => {
  it('resposta da IA (Site/Instagram) que voltou pelo webhook → eco', async () => {
    db.state.memoryRows = [{ message: { type: 'ai', content: 'Olá! Aqui é o Jet, da Amazon Jet Aviation.\nComo posso te ajudar?' } }]
    expect(await isEchoOfOwnMessage('chatwoot-conv-284', 'Olá! Aqui é o Jet, da Amazon Jet Aviation. Como posso te ajudar?')).toBe(true)
  })

  it('mensagem proativa → eco, mesmo se a memória estiver em outra chave', async () => {
    const msg = buildProactiveMessage({ clientName: 'Aldemir', resellerName: 'Karina', items: [{ part_number: 'ABC', quantity: '1' }] })
    expect(await isEchoOfOwnMessage('5551991739595@s.whatsapp.net', msg)).toBe(true)
  })

  it('procura nas variações da chave (JID × telefone)', async () => {
    db.state.memoryRows = []
    await isEchoOfOwnMessage('556284689607@s.whatsapp.net', 'texto qualquer')
    expect(db.state.inArgs[0]).toBe('session_id')
    expect(db.state.inArgs[1]).toContain('5562984689607')
  })

  it('texto do atendente de verdade → NÃO é eco', async () => {
    db.state.memoryRows = [{ message: { type: 'ai', content: 'Recebi seu PN! Quantas unidades?' } }]
    expect(await isEchoOfOwnMessage('5562984689607@s.whatsapp.net', 'Bom dia, Rocha! Já estou verificando pra você.')).toBe(false)
  })

  it('mensagem do CLIENTE com mesmo texto não conta (só mensagens da IA)', async () => {
    db.state.memoryRows = [{ message: { type: 'human', content: 'ok' } }]
    expect(await isEchoOfOwnMessage('5562984689607@s.whatsapp.net', 'ok')).toBe(false)
  })

  it('áudio/anexo do atendente (sem texto) → NÃO é eco', async () => {
    expect(await isEchoOfOwnMessage('5562984689607@s.whatsapp.net', '')).toBe(false)
  })
})

describe('isHumanHandling — IA fora por 24h depois que o atendente fala', () => {
  it('caso Engenheiro Rocha: atendente 12:19, cliente 12:22 → IA fica em silêncio', async () => {
    db.state.memoryRows = [
      { message: { type: 'human', content: 'tenho interesse' }, created_at: minutesAgo(0) },
      { message: { type: 'human', content: '[atendente]: Bom dia! Vou verificar a disponibilidade.' }, created_at: minutesAgo(3) },
    ]
    expect(await isHumanHandling('5562984689607@s.whatsapp.net')).toBe(true)
  })

  it('atendente falou há 25h → IA volta a responder', async () => {
    db.state.memoryRows = [
      { message: { type: 'human', content: '[atendente]: Segue a cotação.' }, created_at: minutesAgo(25 * 60) },
    ]
    expect(await isHumanHandling('s@x')).toBe(false)
  })

  it('nota privada #ia depois da fala do atendente → IA volta na hora', async () => {
    db.state.memoryRows = [
      { message: { type: 'human', content: '[atendente]: Pronto, resolvido.' }, created_at: minutesAgo(30) },
    ]
    db.state.reactivation = { reactivated_at: minutesAgo(5) }
    expect(await isHumanHandling('s@x')).toBe(false)
  })

  it('eco antigo do contato proativo salvo como [atendente] não pausa a IA', async () => {
    const msg = buildProactiveMessage({ clientName: 'Werleys', resellerName: 'Anderson', items: [{ part_number: 'ABC', quantity: '1' }] })
    db.state.memoryRows = [
      { message: { type: 'human', content: `[atendente]: ${msg}` }, created_at: minutesAgo(10) },
    ]
    expect(await lastAgentMessageAtMs('s@x')).toBeNull()
    expect(await isHumanHandling('s@x')).toBe(false)
  })

  it('conversa só com cliente e IA → IA segue normal', async () => {
    db.state.memoryRows = [
      { message: { type: 'ai', content: 'Qual o PN?' }, created_at: minutesAgo(1) },
      { message: { type: 'human', content: 'oi' }, created_at: minutesAgo(2) },
    ]
    expect(await isHumanHandling('s@x')).toBe(false)
  })
})
