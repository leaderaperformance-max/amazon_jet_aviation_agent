# Qualificação + Ciclo de Vida da Cotação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) AOG 3 níveis + fluxo de motor no prompt; (B) máquina de estados no código (`quote_sessions`) que impede cotação duplicada e trata anexo tardio como complemento.

**Architecture:** Bloco A é prompt (directive extraído pra função testável + prompt.ts) + 1 campo no enum da `envia_pn`. Bloco B adiciona uma tabela `quote_sessions` e um módulo `lib/quote-session.ts`; a `envia_pn` ganha uma guarda de dedup que não cria lead pra PN já cotado (vira atualização ao vendedor). Estado é injetado no prompt.

**Tech Stack:** Next.js 14 + TypeScript, Supabase, Vercel AI SDK (`ai` v6 + `@ai-sdk/openai`), Vitest, QuePasa.

**Spec:** `docs/superpowers/specs/2026-07-03-qualificacao-e-ciclo-cotacao-design.md`

---

## File Structure

**Criar:**
- `lib/quote-session.ts` — máquina de estados (get/open/mark/add/close) + `splitItemsByQuote` (pura).
- `tests/quote-session.test.ts`, `tests/prompt-content.test.ts`.
- Migração SQL `quote_sessions`.

**Modificar:**
- `lib/agent.ts` — extrair `buildToolDirective(currentLabels, quoteContext?)`; editar urgência (A1) e adicionar motor (A2); `runAgent` aceita `opts.quoteContext`.
- `lib/prompt.ts` — urgência 3 níveis (A1) + seção motor (A2).
- `lib/process-incoming.ts` — enum urgência + `urgencyEmoji` helper (A1); guarda de dedup na `envia_pn` (B2); injeção de estado (B3).

---

## Task 1: Extrair `buildToolDirective` (refactor, habilita testes + B3)

**Files:** Modify `lib/agent.ts`; Test `tests/prompt-content.test.ts`

O `toolDirective` hoje é um template literal inline dentro de `runAgent`. Extrair pra função exportada (sem mudar conteúdo) pra poder testar e injetar contexto depois.

- [ ] **Step 1: Failing test** — `tests/prompt-content.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { buildToolDirective } from '@/lib/agent'

describe('buildToolDirective', () => {
  it('inclui as labels atuais e as seções críticas', () => {
    const d = buildToolDirective(['novo_lead'])
    expect(d).toContain('novo_lead')
    expect(d).toContain('PROIBIÇÕES ABSOLUTAS')
    expect(d).toContain('envia_pn')
  })
  it('injeta o bloco de cotação quando quoteContext é passado', () => {
    const d = buildToolDirective([], 'estado=cotado; PNs=[X]')
    expect(d).toContain('COTAÇÃO ATUAL')
    expect(d).toContain('estado=cotado; PNs=[X]')
  })
  it('sem quoteContext, não injeta o bloco', () => {
    expect(buildToolDirective([])).not.toContain('COTAÇÃO ATUAL')
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/prompt-content.test.ts` (buildToolDirective não exportada).

- [ ] **Step 3: Refactor `lib/agent.ts`**

Criar a função exportada ACIMA de `runAgent`, movendo o conteúdo atual do template `toolDirective` VERBATIM pra dentro dela. Assinatura:

```typescript
export function buildToolDirective(currentLabels: string[], quoteContext?: string): string {
  const labelsCtx = currentLabels.length > 0 ? currentLabels.join(', ') : '(nenhuma)'
  const quoteBlock = quoteContext
    ? `\n\n### 📌 COTAÇÃO ATUAL (contexto do sistema)\n${quoteContext}`
    : ''
  return `\n\n---\n\n## ⚠️ REGRAS CRÍTICAS DE COMPORTAMENTO E TOOLS\n\nTAGS ATUAIS: [${labelsCtx}]${quoteBlock}\n\n### 👤 MENSAGENS DO VENDEDOR HUMANO (CRÍTICO)\n\n/* ...TODO O RESTO DO DIRECTIVE ATUAL, VERBATIM, a partir daqui... */`
}
```

> Mover o texto existente (de `### 👤 MENSAGENS DO VENDEDOR` até o final `NUNCA mencione tools/tags ao cliente.`) pra dentro do template acima, sem alterar. O `TAGS ATUAIS: [${labelsCtx}]` já existe no começo — apenas adicionar `${quoteBlock}` logo depois dele.

Depois, em `runAgent`, trocar a atribuição inline por:

```typescript
  const toolDirective = tools ? buildToolDirective(currentLabels, opts.quoteContext) : ''
```

E adicionar `quoteContext?: string` ao tipo de `opts`:

```typescript
  opts: { saveUserMessage?: boolean; quoteContext?: string } = {},
```

- [ ] **Step 4: Run → PASS** — `npx vitest run` (novos + todos os existentes verdes). `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts tests/prompt-content.test.ts
git commit -m "refactor(agent): extrai buildToolDirective (testável + aceita quoteContext)"
```

---

## Task 2 (A1): Urgência em 3 níveis

**Files:** Modify `lib/process-incoming.ts`, `lib/agent.ts`, `lib/prompt.ts`; Test `tests/prompt-content.test.ts`, `tests/urgency.test.ts`

- [ ] **Step 1: Failing test** — criar `tests/urgency.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { urgencyEmoji } from '@/lib/process-incoming'

describe('urgencyEmoji', () => {
  it('mapeia os 3 níveis', () => {
    expect(urgencyEmoji('AOG')).toBe('🔴')
    expect(urgencyEmoji('Urgente')).toBe('🟠')
    expect(urgencyEmoji('rotina')).toBe('🟡')
  })
})
```

E adicionar ao `tests/prompt-content.test.ts`:

```typescript
import { DEFAULT_JET_PROMPT } from '@/lib/prompt'

describe('urgência 3 níveis (conteúdo)', () => {
  it('directive não mapeia mais "urgente" direto pra AOG e tem os 3 níveis', () => {
    const d = buildToolDirective([])
    expect(d).toContain('Urgente')
    expect(d).toMatch(/aeronave está parada|aeronave parada/i)
    // não pode ter a regra antiga "urgente ... → ... AOG" na mesma linha
    expect(d).not.toMatch(/urgente[^\n]*→[^\n]*AOG/i)
  })
  it('prompt.ts idem', () => {
    expect(DEFAULT_JET_PROMPT).toContain('Urgente')
    expect(DEFAULT_JET_PROMPT).not.toMatch(/"urgente"[^\n]*→[^\n]*AOG/i)
  })
})
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/urgency.test.ts tests/prompt-content.test.ts`.

- [ ] **Step 3a: `lib/process-incoming.ts` — enum + emoji helper**

No topo do arquivo (após os imports), adicionar a função exportada:

```typescript
export function urgencyEmoji(urgency: string): string {
  if (urgency === 'AOG') return '🔴'
  if (urgency === 'Urgente') return '🟠'
  return '🟡'
}
```

Trocar o enum (linha ~144):
```typescript
        urgency: z.enum(['AOG', 'Urgente', 'rotina']),
```
Trocar a linha do emoji inline (linha ~223) por uso do helper:
```typescript
          const urgEmoji = urgencyEmoji(args.urgency)
```
e onde usava `${urgencyEmoji}` na `sellerMsg`, usar `${urgEmoji}`.

- [ ] **Step 3b: `lib/agent.ts` (buildToolDirective) — reescrever classificação de urgência**

Na seção `### 🧠 TOLERÂNCIA A TYPOS / VARIAÇÕES`, trocar as 2 linhas de urgência:
- DE: `- "urgente" / "agora" / "aeronave parada" → urgency=AOG` e `- "sem pressa" / "quando der" / "normal" → urgency=rotina`
- PARA:
```
- "aeronave parada" / "em solo" / "AOG" / "não voa" / "grounded" → urgency=AOG
- "urgente" / "o mais breve possível" / "rápido" / "com pressa" (SEM confirmar aeronave parada) → urgency=Urgente E pergunte: "A aeronave está parada (AOG)?" — se confirmar parada, vira AOG
- "sem pressa" / "quando der" / "normal" / "rotina" → urgency=rotina
```

E na seção `### 🛠️ DECISÃO DE TOOL`, na linha `**Tem PN + QTD mas falta URGÊNCIA?**\n→ AGORA pergunte: "Última coisa — é AOG ou rotina?"`, trocar a pergunta por:
`→ AGORA pergunte: "Última coisa — a aeronave está parada (AOG), é urgente, ou rotina?"`

- [ ] **Step 3c: `lib/prompt.ts` — idem**

Linha 158 (`- "AOG", "aeronave parada", "em solo", "emergência" → urgency=**AOG**`) — logo abaixo dela adicionar:
```
- "urgente" / "o mais breve possível" / "rápido" SEM confirmar aeronave parada → urgency=**Urgente** e pergunte se a aeronave está parada (AOG)
```
E garantir que exista a linha de rotina. (Manter o resto.)

- [ ] **Step 4: Run → PASS** — `npx vitest run` verde. `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/process-incoming.ts lib/agent.ts lib/prompt.ts tests/urgency.test.ts tests/prompt-content.test.ts
git commit -m "feat(qualif): urgência em 3 níveis (AOG só com aeronave parada; Urgente é nível próprio)"
```

---

## Task 3 (A2): Fluxo de motor

**Files:** Modify `lib/agent.ts` (buildToolDirective), `lib/prompt.ts`; Test `tests/prompt-content.test.ts`

- [ ] **Step 1: Failing test** — adicionar ao `tests/prompt-content.test.ts`:

```typescript
describe('fluxo de motor (conteúdo)', () => {
  it('directive tem gatilhos de motor + pede plaqueta', () => {
    const d = buildToolDirective([])
    expect(d).toMatch(/MODO MOTOR|fluxo de motor/i)
    expect(d).toContain('IO-540')
    expect(d).toContain('plaqueta')
    expect(d).toMatch(/SN|serial/i)
  })
})
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3a: `lib/agent.ts` (buildToolDirective) — adicionar seção MODO MOTOR**

Inserir uma seção nova ANTES de `### 🏷️ TAGS` (ou após "RESPOSTA POSITIVA PARA CATEGORIAS"):

```
### 🛩️ MODO MOTOR

Se o cliente mencionar motor/engine ou termos: Lycoming, Continental, Pratt, PT6, IO-540, O-360, IO-550, TSIO, AEIO, GO, VO, HIO (e modelos de motor) → entre no MODO MOTOR e colete:
- Modelo do motor
- Part Number (PN), se tiver
- Serial Number (SN), se tiver
- Modelo da aeronave
- FOTO DA PLAQUETA do motor

Se o cliente NÃO souber PN nem SN → oriente: "Sem problema. Me manda uma foto da plaqueta do motor que a gente identifica por lá." Com modelo do motor + aeronave + foto da plaqueta já dá pra enviar a cotação (o item vai com o modelo do motor no lugar do PN, e o SN/aeronave nas notas).
```

- [ ] **Step 3b: `lib/prompt.ts` — seção equivalente**

Adicionar uma subseção "Fluxo de motor" na seção 5 (fluxo de qualificação) com o mesmo conteúdo resumido (gatilhos + coleta + plaqueta).

- [ ] **Step 4: Run → PASS**. tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts lib/prompt.ts tests/prompt-content.test.ts
git commit -m "feat(qualif): fluxo de coleta pra motores (modelo/PN/SN/aeronave/plaqueta)"
```

---

## Task 4 (B1): Tabela `quote_sessions` + módulo

**Files:** Migração SQL; Create `lib/quote-session.ts`; Test `tests/quote-session.test.ts`

- [ ] **Step 1: Migração** — aplicar via management API (ou MCP) e versionar em `supabase/migrations/2026070300000X_quote_sessions.sql`:

```sql
create table if not exists quote_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id   text not null,
  state        text not null default 'aguardando_info',
  part_numbers text[] not null default '{}',
  lead_ids     uuid[] not null default '{}',
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  updated_at   timestamptz not null default now()
);
create unique index if not exists uq_quote_open on quote_sessions (session_id) where closed_at is null;
create index if not exists idx_quote_session on quote_sessions (session_id, closed_at);
```

Verificar: `select count(*) from quote_sessions;` → 0.

- [ ] **Step 2: Failing test** — `tests/quote-session.test.ts` (mock admin com `vi.hoisted`, padrão do projeto):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rows, insertReturn, getAdminMock } = vi.hoisted(() => {
  const rows = { open: null as Record<string, unknown> | null }
  const insertReturn = { value: { id: 'q1', session_id: 's', state: 'aguardando_info', part_numbers: [], lead_ids: [], opened_at: 'now', closed_at: null, updated_at: 'now' } }
  const chain = () => {
    const c: Record<string, unknown> = {}
    c.select = vi.fn(() => c); c.eq = vi.fn(() => c); c.is = vi.fn(() => c)
    c.order = vi.fn(() => c); c.limit = vi.fn(() => c)
    c.maybeSingle = vi.fn(async () => ({ data: rows.open, error: null }))
    c.update = vi.fn(() => c)
    c.insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: insertReturn.value, error: null })) })) }))
    return c
  }
  return { rows, insertReturn, getAdminMock: vi.fn(() => ({ from: vi.fn(() => chain()) })) }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: getAdminMock }))

import { splitItemsByQuote, getOpenQuote, openQuote } from '@/lib/quote-session'

beforeEach(() => vi.clearAllMocks())

describe('splitItemsByQuote', () => {
  it('separa novos de repetidos (case-insensitive, trim)', () => {
    const r = splitItemsByQuote([{ part_number: 'ABC-1' }, { part_number: ' abc-1 ' }, { part_number: 'XYZ' }], ['ABC-1'])
    expect(r.novos.map(i => i.part_number)).toEqual(['XYZ'])
    expect(r.repetidos).toHaveLength(2)
  })
})

describe('getOpenQuote / openQuote', () => {
  it('retorna null quando não há aberta', async () => {
    rows.open = null
    expect(await getOpenQuote('s')).toBeNull()
  })
  it('auto-close: aberta velha (updated_at antigo) → fecha e retorna null', async () => {
    rows.open = { id: 'q1', session_id: 's', state: 'cotado', part_numbers: [], lead_ids: [], opened_at: 'x', closed_at: null, updated_at: '2000-01-01T00:00:00Z' }
    expect(await getOpenQuote('s')).toBeNull()
  })
  it('openQuote cria e retorna a sessão', async () => {
    const q = await openQuote('s')
    expect(q.id).toBe('q1')
  })
})
```

- [ ] **Step 3: Run → FAIL**.

- [ ] **Step 4: Implementar `lib/quote-session.ts`**

```typescript
import { getAdminClient } from '@/lib/supabase/admin'

export interface QuoteSession {
  id: string
  session_id: string
  state: 'aguardando_info' | 'recebendo_anexos' | 'qualificado' | 'cotado'
  part_numbers: string[]
  lead_ids: string[]
  opened_at: string
  closed_at: string | null
  updated_at: string
}

const IDLE_MS = () => parseInt(process.env.QUOTE_IDLE_HOURS ?? '48', 10) * 3600 * 1000

export function splitItemsByQuote<T extends { part_number: string }>(
  items: T[], existingPNs: string[],
): { novos: T[]; repetidos: T[] } {
  const norm = (p: string) => p.trim().toUpperCase()
  const set = new Set(existingPNs.map(norm))
  const novos: T[] = [], repetidos: T[] = []
  for (const it of items) (set.has(norm(it.part_number)) ? repetidos : novos).push(it)
  return { novos, repetidos }
}

export async function getOpenQuote(sessionId: string, nowMs: number = Date.now()): Promise<QuoteSession | null> {
  const db = getAdminClient()
  const { data } = await db.from('quote_sessions')
    .select('*').eq('session_id', sessionId).is('closed_at', null)
    .order('opened_at', { ascending: false }).limit(1).maybeSingle()
  const q = data as QuoteSession | null
  if (!q) return null
  if (nowMs - new Date(q.updated_at).getTime() > IDLE_MS()) {
    await closeQuote(q.id)
    return null
  }
  return q
}

export async function openQuote(sessionId: string): Promise<QuoteSession> {
  const db = getAdminClient()
  const { data, error } = await db.from('quote_sessions')
    .insert({ session_id: sessionId }).select().single()
  if (error) throw error
  return data as QuoteSession
}

export async function markState(id: string, state: QuoteSession['state']): Promise<void> {
  await getAdminClient().from('quote_sessions').update({ state, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function addToQuote(id: string, pns: string[], leadIds: string[]): Promise<void> {
  const db = getAdminClient()
  const { data } = await db.from('quote_sessions').select('part_numbers, lead_ids').eq('id', id).maybeSingle()
  const cur = data as { part_numbers: string[]; lead_ids: string[] } | null
  const part_numbers = Array.from(new Set([...(cur?.part_numbers ?? []), ...pns]))
  const lead_ids = Array.from(new Set([...(cur?.lead_ids ?? []), ...leadIds]))
  await db.from('quote_sessions').update({ part_numbers, lead_ids, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function closeQuote(id: string): Promise<void> {
  await getAdminClient().from('quote_sessions').update({ closed_at: new Date().toISOString() }).eq('id', id)
}
```

- [ ] **Step 5: Run → PASS**. tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/quote-session.ts tests/quote-session.test.ts supabase/migrations/
git commit -m "feat(cotacao): tabela quote_sessions + módulo (estado + splitItemsByQuote)"
```

---

## Task 5 (B2): Guarda de dedup na `envia_pn` + atualização ao vendedor

**Files:** Modify `lib/process-incoming.ts`

> Integração no `envia_pn` (dentro de `buildAgentTools`). `process-incoming.ts` não tem teste unitário direto; a lógica pura (`splitItemsByQuote`) já foi testada na Task 4. Verificação = build + tsc + as unidades testadas.

- [ ] **Step 1: Editar `envia_pn.execute` em `lib/process-incoming.ts`**

Adicionar imports no topo:
```typescript
import { getOpenQuote, openQuote, addToQuote, markState, splitItemsByQuote } from '@/lib/quote-session'
```

No começo do `execute` da `envia_pn` (antes do loop `for (const item of args.items)`):

```typescript
        // Máquina de estados / anti-duplicação
        const quote = (await getOpenQuote(sessionId)) ?? (await openQuote(sessionId))
        const { novos, repetidos } = splitItemsByQuote(args.items, quote.part_numbers)
```

> `sessionId` precisa estar em escopo no `buildAgentTools`. Ele NÃO é passado hoje — adicionar `sessionId` aos params de `buildAgentTools` e à desestruturação, e passar `sessionId` no call site em `processIncomingMessage`.

Trocar o loop de createLead pra rodar SÓ nos `novos`:
```typescript
        const leadIds: string[] = []
        for (const item of novos) {
          const lead = await createLead({ /* ...igual, usando item... */ })
          leadIds.push(lead.id)
        }
```

Depois do envio ao vendedor dos novos (mantém a notificação atual, mas SÓ se `novos.length > 0`), adicionar a atualização pros repetidos:
```typescript
        if (repetidos.length > 0 && quepasaCfg && sellerPhone) {
          const pns = repetidos.map(i => i.part_number).join(', ')
          const upd = `📎 *ATUALIZAÇÃO DE COTAÇÃO*\n\n👤 ${finalName ?? '(sem nome)'}\n🔖 Cotação: ${quote.id}\n🔧 Cliente reforçou/mandou mais sobre: ${pns}\n\n👉 Ver conversa no Chatwoot (nenhum lead novo criado — é complemento).`
          await sendMessage(quepasaCfg, sellerPhone, upd)
        }
        await addToQuote(quote.id, novos.map(i => i.part_number), leadIds)
        await markState(quote.id, 'cotado')
```

Ajustar o `return`:
```typescript
        return { ok: true, count: novos.length, updated: repetidos.length }
```

> Envolver a criação de planilha/notificação principal em `if (novos.length > 0) { ... }` — não cria planilha nova pra complemento puro.

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` limpo; `npx vitest run` verde; `npm run build` OK.

- [ ] **Step 3: Commit**

```bash
git add lib/process-incoming.ts
git commit -m "feat(cotacao): guarda de dedup na envia_pn — PN repetido vira atualização, não lead duplicado"
```

---

## Task 6 (B3): Injeção do estado da cotação no prompt

**Files:** Modify `lib/process-incoming.ts`

- [ ] **Step 1: Editar `processIncomingMessage`**

Antes do `runAgent(...)`, montar o contexto da cotação a partir da sessão aberta:

```typescript
  const openQ = await getOpenQuote(sessionId)
  const quoteContext = openQ
    ? `estado=${openQ.state}; PNs já na cotação=[${openQ.part_numbers.join(', ') || '—'}]; já enviada ao time=${openQ.state === 'cotado' ? 'sim' : 'não'}. Anexos/mensagens novos = COMPLEMENTO da mesma cotação (não recote). Nova cotação só se o cliente pedir outro produto/PN/aeronave.`
    : undefined
```

Passar no `runAgent` (7º→8º arg `opts`):
```typescript
  const reply = await runAgent(
    sessionId, content, inbox.system_prompt,
    openai.apiKey, openai.model, tools, getLabels(),
    { quoteContext },
  )
```

(`getOpenQuote` já importado na Task 5.)

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` limpo; `npx vitest run` verde; `npm run build` OK.

- [ ] **Step 3: Commit**

```bash
git add lib/process-incoming.ts
git commit -m "feat(cotacao): injeta estado da cotação aberta no contexto do agente"
```

---

## Pós-implementação

- [ ] Env (Vercel): `QUOTE_IDLE_HOURS=48` (opcional; default no código).
- [ ] Deploy + smoke test: (1) mandar "urgente" e ver a IA classificar Urgente + perguntar AOG; (2) motor → ver pedido de plaqueta; (3) mandar um PN, deixar cotar, mandar de novo o mesmo PN → ver que NÃO cria lead duplicado (só atualização no grupo).

## Self-review (preenchido)

- **Cobertura da spec:** A1→Task2; A2→Task3; B1→Task4; B2(dedup)→Task5; B3(injeção)→Task6; refactor habilitador→Task1. Estados/transições: aguardando_info (openQuote default), recebendo_anexos (best-effort — pode ser setado no worker se houver anexo; não crítico, deixado como enhancement), cotado (Task5). ✔ (nota: `recebendo_anexos`/`qualificado` são best-effort conforme a spec §B5.)
- **Placeholders:** o "mover verbatim" da Task 1 é refactor de texto existente (não código novo). Código novo está completo. ✔
- **Consistência de tipos:** `QuoteSession`, `splitItemsByQuote`, `getOpenQuote/openQuote/addToQuote/markState/closeQuote`, `urgencyEmoji`, `buildToolDirective(currentLabels, quoteContext?)`, `runAgent opts.quoteContext` — usados iguais entre tasks. ✔
