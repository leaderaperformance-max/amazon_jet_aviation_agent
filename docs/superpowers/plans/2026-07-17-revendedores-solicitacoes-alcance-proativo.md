# Revendedores, Solicitações e Alcance Proativo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a IA reconhecer cotações encaminhadas por consultores (revendedores), confirmar o cliente final, dar a cada cotação um ID único (`#0001`) que nunca duplica no grupo (sempre a última, uma vez só), e — no caso do revendedor — alcançar o cliente proativamente citando o consultor e semeando o contexto na memória.

**Architecture:** Híbrido IA + banco. A IA lê o contexto e monta a cotação atual; a tabela `solicitacoes` (Postgres) é a trava determinística que decide liberar/bloquear o disparo no grupo. Detecção de revendedor por lista de números (`resellers`). Alcance proativo via API do Chatwoot (com fallback QuePasa). Tudo em cima da `main` atual (com os fixes de segurança), em branch nova `feat/revendedores-solicitacoes`.

**Tech Stack:** Next.js 14, TypeScript, Supabase (Postgres), Vercel AI SDK (`ai` v6 / gpt-4o-mini), QuePasa, Chatwoot API, Vitest.

**Base / branch:** partir de `main` (limpa). A `feat/qualif-ciclo-cotacao` (AOG/motor + `quote_sessions`) fica independente; esta feature **re-deriva** o que precisa da `quote_sessions` como `solicitacoes`. Manter urgência de 2 níveis (`AOG`/`rotina`) da main — os 3 níveis são da outra feature.

**Fases:** **Fase A** (Tasks 1–9) entrega anti-duplicação + revendedor + ID e é deployável sozinha. **Fase B** (Tasks 10–13) adiciona o alcance proativo + memória. Aplicar migrations em prod e deploy só quando o usuário aprovar (repo faz auto-deploy da `main`).

---

## Setup: branch

- [ ] **Criar a branch a partir da main**

Run:
```bash
git checkout main && git pull --ff-only
git checkout -b feat/revendedores-solicitacoes
```

---

# FASE A — Anti-duplicação + Revendedor + ID

## Task 1: Normalização de telefone (`lib/phone.ts`)

**Files:**
- Create: `lib/phone.ts`
- Test: `tests/phone.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/phone.test.ts
import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/lib/phone'

describe('normalizePhone', () => {
  it('mantém só dígitos', () => {
    expect(normalizePhone('+55 (95) 99172-0919')).toBe('5595991720919')
  })
  it('trata null/undefined/vazio', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('   ')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/phone.test.ts`
Expected: FAIL (`Cannot find module '@/lib/phone'`).

- [ ] **Step 3: Implementar**

```ts
// lib/phone.ts
/** Normaliza um número de telefone mantendo apenas dígitos. Ex.: "+55 (95) 99172-0919" → "5595991720919". */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/phone.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/phone.ts tests/phone.test.ts
git commit -m "feat(phone): normalizePhone (só dígitos)"
```

---

## Task 2: Migration `resellers` + módulo `lib/resellers.ts`

**Files:**
- Create: `supabase/migrations/20260717000001_resellers.sql`
- Create: `lib/resellers.ts`
- Test: `tests/resellers.test.ts`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260717000001_resellers.sql
-- Consultores/revendedores parceiros. Uma linha por número (mesma pessoa pode ter vários).
create table if not exists resellers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null unique,   -- normalizado: só dígitos, com DDI/DDD
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_resellers_phone_active on resellers(phone) where active;
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// tests/resellers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { findReseller } from '@/lib/resellers'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

function dbReturning(data: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
          }),
        }),
      }),
    }),
  }
}

describe('findReseller', () => {
  beforeEach(() => vi.clearAllMocks())
  it('acha consultor por número normalizado', async () => {
    mockGet.mockReturnValue(dbReturning({ name: 'Anderson' }))
    expect(await findReseller('+55 (95) 99172-0919')).toEqual({ name: 'Anderson' })
  })
  it('retorna null quando não acha', async () => {
    mockGet.mockReturnValue(dbReturning(null))
    expect(await findReseller('5511999999999')).toBeNull()
  })
  it('retorna null pra número vazio sem bater no banco', async () => {
    expect(await findReseller('')).toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/resellers.test.ts`
Expected: FAIL (`Cannot find module '@/lib/resellers'`).

- [ ] **Step 4: Implementar**

```ts
// lib/resellers.ts
import { getAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/phone'

/** Retorna { name } do consultor se o número estiver cadastrado e ativo, senão null. */
export async function findReseller(rawPhone: string | null | undefined): Promise<{ name: string } | null> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return null
  const db = getAdminClient()
  const { data } = await db
    .from('resellers')
    .select('name')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle()
  return data ? { name: (data as { name: string }).name } : null
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/resellers.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260717000001_resellers.sql lib/resellers.ts tests/resellers.test.ts
git commit -m "feat(resellers): tabela + findReseller por número normalizado"
```

---

## Task 3: Migration `solicitacoes` (+ drop `quote_sessions`)

**Files:**
- Create: `supabase/migrations/20260717000002_solicitacoes.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260717000002_solicitacoes.sql
-- Ciclo de vida da cotação, com ID sequencial legível e chave pelo cliente final.
create sequence if not exists solicitacoes_numero_seq;

create table if not exists solicitacoes (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint not null unique default nextval('solicitacoes_numero_seq'),
  client_phone      text not null,                 -- CHAVE de dedup (cliente final, normalizado)
  client_name       text,
  state             text not null default 'aberta',-- aberta | enviada | fechada
  part_numbers      text[] not null default '{}',
  lead_ids          uuid[] not null default '{}',
  via_reseller      boolean not null default false,
  reseller_name     text,
  reseller_phone    text,
  origin_session_id text not null,                 -- sessão por onde a mensagem chegou
  sent_to_group_at  timestamptz,                   -- null = ainda não disparou no grupo
  opened_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  closed_at         timestamptz
);

-- No máximo 1 solicitação aberta por cliente.
create unique index if not exists uq_solicitacao_aberta on solicitacoes(client_phone) where closed_at is null;

-- quote_sessions foi um precursor não usado em produção (código nunca deployado); substituído por solicitacoes.
drop table if exists quote_sessions;
```

- [ ] **Step 2: Validar sintaxe (não aplicar em prod ainda)**

O arquivo só é aplicado no deploy (Task 14). Conferir visualmente que os nomes de coluna batem com a interface `Solicitacao` da Task 4.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260717000002_solicitacoes.sql
git commit -m "feat(solicitacoes): tabela + sequence + índice único da aberta; drop quote_sessions"
```

---

## Task 4: `lib/solicitacoes.ts` — parte pura (split + formatNumero)

**Files:**
- Create: `lib/solicitacoes.ts`
- Test: `tests/solicitacoes.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/solicitacoes.test.ts
import { describe, it, expect } from 'vitest'
import { splitItemsByQuote, formatNumero } from '@/lib/solicitacoes'

describe('splitItemsByQuote', () => {
  it('separa PN novo do repetido (case-insensitive + trim)', () => {
    const r = splitItemsByQuote(
      [{ part_number: ' abc123 ' }, { part_number: 'XYZ' }],
      ['ABC123'],
    )
    expect(r.repetidos.map(i => i.part_number)).toEqual([' abc123 '])
    expect(r.novos.map(i => i.part_number)).toEqual(['XYZ'])
  })
})

describe('formatNumero', () => {
  it('formata com 4 dígitos', () => {
    expect(formatNumero(1)).toBe('#0001')
    expect(formatNumero(102)).toBe('#0102')
    expect(formatNumero(9999)).toBe('#9999')
  })
  it('cresce pra 5 dígitos naturalmente', () => {
    expect(formatNumero(10000)).toBe('#10000')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/solicitacoes.test.ts`
Expected: FAIL (`Cannot find module '@/lib/solicitacoes'`).

- [ ] **Step 3: Implementar a parte pura**

```ts
// lib/solicitacoes.ts
import { getAdminClient } from '@/lib/supabase/admin'

export interface Solicitacao {
  id: string
  numero: number
  client_phone: string
  client_name: string | null
  state: 'aberta' | 'enviada' | 'fechada'
  part_numbers: string[]
  lead_ids: string[]
  via_reseller: boolean
  reseller_name: string | null
  reseller_phone: string | null
  origin_session_id: string
  sent_to_group_at: string | null
  opened_at: string
  updated_at: string
  closed_at: string | null
}

/** Separa items novos (PN inédito na solicitação) dos repetidos. Case-insensitive + trim. */
export function splitItemsByQuote<T extends { part_number: string }>(
  items: T[], existingPNs: string[],
): { novos: T[]; repetidos: T[] } {
  const norm = (p: string) => p.trim().toUpperCase()
  const set = new Set(existingPNs.map(norm))
  const novos: T[] = []
  const repetidos: T[] = []
  for (const it of items) (set.has(norm(it.part_number)) ? repetidos : novos).push(it)
  return { novos, repetidos }
}

/** Formata o número da solicitação: #0001 (4 dígitos, cresce pra 5 depois de 9999). */
export function formatNumero(numero: number): string {
  return `#${String(numero).padStart(4, '0')}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/solicitacoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/solicitacoes.ts tests/solicitacoes.test.ts
git commit -m "feat(solicitacoes): splitItemsByQuote + formatNumero (parte pura)"
```

---

## Task 5: `lib/solicitacoes.ts` — `decideDispatch` (regra de disparo, pura)

**Files:**
- Modify: `lib/solicitacoes.ts`
- Test: `tests/solicitacoes.test.ts` (adicionar)

- [ ] **Step 1: Adicionar os testes que falham**

```ts
// adicionar em tests/solicitacoes.test.ts
import { decideDispatch } from '@/lib/solicitacoes'

describe('decideDispatch', () => {
  const items = [{ part_number: 'ABC' }, { part_number: 'XYZ' }]
  it('primeira vez (não enviada) → enviada, todos os itens contam', () => {
    const r = decideDispatch({ sent_to_group_at: null, part_numbers: [] }, items)
    expect(r.action).toBe('enviada')
    expect(r.novos).toHaveLength(2)
  })
  it('já enviada + item novo → atualizada (só os novos)', () => {
    const r = decideDispatch({ sent_to_group_at: '2026-07-17T00:00:00Z', part_numbers: ['ABC'] }, items)
    expect(r.action).toBe('atualizada')
    expect(r.novos.map(i => i.part_number)).toEqual(['XYZ'])
  })
  it('já enviada + tudo repetido → possivel_duplicata (não dispara)', () => {
    const r = decideDispatch({ sent_to_group_at: '2026-07-17T00:00:00Z', part_numbers: ['ABC', 'XYZ'] }, items)
    expect(r.action).toBe('possivel_duplicata')
    expect(r.novos).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/solicitacoes.test.ts`
Expected: FAIL (`decideDispatch is not exported`).

- [ ] **Step 3: Implementar**

```ts
// adicionar em lib/solicitacoes.ts (abaixo de formatNumero)
export type DispatchAction = 'enviada' | 'atualizada' | 'possivel_duplicata'

/** Decide o que fazer com a solicitação dado o lote de items. Pura. */
export function decideDispatch<T extends { part_number: string }>(
  sol: { sent_to_group_at: string | null; part_numbers: string[] },
  items: T[],
): { action: DispatchAction; novos: T[] } {
  const { novos } = splitItemsByQuote(items, sol.part_numbers)
  if (!sol.sent_to_group_at) return { action: 'enviada', novos: items } // 1ª vez: tudo conta
  if (novos.length > 0) return { action: 'atualizada', novos }
  return { action: 'possivel_duplicata', novos: [] }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/solicitacoes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/solicitacoes.ts tests/solicitacoes.test.ts
git commit -m "feat(solicitacoes): decideDispatch (enviada/atualizada/possivel_duplicata)"
```

---

## Task 6: `lib/solicitacoes.ts` — funções de banco

**Files:**
- Modify: `lib/solicitacoes.ts`
- Test: `tests/solicitacoes-db.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/solicitacoes-db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))
import { getOpenSolicitacao, openSolicitacao } from '@/lib/solicitacoes'
import { getAdminClient } from '@/lib/supabase/admin'
const mockGet = getAdminClient as ReturnType<typeof vi.fn>

const fresh = {
  id: 's1', numero: 1, client_phone: '55', client_name: null, state: 'aberta',
  part_numbers: [], lead_ids: [], via_reseller: false, reseller_name: null,
  reseller_phone: null, origin_session_id: '55', sent_to_group_at: null,
  opened_at: '2026-07-17T00:00:00Z', updated_at: '2026-07-17T00:00:00Z', closed_at: null,
}

function selectChain(data: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
            }),
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  }
}

describe('getOpenSolicitacao', () => {
  beforeEach(() => vi.clearAllMocks())
  it('retorna a aberta quando recente', async () => {
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue(selectChain(fresh)) })
    const now = new Date('2026-07-17T01:00:00Z').getTime()
    expect(await getOpenSolicitacao('55', now)).toMatchObject({ id: 's1' })
  })
  it('fecha e retorna null quando parada > 48h', async () => {
    const chain = selectChain(fresh)
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue(chain) })
    const now = new Date('2026-07-20T00:00:00Z').getTime() // +72h
    expect(await getOpenSolicitacao('55', now)).toBeNull()
    expect(chain.update).toHaveBeenCalled()
  })
})

describe('openSolicitacao', () => {
  beforeEach(() => vi.clearAllMocks())
  it('insere e retorna a solicitação criada', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...fresh, numero: 7 }, error: null })
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
    mockGet.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) })
    const s = await openSolicitacao({ clientPhone: '55', originSessionId: '55' })
    expect(s.numero).toBe(7)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ client_phone: '55', origin_session_id: '55' }))
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/solicitacoes-db.test.ts`
Expected: FAIL (`getOpenSolicitacao is not exported`).

- [ ] **Step 3: Implementar as funções de banco**

```ts
// adicionar em lib/solicitacoes.ts
const IDLE_MS = () => parseInt(process.env.QUOTE_IDLE_HOURS ?? '48', 10) * 3600 * 1000

export async function getOpenSolicitacao(clientPhone: string, nowMs: number = Date.now()): Promise<Solicitacao | null> {
  const db = getAdminClient()
  const { data } = await db.from('solicitacoes')
    .select('*').eq('client_phone', clientPhone).is('closed_at', null)
    .order('opened_at', { ascending: false }).limit(1).maybeSingle()
  const s = data as Solicitacao | null
  if (!s) return null
  if (nowMs - new Date(s.updated_at).getTime() > IDLE_MS()) {
    await closeSolicitacao(s.id)
    return null
  }
  return s
}

export interface OpenSolicitacaoInput {
  clientPhone: string
  clientName?: string | null
  originSessionId: string
  viaReseller?: boolean
  resellerName?: string | null
  resellerPhone?: string | null
}

export async function openSolicitacao(input: OpenSolicitacaoInput): Promise<Solicitacao> {
  const db = getAdminClient()
  const { data, error } = await db.from('solicitacoes').insert({
    client_phone: input.clientPhone,
    client_name: input.clientName ?? null,
    origin_session_id: input.originSessionId,
    via_reseller: input.viaReseller ?? false,
    reseller_name: input.resellerName ?? null,
    reseller_phone: input.resellerPhone ?? null,
  }).select().single()
  if (error) throw error
  return data as Solicitacao
}

export async function addToSolicitacao(id: string, pns: string[], leadIds: string[]): Promise<void> {
  const db = getAdminClient()
  const { data } = await db.from('solicitacoes').select('part_numbers, lead_ids').eq('id', id).maybeSingle()
  const cur = data as { part_numbers: string[]; lead_ids: string[] } | null
  const part_numbers = Array.from(new Set([...(cur?.part_numbers ?? []), ...pns]))
  const lead_ids = Array.from(new Set([...(cur?.lead_ids ?? []), ...leadIds]))
  await db.from('solicitacoes')
    .update({ part_numbers, lead_ids, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function markSent(id: string): Promise<void> {
  await getAdminClient().from('solicitacoes').update({
    state: 'enviada', sent_to_group_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function closeSolicitacao(id: string): Promise<void> {
  await getAdminClient().from('solicitacoes')
    .update({ state: 'fechada', closed_at: new Date().toISOString() }).eq('id', id)
}
```

> Nota: `addToSolicitacao`/`markSent`/`closeSolicitacao` usam um encadeamento `.update().eq()` diferente do `selectChain` do teste; os testes cobrem `getOpenSolicitacao` e `openSolicitacao`. As demais são exercitadas na integração (Task 9/13).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/solicitacoes-db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/solicitacoes.ts tests/solicitacoes-db.test.ts
git commit -m "feat(solicitacoes): funções de banco (get/open/add/markSent/close)"
```

---

## Task 7: Mensagem do grupo com ID + linha do consultor (`lib/quote-messages.ts`)

**Files:**
- Create: `lib/quote-messages.ts`
- Test: `tests/quote-messages.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/quote-messages.test.ts
import { describe, it, expect } from 'vitest'
import { buildGroupMessage } from '@/lib/quote-messages'

const base = {
  numero: 102, channelLabel: 'WhatsApp', clientName: 'João', clientPhone: '5595999',
  urgency: 'AOG', items: [{ part_number: 'ABC', quantity: '2' }],
  chatwootUrl: 'https://cw/x',
}

describe('buildGroupMessage', () => {
  it('primeira vez usa 🆕 SOLICITAÇÃO #0102', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada' })
    expect(m).toContain('🆕 *SOLICITAÇÃO #0102*')
    expect(m).toContain('👤 *Cliente:* João')
  })
  it('atualização usa 🔄 ATUALIZAÇÃO #0102', () => {
    const m = buildGroupMessage({ ...base, action: 'atualizada' })
    expect(m).toContain('🔄 *ATUALIZAÇÃO #0102*')
  })
  it('inclui "via consultor" quando houver reseller', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada', resellerName: 'Anderson' })
    expect(m).toContain('🤝 *via consultor:* Anderson')
  })
  it('omite "via consultor" quando não houver', () => {
    const m = buildGroupMessage({ ...base, action: 'enviada' })
    expect(m).not.toContain('via consultor')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/quote-messages.test.ts`
Expected: FAIL (`Cannot find module '@/lib/quote-messages'`).

- [ ] **Step 3: Implementar**

```ts
// lib/quote-messages.ts
import { formatNumero } from '@/lib/solicitacoes'

export interface QuoteItem { part_number: string; quantity: string; notes?: string }

export function buildGroupMessage(input: {
  action: 'enviada' | 'atualizada'
  numero: number
  channelLabel: string
  clientName: string | null
  clientPhone: string | null
  urgency: string
  items: QuoteItem[]
  generalNotes?: string | null
  resellerName?: string | null
  sheetUrl?: string | null
  chatwootUrl: string
}): string {
  const header = input.action === 'enviada'
    ? `🆕 *SOLICITAÇÃO ${formatNumero(input.numero)}*`
    : `🔄 *ATUALIZAÇÃO ${formatNumero(input.numero)}*`
  const urgencyEmoji = input.urgency === 'AOG' ? '🔴' : '🟡'
  const itemsBlock = input.items.length === 1
    ? `🔧 *Part Number:* ${input.items[0].part_number}\n🔢 *Quantidade:* ${input.items[0].quantity}${input.items[0].notes ? `\n📝 ${input.items[0].notes}` : ''}`
    : `📋 *ITENS (${input.items.length}):*\n` + input.items.map((it, i) => `  ${i + 1}. ${it.part_number} — Qtd: ${it.quantity}${it.notes ? ` (${it.notes})` : ''}`).join('\n')
  return [
    header, '',
    `📡 *Origem:* ${input.channelLabel}`,
    `👤 *Cliente:* ${input.clientName ?? '(sem nome)'}`,
    input.clientPhone ? `📱 *WhatsApp:* ${input.clientPhone}` : null,
    input.resellerName ? `🤝 *via consultor:* ${input.resellerName}` : null,
    `⚡ *Urgência:* ${input.urgency} ${urgencyEmoji}`, '',
    itemsBlock, '',
    input.generalNotes ? `📝 _${input.generalNotes}_` : null,
    input.sheetUrl ? `📊 *Planilha:* ${input.sheetUrl}` : null,
    '', '🔗 Atender em:', input.chatwootUrl,
  ].filter(Boolean).join('\n')
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/quote-messages.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/quote-messages.ts tests/quote-messages.test.ts
git commit -m "feat(quote-messages): mensagem do grupo com #ID + linha do consultor"
```

---

## Task 8: Diretivas do agente (revendedor + contexto de solicitação) em `lib/agent.ts`

**Files:**
- Modify: `lib/agent.ts` (assinatura de `runAgent` opts + montagem do system)
- Create: `lib/agent-directives.ts`
- Test: `tests/agent-directives.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/agent-directives.test.ts
import { describe, it, expect } from 'vitest'
import { buildResellerDirective, buildQuoteContextDirective } from '@/lib/agent-directives'

describe('buildResellerDirective', () => {
  it('instrui a pedir e confirmar nome+número do cliente', () => {
    const d = buildResellerDirective('Anderson')
    expect(d).toContain('Anderson')
    expect(d.toLowerCase()).toContain('nome')
    expect(d.toLowerCase()).toContain('número')
    expect(d).toContain('client_name')
    expect(d).toContain('client_phone')
  })
})

describe('buildQuoteContextDirective', () => {
  it('injeta origem consultor + PNs já recebidos + #ID', () => {
    const d = buildQuoteContextDirective({ numero: 102, resellerName: 'Anderson', partNumbers: ['ABC', 'XYZ'] })
    expect(d).toContain('#0102')
    expect(d).toContain('Anderson')
    expect(d).toContain('ABC')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/agent-directives.test.ts`
Expected: FAIL (`Cannot find module '@/lib/agent-directives'`).

- [ ] **Step 3: Implementar as diretivas**

```ts
// lib/agent-directives.ts
import { formatNumero } from '@/lib/solicitacoes'

/** Diretiva quando a mensagem vem de um CONSULTOR/REVENDEDOR encaminhando cotação de cliente. */
export function buildResellerDirective(resellerName: string): string {
  return `\n\n---\n\n## 🤝 ORIGEM: CONSULTOR/REVENDEDOR (${resellerName})\n\nEsta conversa é com um CONSULTOR (${resellerName}) que está REPASSANDO a cotação de um CLIENTE dele — não é o cliente final.\n\n**Antes de enviar a cotação ao grupo, você DEVE:**\n1. Processar/ler os Part Numbers normalmente.\n2. PEDIR e CONFIRMAR o **nome** e o **número** do CLIENTE FINAL: "Me confirma o nome e o número do cliente pra eu registrar a cotação?"\n3. Só chame \`envia_pn\` DEPOIS de ter o nome+número do cliente, passando-os em \`client_name\` e \`client_phone\`.\n4. Se o consultor NÃO passar o nome+número, NÃO chame \`envia_pn\` — peça de novo, gentil.\n\nNUNCA envie a cotação ao grupo com os dados do consultor no lugar do cliente.`
}

/** Diretiva com o estado da solicitação aberta do cliente (pra IA atender com contexto). */
export function buildQuoteContextDirective(input: { numero: number; resellerName: string | null; partNumbers: string[] }): string {
  const origem = input.resellerName
    ? `Este lead foi encaminhado pelo consultor ${input.resellerName}.`
    : `Este cliente já tem uma solicitação em aberto.`
  const pns = input.partNumbers.length ? input.partNumbers.join(', ') : '(nenhum ainda)'
  return `\n\n---\n\n## 🧾 SOLICITAÇÃO EM ANDAMENTO ${formatNumero(input.numero)}\n\n${origem} Cotação ${formatNumero(input.numero)} já recebida: ${pns}.\n\nAtenda com esse contexto: NÃO peça de novo o que já temos; reconheça a cotação e toque pro orçamento. Se o cliente mandar itens NOVOS, passe a lista COMPLETA e atual no \`envia_pn\`.\n\nSe \`envia_pn\` retornar \`status: 'possivel_duplicata'\`, PERGUNTE ao cliente: "é uma nova cotação ou a mesma de antes?" — se ele disser NOVA, chame \`envia_pn\` de novo com \`forcar_nova: true\`; se disser a MESMA, tranquilize ("sua cotação ${formatNumero(input.numero)} já está com o time") e não faça nada.`
}
```

- [ ] **Step 4: Ligar as diretivas no `runAgent` via `opts.extraContext`**

Em `lib/agent.ts`, mudar a assinatura de `opts` (linha 36) e concatenar no system (linha 52):

```ts
// linha 36 — trocar por:
  opts: { saveUserMessage?: boolean; extraContext?: string } = {},
```

```ts
// linha 52 — trocar por:
    system: injectCurrentDate(systemPrompt) + toolDirective + (opts.extraContext ?? ''),
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/agent-directives.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

```bash
git add lib/agent.ts lib/agent-directives.ts tests/agent-directives.test.ts
git commit -m "feat(agent): diretivas de revendedor + contexto de solicitação (via opts.extraContext)"
```

---

## Task 9: Integração `envia_pn` + detecção de revendedor em `lib/process-incoming.ts`

**Files:**
- Modify: `lib/process-incoming.ts` (assinatura de `buildAgentTools`, corpo do `envia_pn`, detecção no pipeline, `extraContext` no `runAgent`)
- Test: `tests/envia-pn-dispatch.test.ts`

Contexto atual: `buildAgentTools({ inbox, conversationId, contactId, senderName, senderPhone, chatwootCfg, initialLabels })` retorna `{ tools, getLabels }`. O `envia_pn` está em `lib/process-incoming.ts:136-250`. O disparo ao vendedor está em `:188-241`.

- [ ] **Step 1: Ampliar a assinatura de `buildAgentTools`**

Adicionar params: `sessionId: string`, `reseller: { name: string } | null`. Localizar a definição de `buildAgentTools` (por volta de `:60-90`) e incluir no objeto de params + na desestruturação.

```ts
// no tipo de params de buildAgentTools, adicionar:
  sessionId: string
  reseller: { name: string } | null
```

- [ ] **Step 2: Reescrever o corpo do `envia_pn` (`:136-250`)**

Substituir o bloco inteiro do `envia_pn: tool({...})` por:

```ts
    envia_pn: tool({
      description: 'Envia lead qualificado ao grupo do vendedor. Aceita 1+ items (Part Number + quantidade). CHAME quando tiver todos os dados. Sempre passe a lista COMPLETA e atual de PNs. Se for consultor/revendedor, passe client_name e client_phone do cliente final. Use forcar_nova=true só quando o cliente confirmar que é uma NOVA cotação após um possivel_duplicata.',
      inputSchema: z.object({
        items: z.array(z.object({
          part_number: z.string(),
          quantity: z.string(),
          notes: z.string().optional(),
        })).min(1),
        urgency: z.enum(['AOG', 'rotina']),
        general_notes: z.string().optional(),
        client_name: z.string().optional().describe('Nome do cliente final (obrigatório quando a origem é consultor/revendedor).'),
        client_phone: z.string().optional().describe('Número do cliente final (obrigatório quando a origem é consultor/revendedor).'),
        forcar_nova: z.boolean().optional().describe('true só quando o cliente confirmou que é uma NOVA cotação após possivel_duplicata.'),
      }),
      execute: async (args) => {
        // 1. Resolve cliente final. Revendedor: usa client_* dos args. Cliente direto: usa o remetente.
        const clientPhone = normalizePhone(args.client_phone) || normalizePhone(senderPhone)
        const clientName = (args.client_name && args.client_name.trim()) || (senderName && senderName.trim()) || null

        if (reseller && !normalizePhone(args.client_phone)) {
          console.log('[envia_pn] revendedor sem client_phone → faltou_cliente')
          return { status: 'faltou_cliente' as const }
        }
        if (!clientPhone) return { status: 'faltou_cliente' as const }

        // 2. Solicitação (força nova se pedido)
        if (args.forcar_nova) {
          const aberta = await getOpenSolicitacao(clientPhone)
          if (aberta) await closeSolicitacao(aberta.id)
        }
        const sol = (await getOpenSolicitacao(clientPhone)) ?? (await openSolicitacao({
          clientPhone, clientName, originSessionId: sessionId,
          viaReseller: !!reseller, resellerName: reseller?.name ?? null,
          resellerPhone: reseller ? normalizePhone(senderPhone) : null,
        }))

        // 3. Decisão de disparo
        const decision = decideDispatch(sol, args.items)
        if (decision.action === 'possivel_duplicata') {
          console.log(`[envia_pn] possivel_duplicata sol=${sol.numero}`)
          return { status: 'possivel_duplicata' as const, numero: sol.numero }
        }

        // 4. Cria leads só pros items novos
        const leadIds: string[] = []
        for (const item of decision.novos) {
          const lead = await createLead({
            contact_id: contactId,
            part_number: item.part_number,
            quantity: item.quantity,
            urgency: args.urgency,
            customer_name: clientName,
            customer_phone: clientPhone,
            notes: item.notes ?? args.general_notes ?? null,
          })
          leadIds.push(lead.id)
        }
        await addToSolicitacao(sol.id, decision.novos.map(i => i.part_number), leadIds)

        // 5. Planilha (best-effort) — a partir da lista completa atual
        let sheetUrl: string | null = null
        try {
          const sheet = await createPartsSheet({
            customerName: clientName, customerPhone: clientPhone,
            items: args.items.map(i => ({ part_number: i.part_number, quantity: i.quantity })),
            urgency: args.urgency,
          })
          sheetUrl = sheet.url
          const admin = getAdminClient()
          if (leadIds.length) await admin.from('leads').update({ sheet_url: sheetUrl }).in('id', leadIds)
        } catch (err) {
          console.warn(`[envia_pn] sheet falhou (não fatal): ${(err as Error).message?.slice(0, 300)}`)
        }

        // 6. Notifica o grupo do vendedor
        const sellerPhone = (inbox as unknown as { seller_phone?: string | null }).seller_phone
        let quepasaCfg: { host: string; token: string } | null = null
        if (inbox.quepasa_host && inbox.quepasa_token) {
          quepasaCfg = { host: inbox.quepasa_host, token: inbox.quepasa_token }
        } else {
          const admin = getAdminClient()
          const { data: gw } = await admin.from('inboxes')
            .select('quepasa_host, quepasa_token')
            .not('quepasa_host', 'is', null).not('quepasa_token', 'is', null)
            .eq('enabled', true).limit(1).maybeSingle()
          if (gw?.quepasa_host && gw?.quepasa_token) quepasaCfg = { host: gw.quepasa_host, token: gw.quepasa_token }
        }
        const channelLabel = inbox.quepasa_host ? 'WhatsApp' : inbox.name
        if (sellerPhone && quepasaCfg) {
          const chatwootUrl = `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${conversationId}`
          const sellerMsg = buildGroupMessage({
            action: decision.action, numero: sol.numero, channelLabel,
            clientName, clientPhone, urgency: args.urgency, items: args.items,
            generalNotes: args.general_notes ?? null, resellerName: reseller?.name ?? null,
            sheetUrl, chatwootUrl,
          })
          await sendMessage(quepasaCfg, sellerPhone, sellerMsg)
        } else {
          console.warn(`[envia_pn] seller_phone/QuePasa indisponível pra inbox ${inbox.id}`)
        }

        // 7. Primeira vez: marca enviada + etiqueta orçamento_pendente
        if (decision.action === 'enviada') {
          await markSent(sol.id)
          labelsState = await addLabel(chatwootCfg, conversationId, labelsState, 'orçamento_pendente')
          await updateContactLabels(contactId, labelsState)
        }

        // (Fase B — Task 12 injeta aqui o alcance proativo ao cliente)

        return { status: decision.action, numero: sol.numero, lead_ids: leadIds, count: decision.novos.length }
      },
    }),
```

- [ ] **Step 3: Adicionar os imports no topo de `process-incoming.ts`**

```ts
import { normalizePhone } from '@/lib/phone'
import { decideDispatch, getOpenSolicitacao, openSolicitacao, closeSolicitacao, addToSolicitacao, markSent } from '@/lib/solicitacoes'
import { buildGroupMessage } from '@/lib/quote-messages'
```

- [ ] **Step 4: Detectar revendedor + passar contexto no `processIncomingMessage`**

Em `lib/process-incoming.ts`, adicionar os imports no topo:

```ts
import { findReseller } from '@/lib/resellers'
import { buildResellerDirective, buildQuoteContextDirective } from '@/lib/agent-directives'
```

Substituir o bloco atual `:313-322` (do `const { tools, getLabels } = buildAgentTools({...})` até o fim da chamada de `runAgent`) por:

```ts
  const reseller = await findReseller(senderPhone)

  const { tools, getLabels } = buildAgentTools({
    inbox, conversationId, contactId: contact.id,
    senderName, senderPhone, chatwootCfg, initialLabels: labels,
    sessionId, reseller,
  })

  // Contexto extra pro agente: origem revendedor + estado da solicitação aberta do cliente.
  // A solicitação é keyada por telefone NORMALIZADO (não por sessionId) → robusto ao formato
  // do identificador. Este é o mecanismo confiável de "o agente lembra do contexto".
  const ctxPhone = normalizePhone(senderPhone)
  const openSol = ctxPhone ? await getOpenSolicitacao(ctxPhone) : null
  const extraContext = [
    reseller ? buildResellerDirective(reseller.name) : '',
    openSol ? buildQuoteContextDirective({ numero: openSol.numero, resellerName: openSol.reseller_name, partNumbers: openSol.part_numbers }) : '',
  ].join('')

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId, content, inbox.system_prompt,
    openai.apiKey, openai.model, tools, getLabels(),
    { extraContext },
  )
```

> A `loadOpenAIConfig()` já era chamada logo abaixo (`:318`) — remover a chamada duplicada antiga pra não chamar duas vezes.

- [ ] **Step 5: Atualizar chamadas existentes de `buildAgentTools`**

`lib/sla-takeover.ts:58` chama `buildAgentTools(...)` sem `sessionId`/`reseller`. Adicionar:

```ts
    const { tools, getLabels } = buildAgentTools({
      inbox, conversationId: p.conversationId, contactId: contact.id,
      senderName: null, senderPhone: null, chatwootCfg, initialLabels: labels,
      sessionId: p.sessionId, reseller: null,
    })
```

- [ ] **Step 6: Escrever teste de fumaça do dispatch (mockando dependências)**

```ts
// tests/envia-pn-dispatch.test.ts
import { describe, it, expect } from 'vitest'
import { decideDispatch } from '@/lib/solicitacoes'

// A lógica de disparo já é testada em solicitacoes.test.ts; aqui garantimos o contrato
// de status que o envia_pn retorna pro agente.
describe('contrato de status do envia_pn', () => {
  it('possivel_duplicata quando nada novo numa já enviada', () => {
    const r = decideDispatch({ sent_to_group_at: 'x', part_numbers: ['ABC'] }, [{ part_number: 'abc' }])
    expect(r.action).toBe('possivel_duplicata')
  })
})
```

- [ ] **Step 7: Rodar tudo + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todos os testes passam; sem erro de tipo.

- [ ] **Step 8: Commit**

```bash
git add lib/process-incoming.ts lib/sla-takeover.ts tests/envia-pn-dispatch.test.ts
git commit -m "feat(envia_pn): integra solicitacoes (dispatch + #ID) + detecção de revendedor + contexto no agente"
```

**⛳ Checkpoint Fase A:** anti-duplicação + revendedor + ID prontos e testáveis (sem proativo). Pode ser aplicada/deployada de forma independente (ver Task 14).

---

# FASE B — Alcance proativo ao cliente + memória

## Task 10: Criar contato+conversa no Chatwoot (`lib/chatwoot-outbound.ts`)

**Files:**
- Create: `lib/chatwoot-outbound.ts`
- Test: `tests/chatwoot-outbound.test.ts`

- [ ] **Step 1: Verificar o shape real da API do Chatwoot**

Antes de codar, confirmar o formato de resposta de `POST /contacts` e `POST /conversations` na doc do Chatwoot (ou uma chamada real de teste). O código abaixo assume `POST /contacts → { payload: { contact: { id } } }` e `POST /conversations → { id }`. Ajustar a extração do id se divergir.

- [ ] **Step 2: Escrever os testes que falham (mock de fetch)**

```ts
// tests/chatwoot-outbound.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureClientConversation } from '@/lib/chatwoot-outbound'

const cfg = { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' }

describe('ensureClientConversation', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('cria contato + conversa e retorna os ids', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ payload: { contact: { id: 55 } } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 900 }) })
    vi.stubGlobal('fetch', fetchMock)
    const r = await ensureClientConversation(cfg, { phone: '5595999', name: 'João', inboxId: 45 })
    expect(r).toEqual({ contactId: 55, conversationId: 900 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/chatwoot-outbound.test.ts`
Expected: FAIL (`Cannot find module '@/lib/chatwoot-outbound'`).

- [ ] **Step 4: Implementar**

```ts
// lib/chatwoot-outbound.ts
interface ChatwootCfg { baseUrl: string; accountId: number; userToken: string }

function post(cfg: ChatwootCfg, path: string, body: unknown): Promise<Response> {
  return fetch(`${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api_access_token': cfg.userToken },
    body: JSON.stringify(body),
  })
}

/** Cria (ou reusa) contato + conversa no inbox WhatsApp pro número do cliente. */
export async function ensureClientConversation(
  cfg: ChatwootCfg, input: { phone: string; name: string; inboxId: number },
): Promise<{ contactId: number; conversationId: number }> {
  const cRes = await post(cfg, '/contacts', {
    name: input.name, phone_number: `+${input.phone}`, identifier: input.phone,
  })
  const cJson = await cRes.json().catch(() => ({} as Record<string, unknown>))
  const contactId = (cJson as { payload?: { contact?: { id?: number } }; id?: number })?.payload?.contact?.id
    ?? (cJson as { id?: number })?.id
  if (!contactId) throw new Error(`chatwoot contact ${cRes.status}`)

  const vRes = await post(cfg, '/conversations', {
    inbox_id: input.inboxId, contact_id: contactId, source_id: input.phone,
  })
  const vJson = await vRes.json().catch(() => ({} as Record<string, unknown>))
  const conversationId = (vJson as { id?: number })?.id
    ?? (vJson as { payload?: { id?: number } })?.payload?.id
  if (!conversationId) throw new Error(`chatwoot conversation ${vRes.status}`)

  return { contactId, conversationId }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/chatwoot-outbound.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/chatwoot-outbound.ts tests/chatwoot-outbound.test.ts
git commit -m "feat(chatwoot-outbound): cria contato+conversa do cliente via API"
```

---

## Task 11: Mensagem proativa + orquestração (`lib/proactive-client.ts`)

**Files:**
- Create: `lib/proactive-client.ts`
- Test: `tests/proactive-client.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// tests/proactive-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/chatwoot-outbound', () => ({ ensureClientConversation: vi.fn() }))
vi.mock('@/lib/chatwoot-send', () => ({ sendChatwootReply: vi.fn() }))
vi.mock('@/lib/memory', () => ({ saveMessage: vi.fn() }))
vi.mock('@/lib/quepasa', () => ({ sendMessage: vi.fn() }))

import { buildProactiveMessage, reachOutToClient } from '@/lib/proactive-client'
import { ensureClientConversation } from '@/lib/chatwoot-outbound'
import { sendChatwootReply } from '@/lib/chatwoot-send'
import { saveMessage } from '@/lib/memory'

describe('buildProactiveMessage', () => {
  it('cita o consultor e lista os PNs', () => {
    const m = buildProactiveMessage({ clientName: 'João', resellerName: 'Anderson', items: [{ part_number: 'ABC', quantity: '2' }] })
    expect(m).toContain('João')
    expect(m).toContain('Anderson')
    expect(m).toContain('ABC')
    expect(m).toContain('Amazon Jet Aviation')
  })
  it('resume quando muitos itens (>6)', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ part_number: `P${i}`, quantity: '1' }))
    const m = buildProactiveMessage({ clientName: 'João', resellerName: 'Anderson', items })
    expect(m).toContain('sua solicitação de cotação')
  })
})

describe('reachOutToClient', () => {
  beforeEach(() => vi.clearAllMocks())
  it('cria conversa, manda mensagem e semeia a memória', async () => {
    ;(ensureClientConversation as ReturnType<typeof vi.fn>).mockResolvedValue({ contactId: 1, conversationId: 900 })
    await reachOutToClient({
      chatwootCfg: { baseUrl: 'https://cw', accountId: 14, userToken: 'tok' },
      inboxId: 45, clientPhone: '5595999', clientName: 'João', resellerName: 'Anderson',
      items: [{ part_number: 'ABC', quantity: '2' }],
    })
    expect(ensureClientConversation).toHaveBeenCalled()
    expect(sendChatwootReply).toHaveBeenCalledWith(expect.anything(), 900, expect.stringContaining('Anderson'))
    expect(saveMessage).toHaveBeenCalledWith('5595999', 'assistant', expect.stringContaining('Anderson'))
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/proactive-client.test.ts`
Expected: FAIL (`Cannot find module '@/lib/proactive-client'`).

- [ ] **Step 3: Implementar**

```ts
// lib/proactive-client.ts
import { ensureClientConversation } from '@/lib/chatwoot-outbound'
import { sendChatwootReply } from '@/lib/chatwoot-send'
import { sendMessage } from '@/lib/quepasa'
import { saveMessage } from '@/lib/memory'

export function buildProactiveMessage(input: {
  clientName: string
  resellerName: string
  items: Array<{ part_number: string; quantity: string }>
}): string {
  const many = input.items.length > 6
  const lead = many
    ? `Recebemos sua solicitação de cotação através do seu consultor ${input.resellerName}.`
    : `Recebemos seu pedido de cotação através do seu consultor ${input.resellerName}:\n`
      + input.items.map(it => `• ${it.part_number} — Qtd ${it.quantity}`).join('\n')
  return [
    `Olá, ${input.clientName}! Aqui é da Amazon Jet Aviation ✈️`, '',
    lead, '',
    'Nosso time já está trabalhando no seu orçamento e em breve retornamos com uma posição. Qualquer coisa, pode falar com a gente por aqui! 🙂',
  ].join('\n')
}

/** Alcança o cliente final proativamente (fluxo revendedor). Best-effort: não deve derrubar o disparo do grupo. */
export async function reachOutToClient(input: {
  chatwootCfg: { baseUrl: string; accountId: number; userToken: string }
  inboxId: number
  clientPhone: string
  clientName: string
  resellerName: string
  items: Array<{ part_number: string; quantity: string }>
  quepasaCfg?: { host: string; token: string } | null
}): Promise<void> {
  const text = buildProactiveMessage({
    clientName: input.clientName, resellerName: input.resellerName, items: input.items,
  })
  try {
    const { conversationId } = await ensureClientConversation(input.chatwootCfg, {
      phone: input.clientPhone, name: input.clientName, inboxId: input.inboxId,
    })
    await sendChatwootReply(input.chatwootCfg, conversationId, text)
  } catch (err) {
    console.warn(`[proactive] Chatwoot falhou, fallback QuePasa: ${(err as Error).message?.slice(0, 200)}`)
    if (input.quepasaCfg) {
      await sendMessage(input.quepasaCfg, input.clientPhone, text)
    }
  }
  // Semeia a memória do cliente (best-effort). NOTA: memória é keyada por sessionId
  // (= senderIdent do WhatsApp), que pode diferir do telefone normalizado. O mecanismo
  // CONFIÁVEL de contexto é o buildQuoteContextDirective (keyado por telefone). Este save
  // é um complemento pro histórico ficar coerente se as chaves casarem.
  await saveMessage(input.clientPhone, 'assistant', text)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/proactive-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proactive-client.ts tests/proactive-client.test.ts
git commit -m "feat(proactive): mensagem cordial ao cliente citando consultor + semeadura de memória"
```

---

## Task 12: Ligar o proativo no `envia_pn` (primeira vez + revendedor)

**Files:**
- Modify: `lib/process-incoming.ts`

- [ ] **Step 1: Importar o orquestrador**

```ts
import { reachOutToClient } from '@/lib/proactive-client'
```

- [ ] **Step 2: Injetar a chamada no ponto marcado do `envia_pn`**

No `envia_pn`, no lugar do comentário `// (Fase B — Task 12 injeta aqui o alcance proativo ao cliente)` (logo após o bloco do Step "7. Primeira vez"), inserir:

```ts
        if (decision.action === 'enviada' && reseller && clientPhone && clientName) {
          try {
            await reachOutToClient({
              chatwootCfg, inboxId: inbox.chatwoot_inbox_id,
              clientPhone, clientName, resellerName: reseller.name,
              items: args.items.map(i => ({ part_number: i.part_number, quantity: i.quantity })),
              quepasaCfg,
            })
          } catch (err) {
            console.warn(`[envia_pn] proativo falhou (não fatal): ${(err as Error).message?.slice(0, 200)}`)
          }
        }
```

> `chatwootCfg` já existe no escopo do `buildAgentTools`; `inbox.chatwoot_inbox_id` é o inbox WhatsApp (id 45); `quepasaCfg` foi resolvido no passo 6 do envia_pn — garantir que a variável está no escopo (declará-la com `let quepasaCfg` no topo do execute se necessário).

- [ ] **Step 3: Rodar tudo + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add lib/process-incoming.ts
git commit -m "feat(envia_pn): dispara alcance proativo ao cliente na 1ª vez via revendedor"
```

---

## Task 13: Suíte completa + build

- [ ] **Step 1: Rodar toda a suíte + typecheck + build**

Run:
```bash
npx vitest run
npx tsc --noEmit
npm run build
```
Expected: todos os testes verdes; sem erro de tipo; build ok.

- [ ] **Step 2: Commit (se houver ajustes)**

```bash
git add -A && git commit -m "test: suíte completa verde para revendedores + solicitacoes + proativo" || echo "nada a commitar"
```

---

## Task 14: Deploy (só com OK do usuário)

> **Não executar sem aprovação** — o repo faz auto-deploy da `main` e as migrations tocam o banco de produção.

- [ ] **Step 1: Aplicar as migrations em prod** (via Supabase MCP `apply_migration`, uma por vez): `20260717000001_resellers`, `20260717000002_solicitacoes`.
- [ ] **Step 2: Cadastrar os números dos consultores** na tabela `resellers` (insert manual: Anderson, Karina, Alessandra, Glauber, Marco Antônio e seus números, normalizados).
- [ ] **Step 3: Merge da branch na `main`** e acompanhar o deploy na Vercel.
- [ ] **Step 4: Teste real** — cliente direto (anti-dup + #ID) e revendedor (confirmação + grupo + proativo).
- [ ] **Step 5: Verificar o contexto na resposta do cliente** — depois que o cliente proativo responder, conferir nos logs que `getOpenSolicitacao(normalizePhone(senderPhone))` achou a solicitação e que a diretiva de contexto entrou (a IA já sabe do consultor + PNs). Se o `senderIdent`/`sessionId` do cliente bater com o telefone normalizado, a memória semeada também aparece no histórico; se não bater, o contexto estruturado já cobre (é o caminho confiável).

---

## Self-Review (cobertura da spec)

- **Parte 1 (revendedor):** Tasks 2 (lista/`findReseller`), 8 (diretiva pedir/confirmar cliente), 9 (detecção + `client_*` no `envia_pn` + segura sem cliente). ✅
- **Parte 2 (solicitações/ID/anti-dup):** Tasks 3–7 (tabela+sequence, split, decideDispatch, funções de banco, mensagem com #ID) + 9 (integração). Regra "repete igual → pergunta" nas diretivas (Task 8) + `possivel_duplicata`/`forcar_nova` (Tasks 5, 9). ✅
- **Parte 3 (proativo + memória):** Tasks 10 (contato/conversa Chatwoot), 11 (mensagem citando consultor + `saveMessage`), 12 (liga na 1ª vez do revendedor). Contexto estruturado via `buildQuoteContextDirective` (Task 8). ✅
- **Segurança mantida:** planilha só no grupo (não volta pro modelo), `orcamento_enviado` nunca adicionada (só `orçamento_pendente`), chave OpenAI env (herdado da main). ✅
- **Ponto aberto sinalizado:** shape da API de contato/conversa do Chatwoot (Task 10, Step 1) + fallback QuePasa (Task 11). ✅
- **Fora de escopo:** UI de cadastro, dashboard, vídeo, sync Kanban, urgência 3 níveis (feature separada). ✅
