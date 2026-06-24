# Automações do Funil + SLA 15min — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar (A) as 3 mensagens automáticas por tempo do funil de vendas (pontos 5/7/9 do doc CRM) e (B) o takeover da IA quando o humano não responde em 15 min.

**Architecture:** Dois recursos independentes que compartilham infra. (A) Um cron lê o funil nativo do Chatwoot via API (`funnel_items`) e dispara mensagens por IA em leads parados, com gate de inatividade. (B) Quando chega mensagem numa conversa com humano, agenda um job QStash +15min; se ninguém respondeu, a IA re-ativa e responde.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase, Vercel AI SDK (`ai` v6 + `@ai-sdk/openai`), QStash, QuePasa, Vitest. Chatwoot self-hosted (conta 14) com plugin de funil.

**Spec:** `docs/superpowers/specs/2026-06-24-funil-automacoes-design.md`

> **As duas partes são independentes e podem ser entregues separadamente.** Parte A não depende da B e vice-versa. Sugestão: entregar A primeiro (mais isolada), depois B.

---

## File Structure

**Criar:**
- `lib/chatwoot/funnel.ts` — cliente da API de funil do Chatwoot (resolver funil, listar itens).
- `lib/funnel-automations.ts` — regras de elegibilidade + geração de mensagem + processamento.
- `app/api/cron/funnel-automations/route.ts` — endpoint cron (GET).
- `lib/sla-takeover.ts` — checagem + takeover da conversa.
- `app/api/sla-takeover/route.ts` — endpoint chamado pelo QStash (POST).
- `tests/funnel-client.test.ts`, `tests/funnel-automations.test.ts`, `tests/sla-takeover.test.ts`.
- Migração SQL: tabela `funnel_automations_sent`.

**Modificar:**
- `lib/qstash.ts` — extrair publish genérico + `scheduleSlaTakeover`.
- `lib/agent.ts` — `runAgent` ganha opção `saveUserMessage`.
- `lib/process-incoming.ts` — extrair `buildAgentTools`; agendar SLA no branch de handoff.
- `vercel.json` — remover cron antigo `/api/cron/followup`.

---

# PARTE A — Automações do Funil

## Task A1: Migração — tabela `funnel_automations_sent`

**Files:**
- Aplicar via Supabase MCP `apply_migration` (ou SQL editor).

- [ ] **Step 1: Aplicar a migração**

Nome: `funnel_automations_sent`. SQL:

```sql
create table if not exists funnel_automations_sent (
  id uuid primary key default gen_random_uuid(),
  funnel_item_id   bigint not null,
  conversation_id  bigint,
  automation_type  text not null,   -- 'leads_novos' | 'orcamento_enviado' | 'venda_fechada'
  start_in_step    bigint not null,
  sent_at          timestamptz not null default now(),
  message          text
);
create index if not exists idx_funnel_autom_dedup
  on funnel_automations_sent (funnel_item_id, automation_type, start_in_step);
create index if not exists idx_funnel_autom_recurring
  on funnel_automations_sent (funnel_item_id, automation_type, sent_at desc);
```

- [ ] **Step 2: Verificar**

Run (Supabase MCP `execute_sql`): `select count(*) from funnel_automations_sent;`
Expected: retorna `0` sem erro.

- [ ] **Step 3: Commit** (sem arquivos — migração é remota; registrar no histórico via doc)

```bash
git commit --allow-empty -m "chore(db): tabela funnel_automations_sent (dedup das automações do funil)"
```

---

## Task A2: Cliente da API de funil do Chatwoot

**Files:**
- Create: `lib/chatwoot/funnel.ts`
- Test: `tests/funnel-client.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

```typescript
// tests/funnel-client.test.ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/funnel-client.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```typescript
// lib/chatwoot/funnel.ts
export interface ChatwootCfg {
  baseUrl: string
  accountId: number
  userToken: string
}

export interface FunnelItem {
  id: number
  funnel_step_id: number
  start_in_step: number          // unix ts (segundos)
  amount: string
  status: string                 // 'active' | ...
  label_list: string[]
  contact: { identifier: string | null; phone_number: string | null; name: string | null }
  conversation: { id: number; display_id: number; inbox_id: number }
}

export interface ResolvedFunnel {
  funnelId: number
  steps: { start: number; middle: number; end: number }
}

function headers(cfg: ChatwootCfg) {
  return { 'Content-Type': 'application/json', api_access_token: cfg.userToken }
}

export async function resolveFunnel(cfg: ChatwootCfg, identifier: string): Promise<ResolvedFunnel | null> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/funnels`
  const res = await fetch(url, { headers: headers(cfg) })
  if (!res.ok) throw new Error(`funnels ${res.status}`)
  const data = await res.json()
  const funnels = data.payload ?? data
  const f = (funnels as Array<{ id: number; identifier: string; funnel_steps: Array<{ id: number; step_type: string }> }>)
    .find(x => x.identifier === identifier)
  if (!f) return null
  const byType = (t: string) => f.funnel_steps.find(s => s.step_type === t)?.id
  const start = byType('start'), middle = byType('middle'), end = byType('end')
  if (start == null || middle == null || end == null) return null
  return { funnelId: f.id, steps: { start, middle, end } }
}

export async function listFunnelItems(cfg: ChatwootCfg, funnelId: number, stepId: number): Promise<FunnelItem[]> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/funnels/${funnelId}/funnel_steps/${stepId}/funnel_items`
  const res = await fetch(url, { headers: headers(cfg) })
  if (!res.ok) throw new Error(`funnel_items ${res.status}`)
  const data = await res.json()
  return (data.payload ?? data) as FunnelItem[]
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/funnel-client.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/chatwoot/funnel.ts tests/funnel-client.test.ts
git commit -m "feat(funnel): cliente da API de funil do Chatwoot (resolve + list items)"
```

---

## Task A3: Geração da mensagem por etapa (IA)

**Files:**
- Create: `lib/funnel-automations.ts` (parte 1 — prompts + geração)
- Test: `tests/funnel-automations.test.ts` (parte 1)

- [ ] **Step 1: Escrever o teste falhando**

```typescript
// tests/funnel-automations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => (m: string) => `mock-${m}`) }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]), saveMessage: vi.fn() }))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' }) }))

import { generateStageMessage, STAGE_PROMPTS } from '@/lib/funnel-automations'
import { generateText } from 'ai'

const mockGen = generateText as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe('generateStageMessage', () => {
  it('gera mensagem usando o prompt da etapa', async () => {
    mockGen.mockResolvedValue({ text: '  Olá! Seguimos buscando.  ' })
    const msg = await generateStageMessage('sess', 'leads_novos')
    expect(msg).toBe('Olá! Seguimos buscando.')
    // usou o system prompt da etapa correta
    expect(mockGen.mock.calls[0][0].system).toBe(STAGE_PROMPTS.leads_novos)
  })

  it('tem prompt pras 3 etapas', () => {
    expect(STAGE_PROMPTS.leads_novos).toBeTruthy()
    expect(STAGE_PROMPTS.orcamento_enviado).toBeTruthy()
    expect(STAGE_PROMPTS.venda_fechada).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/funnel-automations.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar (parte 1 do arquivo)**

```typescript
// lib/funnel-automations.ts
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory } from '@/lib/memory'
import { loadOpenAIConfig } from '@/lib/inboxes'

export type StageKey = 'leads_novos' | 'orcamento_enviado' | 'venda_fechada'

const COMMON = `Você é o JET, SDR consultivo especialista em peças aeronáuticas da Amazon Jet Aviation.
Releia o histórico. Cite o Part Number / nome do cliente se aparecerem — NUNCA invente.
2-4 frases no máximo, tom premium e especialista, sem parecer cobrança, sem emoji exagerado.
NUNCA diga "follow-up", "automação" ou mencione regras internas.
Saída: SOMENTE a mensagem pronta pro cliente. Sem prefixos, sem aspas.`

export const STAGE_PROMPTS: Record<StageKey, string> = {
  leads_novos: `${COMMON}\n\nContexto: o pedido do cliente está em cotação e ainda não saiu o orçamento. Tranquilize que a equipe segue buscando o melhor fornecedor/condição e mantenha o lead aquecido. Faça UMA pergunta consultiva leve (ex.: confirmar urgência/aeronave) se fizer sentido.`,
  orcamento_enviado: `${COMMON}\n\nContexto: a cotação JÁ foi enviada e o cliente não respondeu. Retome a dor, reforce o valor e pergunte se conseguiu avaliar a cotação ou se precisa de ajuste em condição/lead time.`,
  venda_fechada: `${COMMON}\n\nContexto: este cliente JÁ comprou (venda fechada). É uma reativação pós-venda: agradeça a parceria e abra espaço pra uma nova cotação/necessidade, sem ser invasivo.`,
}

export async function generateStageMessage(sessionId: string, stage: StageKey): Promise<string> {
  const history = await loadHistory(sessionId)
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })
  const { text } = await generateText({
    model: openai(cfg.model),
    system: STAGE_PROMPTS[stage],
    messages: [
      ...history,
      { role: 'user' as const, content: '[INSTRUÇÃO INTERNA: gere agora a mensagem desta etapa baseada na conversa acima. Só a mensagem pronta, sem prefixos/aspas.]' },
    ],
  })
  return text.trim()
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/funnel-automations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/funnel-automations.ts tests/funnel-automations.test.ts
git commit -m "feat(funnel): geração de mensagem por etapa (IA, 3 prompts)"
```

---

## Task A4: Elegibilidade (idade + inatividade + dedup)

**Files:**
- Modify: `lib/funnel-automations.ts` (adicionar `isItemDue`)
- Test: `tests/funnel-automations.test.ts` (adicionar bloco)

- [ ] **Step 1: Escrever o teste falhando**

Adicione ao `tests/funnel-automations.test.ts`:

```typescript
import { isItemDue } from '@/lib/funnel-automations'

describe('isItemDue', () => {
  const NOW = 1_000_000 // segundos
  const base = {
    item: { status: 'active', start_in_step: NOW - 90_000, contact: { identifier: 'x@s.whatsapp.net' } },
    lastMessageAtMs: (NOW - 90_000) * 1000, // sem atividade desde que entrou
    thresholdSec: 86_400, // 24h
    alreadySent: false,
    nowMs: NOW * 1000,
  }

  it('dispara: parado > threshold, inativo > threshold, não enviado', () => {
    expect(isItemDue(base)).toBe(true)
  })
  it('não dispara se inativo < threshold (alguém falou recente)', () => {
    expect(isItemDue({ ...base, lastMessageAtMs: (NOW - 1000) * 1000 })).toBe(false)
  })
  it('não dispara se idade na etapa < threshold', () => {
    expect(isItemDue({ ...base, item: { ...base.item, start_in_step: NOW - 1000 } })).toBe(false)
  })
  it('não dispara se já enviado (dedup)', () => {
    expect(isItemDue({ ...base, alreadySent: true })).toBe(false)
  })
  it('não dispara se status != active', () => {
    expect(isItemDue({ ...base, item: { ...base.item, status: 'won' } })).toBe(false)
  })
  it('não dispara sem identifier', () => {
    expect(isItemDue({ ...base, item: { ...base.item, contact: { identifier: null } } })).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/funnel-automations.test.ts`
Expected: FAIL (`isItemDue` não existe).

- [ ] **Step 3: Implementar**

Adicione em `lib/funnel-automations.ts`:

```typescript
export function isItemDue(p: {
  item: { status: string; start_in_step: number; contact: { identifier: string | null } }
  lastMessageAtMs: number
  thresholdSec: number
  alreadySent: boolean
  nowMs: number
}): boolean {
  if (p.item.status !== 'active') return false
  if (!p.item.contact.identifier) return false
  if (p.alreadySent) return false
  const ageSec = p.nowMs / 1000 - p.item.start_in_step
  if (ageSec < p.thresholdSec) return false
  const inactiveSec = (p.nowMs - p.lastMessageAtMs) / 1000
  if (inactiveSec < p.thresholdSec) return false
  return true
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/funnel-automations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/funnel-automations.ts tests/funnel-automations.test.ts
git commit -m "feat(funnel): regra de elegibilidade (idade + inatividade + dedup + status)"
```

---

## Task A5: Dedup + processamento de um item

**Files:**
- Modify: `lib/funnel-automations.ts` (adicionar `wasAlreadySent` e `processFunnelItem`)
- Test: `tests/funnel-automations.test.ts` (adicionar bloco)

- [ ] **Step 1: Escrever o teste falhando**

Adicione ao teste (mock do admin client + quepasa):

```typescript
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn().mockResolvedValue(undefined) }))

const insertMock = vi.fn().mockResolvedValue({ error: null })
const selectChain = {
  select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: insertMock, ...selectChain })),
  })),
}))

import { processFunnelItem } from '@/lib/funnel-automations'

describe('processFunnelItem', () => {
  it('gera msg, envia via quepasa e grava dedup', async () => {
    mockGen.mockResolvedValue({ text: 'Oi, seguimos buscando!' })
    const item = { id: 286, funnel_step_id: 34, start_in_step: 1, amount: '0.0', status: 'active', label_list: [], contact: { identifier: '55x@s.whatsapp.net', phone_number: '+55x', name: 'Leo' }, conversation: { id: 1, display_id: 100, inbox_id: 45 } }
    const inbox = { quepasa_host: 'https://qp', quepasa_token: 't' }
    const r = await processFunnelItem(item as never, 'leads_novos', inbox as never)
    expect(r.sent).toBe(true)
    expect(insertMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/funnel-automations.test.ts`
Expected: FAIL (`processFunnelItem` não existe).

- [ ] **Step 3: Implementar**

Adicione em `lib/funnel-automations.ts`:

```typescript
import { getAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/quepasa'
import { saveMessage } from '@/lib/memory'
import type { FunnelItem } from '@/lib/chatwoot/funnel'

export async function wasAlreadySent(itemId: number, type: StageKey, startInStep: number): Promise<boolean> {
  const db = getAdminClient()
  const { data } = await db.from('funnel_automations_sent')
    .select('id').eq('funnel_item_id', itemId).eq('automation_type', type)
    .eq('start_in_step', startInStep).limit(1)
  return (data?.length ?? 0) > 0
}

export async function lastSentAt(itemId: number, type: StageKey): Promise<number | null> {
  const db = getAdminClient()
  const { data } = await db.from('funnel_automations_sent')
    .select('sent_at').eq('funnel_item_id', itemId).eq('automation_type', type)
    .order('sent_at', { ascending: false }).limit(1)
  const ts = data?.[0]?.sent_at
  return ts ? new Date(ts).getTime() : null
}

export async function processFunnelItem(
  item: FunnelItem, stage: StageKey,
  inbox: { quepasa_host: string | null; quepasa_token: string | null },
): Promise<{ sent: boolean; error?: string; message?: string }> {
  const sessionId = item.contact.identifier
  if (!sessionId) return { sent: false, error: 'no identifier' }
  if (!inbox.quepasa_host || !inbox.quepasa_token) return { sent: false, error: 'no quepasa' }

  try {
    const message = await generateStageMessage(sessionId, stage)
    if (!message || message.length < 5) return { sent: false, error: 'empty message' }

    const recipient = sessionId.replace(/[^\d]/g, '')
    await sendMessage({ host: inbox.quepasa_host, token: inbox.quepasa_token }, recipient, message)
    await saveMessage(sessionId, 'assistant', message)

    const db = getAdminClient()
    await db.from('funnel_automations_sent').insert({
      funnel_item_id: item.id, conversation_id: item.conversation.display_id,
      automation_type: stage, start_in_step: item.start_in_step, message,
    })
    return { sent: true, message }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/funnel-automations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/funnel-automations.ts tests/funnel-automations.test.ts
git commit -m "feat(funnel): dedup + processamento de item (gera, envia, grava)"
```

---

## Task A6: Orquestrador `runFunnelAutomations`

**Files:**
- Modify: `lib/funnel-automations.ts` (adicionar orquestrador)
- Test: cobertura via endpoint na Task A7 (orquestrador é "cola"; testes de unidade já cobrem as peças)

- [ ] **Step 1: Implementar o orquestrador**

Adicione em `lib/funnel-automations.ts`:

```typescript
import { resolveFunnel, listFunnelItems, type ChatwootCfg } from '@/lib/chatwoot/funnel'

const STAGE_BY_SLOT: Record<'start' | 'middle' | 'end', StageKey> = {
  start: 'leads_novos', middle: 'orcamento_enviado', end: 'venda_fechada',
}

function thresholdSecFor(stage: StageKey): number {
  if (stage === 'leads_novos') return parseInt(process.env.FUNNEL_LEADS_NOVOS_HORAS ?? '24', 10) * 3600
  if (stage === 'orcamento_enviado') return parseInt(process.env.FUNNEL_ORCAMENTO_HORAS ?? '24', 10) * 3600
  return parseInt(process.env.FUNNEL_VENDA_FECHADA_DIAS ?? '15', 10) * 86_400
}

async function lastMessageAtMs(identifier: string): Promise<number> {
  const db = getAdminClient()
  const { data } = await db.from('contacts')
    .select('last_message_at').eq('whatsapp_identifier', identifier).maybeSingle()
  const ts = data?.last_message_at
  return ts ? new Date(ts).getTime() : 0
}

export async function runFunnelAutomations(
  cfg: ChatwootCfg,
  inbox: { quepasa_host: string | null; quepasa_token: string | null },
  identifier = process.env.FUNNEL_IDENTIFIER ?? 'amazon_jet_vendas',
  nowMs: number = Date.now(),
): Promise<{ resolved: boolean; checked: number; sent: number }> {
  const funnel = await resolveFunnel(cfg, identifier)
  if (!funnel) return { resolved: false, checked: 0, sent: 0 }

  let checked = 0, sent = 0
  for (const slot of ['start', 'middle', 'end'] as const) {
    const stage = STAGE_BY_SLOT[slot]
    const stepId = funnel.steps[slot]
    const threshold = thresholdSecFor(stage)
    const items = await listFunnelItems(cfg, funnel.funnelId, stepId)

    for (const item of items) {
      checked++
      if (!item.contact.identifier) continue

      // dedup: 'venda_fechada' é recorrente (a cada 15d); as outras são one-shot por entrada
      let alreadySent: boolean
      if (stage === 'venda_fechada') {
        const last = await lastSentAt(item.id, stage)
        alreadySent = last != null && (nowMs - last) < threshold * 1000
      } else {
        alreadySent = await wasAlreadySent(item.id, stage, item.start_in_step)
      }

      const lastMsg = await lastMessageAtMs(item.contact.identifier)
      const due = isItemDue({ item, lastMessageAtMs: lastMsg, thresholdSec: threshold, alreadySent, nowMs })
      if (!due) continue

      const r = await processFunnelItem(item, stage, inbox)
      if (r.sent) sent++
      console.log(`[funnel] item=${item.id} stage=${stage} sent=${r.sent}${r.error ? ` err=${r.error}` : ''}`)
    }
  }
  return { resolved: true, checked, sent }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/funnel-automations.ts
git commit -m "feat(funnel): orquestrador runFunnelAutomations (varre os 3 steps)"
```

---

## Task A7: Endpoint cron + desativar follow-up antigo

**Files:**
- Create: `app/api/cron/funnel-automations/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implementar o endpoint**

```typescript
// app/api/cron/funnel-automations/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { loadInboxByChatwootId } from '@/lib/inboxes'
import { runFunnelAutomations } from '@/lib/funnel-automations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  if (req.headers.get('user-agent')?.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = new URL(req.url).searchParams.get('secret') ?? req.headers.get('authorization')?.replace(/^Bearer /i, '')
  return provided === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const chatwootInboxId = parseInt(process.env.FUNNEL_INBOX_ID ?? '45', 10)
  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox) return NextResponse.json({ error: 'inbox not found' }, { status: 500 })

  const cfg = {
    baseUrl: inbox.chatwoot_base_url,
    accountId: inbox.chatwoot_account_id,
    userToken: inbox.chatwoot_user_token,
  }
  const result = await runFunnelAutomations(cfg, {
    quepasa_host: inbox.quepasa_host, quepasa_token: inbox.quepasa_token,
  })
  console.log(`[cron/funnel] resolved=${result.resolved} checked=${result.checked} sent=${result.sent}`)
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Remover o cron antigo do `vercel.json`**

Substituir o conteúdo de `vercel.json` por (remove o cron `/api/cron/followup`; o funil roda via cron-job.org externo):

```json
{
  "crons": []
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK, rota `/api/cron/funnel-automations` listada.

- [ ] **Step 4: Smoke test local de auth**

Run: `npx vitest run` (garante que nada quebrou)
Expected: todos verdes.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/funnel-automations/route.ts vercel.json
git commit -m "feat(funnel): endpoint cron /api/cron/funnel-automations + remove cron followup antigo"
```

- [ ] **Step 6: Setup pós-deploy (manual, documentar pro usuário)**

No cron-job.org (conta já usada), criar job: `GET https://<app>/api/cron/funnel-automations?secret=<CRON_SECRET>` a cada 3h. Confirmar 1ª execução retorna `{resolved:true,...}`.

---

# PARTE B — SLA 15min (takeover)

## Task B1: QStash — publish genérico + `scheduleSlaTakeover`

**Files:**
- Modify: `lib/qstash.ts`
- Test: `tests/sla-takeover.test.ts` (parte 1)

- [ ] **Step 1: Escrever o teste falhando**

```typescript
// tests/sla-takeover.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scheduleSlaTakeover } from '@/lib/qstash'

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.QSTASH_TOKEN = 'qt'
  process.env.APP_URL = 'https://app.example.com'
  process.env.CRON_SECRET = 'sec'
  process.env.QSTASH_URL = 'https://qstash.example.com'
})

describe('scheduleSlaTakeover', () => {
  it('publica no QStash com delay e callback pro /api/sla-takeover', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => '' } as Response)
    await scheduleSlaTakeover('sess@x', '2026-06-24T00:00:00Z', 900, { conversationId: 100, chatwootInboxId: 45 })
    const [url, opts] = spy.mock.calls[0]
    expect(String(url)).toContain('/v2/publish/https://app.example.com/api/sla-takeover?secret=sec')
    expect((opts as RequestInit).headers).toMatchObject({ 'Upstash-Delay': '900s' })
    expect(JSON.parse((opts as RequestInit).body as string)).toMatchObject({ sessionId: 'sess@x', conversationId: 100 })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sla-takeover.test.ts`
Expected: FAIL (`scheduleSlaTakeover` não existe).

- [ ] **Step 3: Refatorar `lib/qstash.ts`**

Substituir o corpo de `scheduleDrain` por um publish genérico e adicionar a nova função. Conteúdo completo do arquivo:

```typescript
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sla-takeover.test.ts tests/webhook.test.ts`
Expected: PASS (a refatoração mantém `scheduleDrain` igual; webhook tests seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add lib/qstash.ts tests/sla-takeover.test.ts
git commit -m "refactor(qstash): publish genérico + scheduleSlaTakeover"
```

---

## Task B2: `runAgent` com opção `saveUserMessage`

**Files:**
- Modify: `lib/agent.ts`
- Test: `tests/agent.test.ts` (adicionar 1 teste)

- [ ] **Step 1: Escrever o teste falhando**

Adicione em `tests/agent.test.ts`:

```typescript
it('saveUserMessage:false → não salva a msg do user, mas salva o assistant', async () => {
  mockLoadHistory.mockResolvedValue([])
  mockGenerate.mockResolvedValue({ text: 'resp' })
  await runAgent('s', 'nudge interno', 'P', 'sk', 'gpt-4o-mini', undefined, [], { saveUserMessage: false })
  expect(mockSaveMessage).not.toHaveBeenCalledWith('s', 'user', 'nudge interno')
  expect(mockSaveMessage).toHaveBeenCalledWith('s', 'assistant', 'resp')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/agent.test.ts`
Expected: FAIL (runAgent ignora o 8º arg → salva o user mesmo assim).

- [ ] **Step 3: Implementar**

Em `lib/agent.ts`, mudar a assinatura e o save final:

```typescript
// assinatura: adicionar último parâmetro
export async function runAgent(
  sessionId: string,
  userMessage: string,
  systemPrompt: string,
  openaiApiKey: string,
  openaiModel: string,
  tools?: Record<string, unknown>,
  currentLabels: string[] = [],
  opts: { saveUserMessage?: boolean } = {},
): Promise<string> {
```

E no final, trocar o save do user:

```typescript
  if (opts.saveUserMessage !== false) {
    await saveMessage(sessionId, 'user', userMessage)
  }
  await saveMessage(sessionId, 'assistant', text)
  return text
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/agent.test.ts`
Expected: PASS (todos, incluindo os do safety net).

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts tests/agent.test.ts
git commit -m "feat(agent): runAgent aceita saveUserMessage:false (pro takeover/nudge)"
```

---

## Task B3: Extrair `buildAgentTools` de `process-incoming.ts`

**Files:**
- Modify: `lib/process-incoming.ts`

> Objetivo: as tools (add_label/remove_label/validate_part_number/extract_part_numbers/envia_pn) hoje são montadas dentro de `processIncomingMessage`. Extrair pra uma função exportada reutilizável pelo takeover, SEM mudar o comportamento atual.

- [ ] **Step 1: Extrair a função**

Em `lib/process-incoming.ts`, criar a função exportada (mover o objeto `tools` pra dentro dela). Assinatura:

```typescript
export function buildAgentTools(params: {
  inbox: InboxConfig
  conversationId: number
  contactId: string
  senderName: string | null
  senderPhone: string | null
  chatwootCfg: { baseUrl: string; accountId: number; userToken: string }
  initialLabels: string[]
}): { tools: Record<string, unknown>; getLabels: () => string[] } {
  let labelsState = [...params.initialLabels]
  const { inbox, conversationId, contactId, senderName, senderPhone, chatwootCfg } = params
  const labelEnum = z.enum(BUSINESS_LABELS)
  const tools = {
    /* ...mover aqui EXATAMENTE os 5 tools que hoje estão em processIncomingMessage,
       trocando referências a `contact.id` por `contactId` e mantendo o resto igual... */
  }
  return { tools, getLabels: () => labelsState }
}
```

Depois, em `processIncomingMessage`, substituir a construção inline por:

```typescript
  const { tools, getLabels } = buildAgentTools({
    inbox, conversationId, contactId: contact.id,
    senderName, senderPhone, chatwootCfg, initialLabels: labelsState,
  })
  // ...
  const reply = await runAgent(sessionId, content, inbox.system_prompt, openai.apiKey, openai.model, tools, getLabels())
  // após o envio, onde hoje usa labelsState pra re-adicionar atendimento_ia, usar getLabels()
```

> Atenção: hoje `labelsState` é lido depois do `runAgent` pra re-adicionar `atendimento_ia`. Trocar por `getLabels()`. Manter toda a lógica de envio (QuePasa/Chatwoot) e o `addLabel(SYSTEM_LABEL)` final.

- [ ] **Step 2: Rodar a suíte inteira (garante que nada quebrou)**

Run: `npx vitest run`
Expected: todos verdes (o comportamento é idêntico; é refactor).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/process-incoming.ts
git commit -m "refactor(process-incoming): extrai buildAgentTools (reuso no takeover)"
```

---

## Task B4: Helpers de checagem da SLA (memória pós-timestamp)

**Files:**
- Create: `lib/sla-takeover.ts` (parte 1)
- Test: `tests/sla-takeover.test.ts` (adicionar bloco)

- [ ] **Step 1: Escrever o teste falhando**

Adicione em `tests/sla-takeover.test.ts`:

```typescript
const memRows: Array<{ message: { type: string; content: string }; created_at: string }> = []
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockResolvedValue({ data: memRows, error: null }),
    })),
  })),
}))

import { classifyActivitySince } from '@/lib/sla-takeover'

describe('classifyActivitySince', () => {
  it('detecta resposta humana ([atendente]:)', () => {
    expect(classifyActivitySince([{ type: 'human', content: '[atendente]: oi' }])).toBe('responded')
  })
  it('detecta resposta da IA', () => {
    expect(classifyActivitySince([{ type: 'ai', content: 'oi' }])).toBe('responded')
  })
  it('detecta nova mensagem do cliente (sem prefixo)', () => {
    expect(classifyActivitySince([{ type: 'human', content: 'mais uma duvida' }])).toBe('newer_inbound')
  })
  it('nada novo → silent', () => {
    expect(classifyActivitySince([])).toBe('silent')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sla-takeover.test.ts`
Expected: FAIL (`classifyActivitySince` não existe).

- [ ] **Step 3: Implementar**

```typescript
// lib/sla-takeover.ts
import { getAdminClient } from '@/lib/supabase/admin'

type Activity = 'responded' | 'newer_inbound' | 'silent'

export function classifyActivitySince(
  rows: Array<{ type: string; content: string }>,
): Activity {
  let newerInbound = false
  for (const r of rows) {
    const isAtendente = r.type === 'human' && r.content.startsWith('[atendente]:')
    if (r.type === 'ai' || isAtendente) return 'responded'
    if (r.type === 'human') newerInbound = true
  }
  return newerInbound ? 'newer_inbound' : 'silent'
}

export async function activitySince(sessionId: string, sinceAt: string): Promise<Activity> {
  const db = getAdminClient()
  const { data } = await db.from('memory_chat_amazon_jet')
    .select('message, created_at').eq('session_id', sessionId).gt('created_at', sinceAt)
  const rows = (data ?? []).map((r: { message: { type: string; content: string } }) => r.message)
  return classifyActivitySince(rows)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sla-takeover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sla-takeover.ts tests/sla-takeover.test.ts
git commit -m "feat(sla): classifyActivitySince + activitySince (detecta resposta/nova msg)"
```

---

## Task B5: `checkAndTakeover`

**Files:**
- Modify: `lib/sla-takeover.ts`
- Test: `tests/sla-takeover.test.ts` (adicionar bloco)

- [ ] **Step 1: Escrever o teste falhando**

```typescript
vi.mock('@/lib/inboxes', () => ({
  loadInboxByChatwootId: vi.fn().mockResolvedValue({
    id: 'ix', chatwoot_base_url: 'https://c', chatwoot_account_id: 14, chatwoot_user_token: 'tk',
    quepasa_host: 'https://qp', quepasa_token: 't', system_prompt: 'P', enabled: true,
  }),
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' }),
}))
vi.mock('@/lib/tags', () => ({ addLabel: vi.fn().mockResolvedValue(['atendimento_ia']), removeLabel: vi.fn() }))
vi.mock('@/lib/agent', () => ({ runAgent: vi.fn().mockResolvedValue('Oi, assumindo!') }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))
vi.mock('@/lib/process-incoming', () => ({ buildAgentTools: vi.fn(() => ({ tools: {}, getLabels: () => [] })) }))

import { checkAndTakeover } from '@/lib/sla-takeover'
import { runAgent } from '@/lib/agent'

it('NÃO assume se houve resposta', async () => {
  memRows.length = 0; memRows.push({ message: { type: 'human', content: '[atendente]: ja respondi' }, created_at: 'x' })
  const r = await checkAndTakeover({ sessionId: 's@x', sinceAt: '2026-06-24T00:00:00Z', conversationId: 100, chatwootInboxId: 45 })
  expect(r.action).toBe('skipped_responded')
  expect(runAgent).not.toHaveBeenCalled()
})

it('assume quando silencioso: roda agente com saveUserMessage:false', async () => {
  memRows.length = 0
  const r = await checkAndTakeover({ sessionId: 's@x', sinceAt: '2026-06-24T00:00:00Z', conversationId: 100, chatwootInboxId: 45 })
  expect(r.action).toBe('took_over')
  expect(runAgent).toHaveBeenCalled()
  expect((runAgent as ReturnType<typeof vi.fn>).mock.calls[0][7]).toMatchObject({ saveUserMessage: false })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/sla-takeover.test.ts`
Expected: FAIL (`checkAndTakeover` não existe).

- [ ] **Step 3: Implementar**

Adicione em `lib/sla-takeover.ts`:

```typescript
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { addLabel } from '@/lib/tags'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { buildAgentTools } from '@/lib/process-incoming'
import { SYSTEM_LABEL } from '@/lib/types'

const TAKEOVER_NUDGE =
  '[INSTRUÇÃO INTERNA: o cliente está aguardando resposta há 15 min e o vendedor humano não retornou. ' +
  'Assuma o atendimento AGORA e responda com base em TODO o histórico, inclusive o que o vendedor [atendente] já falou. ' +
  'Nunca contradiga nem repita o que o vendedor disse. Só a mensagem pronta pro cliente.]'

export async function checkAndTakeover(p: {
  sessionId: string; sinceAt: string; conversationId: number; chatwootInboxId: number
}): Promise<{ action: 'skipped_responded' | 'skipped_newer' | 'took_over' | 'error'; error?: string }> {
  const activity = await activitySince(p.sessionId, p.sinceAt)
  if (activity === 'responded') return { action: 'skipped_responded' }
  if (activity === 'newer_inbound') return { action: 'skipped_newer' }

  try {
    const inbox = await loadInboxByChatwootId(p.chatwootInboxId)
    if (!inbox || !inbox.enabled) return { action: 'error', error: 'inbox unavailable' }

    const chatwootCfg = {
      baseUrl: inbox.chatwoot_base_url, accountId: inbox.chatwoot_account_id, userToken: inbox.chatwoot_user_token,
    }
    const db = getAdminClient()
    const { data: contact } = await db.from('contacts')
      .select('id, current_labels').eq('whatsapp_identifier', p.sessionId).maybeSingle()
    if (!contact) return { action: 'error', error: 'contact not found' }

    // Re-ativa a IA: re-adiciona atendimento_ia + status='ia'
    const labels = await addLabel(chatwootCfg, p.conversationId, contact.current_labels ?? [], SYSTEM_LABEL)
    await db.from('contacts').update({ current_labels: labels, status: 'ia' }).eq('id', contact.id)

    const { tools, getLabels } = buildAgentTools({
      inbox, conversationId: p.conversationId, contactId: contact.id,
      senderName: null, senderPhone: null, chatwootCfg, initialLabels: labels,
    })
    const openai = await loadOpenAIConfig()
    const reply = await runAgent(
      p.sessionId, TAKEOVER_NUDGE, inbox.system_prompt, openai.apiKey, openai.model,
      tools, getLabels(), { saveUserMessage: false },
    )
    const recipient = p.sessionId.replace(/[^\d]/g, '')
    if (inbox.quepasa_host && inbox.quepasa_token) {
      await sendMessage({ host: inbox.quepasa_host, token: inbox.quepasa_token }, recipient, reply)
    }
    return { action: 'took_over' }
  } catch (err) {
    return { action: 'error', error: (err as Error).message }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/sla-takeover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sla-takeover.ts tests/sla-takeover.test.ts
git commit -m "feat(sla): checkAndTakeover (re-ativa IA + responde se silencioso)"
```

---

## Task B6: Endpoint `/api/sla-takeover`

**Files:**
- Create: `app/api/sla-takeover/route.ts`

- [ ] **Step 1: Implementar (espelha process-pending)**

```typescript
// app/api/sla-takeover/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { checkAndTakeover } from '@/lib/sla-takeover'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: { sessionId?: string; sinceAt?: string; conversationId?: number; chatwootInboxId?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const { sessionId, sinceAt, conversationId, chatwootInboxId } = body
  if (!sessionId || !sinceAt || !conversationId || !chatwootInboxId) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }
  const r = await checkAndTakeover({ sessionId, sinceAt, conversationId, chatwootInboxId })
  console.log(`[sla-takeover] ${sessionId} → ${r.action}${r.error ? ` (${r.error})` : ''}`)
  return NextResponse.json({ ok: true, ...r })
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build OK, rota `/api/sla-takeover` listada.

- [ ] **Step 3: Commit**

```bash
git add app/api/sla-takeover/route.ts
git commit -m "feat(sla): endpoint POST /api/sla-takeover (chamado pelo QStash)"
```

---

## Task B7: Agendar a SLA no branch de handoff

**Files:**
- Modify: `lib/process-incoming.ts`
- Test: `tests/process-incoming-sla.test.ts` (novo, focado)

- [ ] **Step 1: Escrever o teste falhando**

```typescript
// tests/process-incoming-sla.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const scheduleSla = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/qstash', () => ({ isQStashEnabled: vi.fn(() => true), scheduleSlaTakeover: scheduleSla, scheduleDrain: vi.fn() }))
vi.mock('@/lib/contacts', () => ({
  upsertContact: vi.fn().mockResolvedValue({ contact: { id: 'c1', current_labels: [] }, wasNew: false }),
  updateContactLabels: vi.fn(),
}))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn().mockResolvedValue([]), saveMessage: vi.fn() }))
vi.mock('@/lib/agent', () => ({ runAgent: vi.fn() }))

import { processIncomingMessage } from '@/lib/process-incoming'

beforeEach(() => vi.clearAllMocks())

it('handoff (sem atendimento_ia, não novo) → agenda SLA takeover e NÃO responde', async () => {
  const inbox = { id: 'ix', system_prompt: 'P', quepasa_host: 'h', quepasa_token: 't', chatwoot_base_url: 'b', chatwoot_account_id: 14, chatwoot_user_token: 'tk' }
  const ctx = { chatwootInboxId: 45, conversationId: 100, sessionId: 's@x', senderName: null, senderPhone: null, senderIdent: 's@x', chatId: '55', chatwootContactId: 1, labels: [] }
  await processIncomingMessage(inbox as never, ctx as never, 'oi tem essa peça?')
  expect(scheduleSla).toHaveBeenCalledWith('s@x', expect.any(String), 900, { conversationId: 100, chatwootInboxId: 45 })
})
```

> Nota: `SLA_TAKEOVER_MIN=15` → 900s. Se quiser, set `process.env.SLA_TAKEOVER_MIN` no teste e ajuste o número.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/process-incoming-sla.test.ts`
Expected: FAIL (não agenda nada hoje; só dá `return`).

- [ ] **Step 3: Implementar**

Em `lib/process-incoming.ts`, no branch de handoff (hoje):

```typescript
  const hasAtendimentoIA = labels.includes(SYSTEM_LABEL)
  if (!hasAtendimentoIA && !wasNew) {
    console.log(`[process] handoff: humano assumiu conversation=${conversationId}`)
    // SLA: se ninguém responder em N min, a IA assume (Parte B do spec)
    const slaEnabled = (process.env.SLA_TAKEOVER_ENABLED ?? 'true') === 'true'
    if (slaEnabled && isQStashEnabled()) {
      const min = parseInt(process.env.SLA_TAKEOVER_MIN ?? '15', 10)
      try {
        await scheduleSlaTakeover(sessionId, new Date().toISOString(), min * 60, { conversationId, chatwootInboxId: inbox.chatwoot_inbox_id })
      } catch (err) {
        console.warn(`[process] scheduleSlaTakeover falhou:`, err)
      }
    }
    return
  }
```

E adicionar os imports no topo:

```typescript
import { isQStashEnabled, scheduleSlaTakeover } from '@/lib/qstash'
```

> `inbox.chatwoot_inbox_id` existe em `InboxConfig` (é o id da inbox no Chatwoot). Confirmar o nome do campo em `lib/types.ts` (`InboxConfig`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/process-incoming-sla.test.ts`
Expected: PASS.

- [ ] **Step 5: Suíte completa + build**

Run: `npx vitest run && npm run build`
Expected: tudo verde, build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/process-incoming.ts tests/process-incoming-sla.test.ts
git commit -m "feat(sla): agenda takeover +15min no handoff (QStash)"
```

---

## Pós-implementação

- [ ] **Env vars (Vercel):** `FUNNEL_IDENTIFIER=amazon_jet_vendas`, `FUNNEL_INBOX_ID=45`, `FUNNEL_LEADS_NOVOS_HORAS=24`, `FUNNEL_ORCAMENTO_HORAS=24`, `FUNNEL_VENDA_FECHADA_DIAS=15`, `SLA_TAKEOVER_MIN=15`, `SLA_TAKEOVER_ENABLED=true`.
- [ ] **cron-job.org:** job GET `/api/cron/funnel-automations?secret=<CRON_SECRET>` a cada 3h.
- [ ] **Memória:** atualizar `handoff-silence-intentional.md` registrando a exceção de SLA de 15 min.
- [ ] **Deploy + smoke test:** mover um card no funil e validar; mandar msg num chat com humano e esperar 15 min (ou baixar `SLA_TAKEOVER_MIN` temporariamente pra testar).

## Self-review (preenchido)

- **Cobertura do spec:** §3-8 → Parte A (A2-A7). §12 (SLA) → Parte B (B1-B7). §6 dedup → A1+A5. §9 reconciliação → A7 (remove cron antigo). ✔
- **Placeholders:** Task B3 descreve o move dos 5 tools "exatamente" (é refactor de código existente, não código novo) — aceitável; o executor copia o bloco atual. Resto tem código completo. ✔
- **Consistência de tipos:** `FunnelItem`, `StageKey`, `ChatwootCfg`, `checkAndTakeover` params usados igual entre tasks. ✔
