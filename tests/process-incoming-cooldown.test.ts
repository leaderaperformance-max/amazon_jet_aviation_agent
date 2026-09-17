import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/qstash', () => ({ isQStashEnabled: vi.fn(() => true), scheduleSlaTakeover: vi.fn(), scheduleDrain: vi.fn() }))
vi.mock('@/lib/contacts', () => ({
  upsertContact: vi.fn(),
  updateContactLabels: vi.fn(),
}))
vi.mock('@/lib/memory', () => ({
  loadHistory: vi.fn().mockResolvedValue([]),
  saveMessage: vi.fn(),
  recentUserMessageExists: vi.fn(),
}))
vi.mock('@/lib/agent', () => ({ runAgent: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn() }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))
vi.mock('@/lib/chatwoot-send', () => ({ sendChatwootReply: vi.fn() }))
vi.mock('@/lib/tags', () => ({ addLabel: vi.fn(), removeLabel: vi.fn() }))
vi.mock('@/lib/resellers', () => ({ findReseller: vi.fn() }))
vi.mock('@/lib/solicitacoes', () => ({
  getOpenSolicitacao: vi.fn(), decideDispatch: vi.fn(), mergeItems: vi.fn(), splitItemsByQuote: vi.fn(),
  openSolicitacao: vi.fn(), closeSolicitacao: vi.fn(), addToSolicitacao: vi.fn(), markSent: vi.fn(),
  formatNumero: (n: number) => `#${String(n).padStart(4, '0')}`,
}))
vi.mock('@/lib/human-handoff', () => ({ isHumanHandling: vi.fn() }))

import { processIncomingMessage } from '@/lib/process-incoming'
import { upsertContact } from '@/lib/contacts'
import { saveMessage, recentUserMessageExists } from '@/lib/memory'
import { runAgent } from '@/lib/agent'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { sendMessage } from '@/lib/quepasa'
import { findReseller } from '@/lib/resellers'
import { getOpenSolicitacao } from '@/lib/solicitacoes'
import { isHumanHandling } from '@/lib/human-handoff'

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>

const inbox = {
  id: 'ix', system_prompt: 'P', quepasa_host: 'https://qp', quepasa_token: 't',
  chatwoot_base_url: 'https://cw', chatwoot_account_id: 14, chatwoot_user_token: 'tk',
}
// Conversa #304 (Engenheiro Rocha): bot LIGADO (etiqueta atendimento_ia).
const rocha = {
  chatwootInboxId: 45, conversationId: 304, sessionId: '5562984689607@s.whatsapp.net',
  senderName: 'Engenheiro Rocha', senderPhone: '+5562984689607', senderIdent: '5562984689607@s.whatsapp.net',
  chatId: '5562984689607', chatwootContactId: 74762, labels: ['atendimento_ia'],
}

beforeEach(() => {
  vi.clearAllMocks()
  m(upsertContact).mockResolvedValue({ contact: { id: 'c1', current_labels: ['atendimento_ia'] }, wasNew: false })
  m(runAgent).mockResolvedValue('Olá! Qual o Part Number da peça?')
  m(loadOpenAIConfig).mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' })
  m(sendMessage).mockResolvedValue(true)
  m(findReseller).mockResolvedValue(null)
  m(getOpenSolicitacao).mockResolvedValue(null)
  m(isHumanHandling).mockResolvedValue(false)
  m(recentUserMessageExists).mockResolvedValue(false)
})

describe('IA fora da conversa por 24h quando o atendente humano falou (mesmo com o bot ligado)', () => {
  it('caso Engenheiro Rocha: atendente respondeu 12:19, cliente escreveu 12:22 → IA NÃO responde', async () => {
    m(isHumanHandling).mockResolvedValue(true)
    await processIncomingMessage(inbox as never, rocha as never, 'Qual o valor?')
    expect(isHumanHandling).toHaveBeenCalledWith('5562984689607@s.whatsapp.net')
    expect(runAgent).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    // a mensagem do cliente continua na memória (a IA vai ter contexto quando voltar)
    expect(saveMessage).toHaveBeenCalledWith('5562984689607@s.whatsapp.net', 'user', 'Qual o valor?')
  })

  it('sem atendente nas últimas 24h (ou reativada com #ia) → IA responde normal', async () => {
    const onReplySent = vi.fn().mockResolvedValue(undefined)
    await processIncomingMessage(inbox as never, rocha as never, 'Qual o valor?', { onReplySent })
    expect(runAgent).toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith(expect.anything(), '5562984689607', 'Olá! Qual o Part Number da peça?')
    expect(onReplySent).toHaveBeenCalledTimes(1)
  })

  it('consultor/revendedor fica FORA da trava — a IA continua disparando as cotações dele', async () => {
    m(findReseller).mockResolvedValue({ name: 'Anderson' })
    m(isHumanHandling).mockResolvedValue(true)
    await processIncomingMessage(inbox as never, { ...rocha, sessionId: '17285006494@s.whatsapp.net', senderIdent: '17285006494@s.whatsapp.net', senderPhone: null, chatId: '17285006494' } as never, 'Cotação PN S1915-S qtd 2')
    expect(runAgent).toHaveBeenCalled()
  })
})

describe('reprocessamento (tentativa anterior falhou no meio)', () => {
  it('mensagem do cliente já salva pela tentativa anterior → não duplica na memória', async () => {
    m(recentUserMessageExists).mockResolvedValue(true)
    await processIncomingMessage(inbox as never, rocha as never, 'Qual o valor?', { reprocessing: true })
    expect(saveMessage).not.toHaveBeenCalled()
    expect(runAgent).toHaveBeenCalled()
  })

  it('tentativa anterior não chegou a salvar → salva normalmente', async () => {
    m(recentUserMessageExists).mockResolvedValue(false)
    await processIncomingMessage(inbox as never, rocha as never, 'Qual o valor?', { reprocessing: true })
    expect(saveMessage).toHaveBeenCalledWith(rocha.sessionId, 'user', 'Qual o valor?')
  })

  it('primeira tentativa nem consulta (custo zero no caminho normal)', async () => {
    await processIncomingMessage(inbox as never, rocha as never, 'Qual o valor?')
    expect(recentUserMessageExists).not.toHaveBeenCalled()
  })

  it('falha antes da resposta → erro sobe (o worker devolve pra fila) e onReplySent não é chamado', async () => {
    m(runAgent).mockRejectedValue(new Error('openai 500'))
    const onReplySent = vi.fn()
    await expect(processIncomingMessage(inbox as never, rocha as never, 'oi', { onReplySent })).rejects.toThrow('openai 500')
    expect(onReplySent).not.toHaveBeenCalled()
  })
})
