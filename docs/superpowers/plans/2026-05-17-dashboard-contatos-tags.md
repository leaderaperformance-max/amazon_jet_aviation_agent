# Fase 2 — Dashboard Contatos + Tags + Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar dashboard read-only de contatos atendidos, tagging automático via tool calling do agente, e handoff humano por tag.

**Architecture:** Nova tabela `contacts` no Supabase espelha cada conversa. Webhook faz upsert nessa tabela + salva memória de todos (humano incluso) + responde só se tag `atendimento_ia` presente ou primeiro contato. Agente JET ganha tools `add_label`/`remove_label`. Dashboard lê só do Supabase.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase Postgres, Vercel AI SDK (`generateText` + `tools`), shadcn/ui, Vitest.

---

## File Map

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `supabase/migrations/20260518000001_contacts_table.sql` | Tabela `contacts` + RLS | Novo |
| `lib/types.ts` | Adiciona `Contact`, `BusinessLabel`, `ContactStatus` | Modificar |
| `lib/tags.ts` | `addLabel`, `removeLabel`, `syncLabels` (Chatwoot + DB) | Novo |
| `lib/contacts.ts` | `upsertContact`, `listContacts`, `getContact` | Novo |
| `lib/summarize.ts` | `generateSummary(contactId)` | Novo |
| `lib/prompt.ts` | Append seção 12 sobre tags ao `DEFAULT_JET_PROMPT` | Modificar |
| `lib/agent.ts` | `runAgent` aceita `tools` param | Modificar |
| `app/api/webhook/route.ts` | Upsert contact + memory + handoff + tools | Refatorar |
| `app/api/contacts/route.ts` | GET list paginada com filtros | Novo |
| `app/api/contacts/[id]/summary/route.ts` | POST gerar resumo | Novo |
| `app/dashboard/page.tsx` | Adicionar card "X contatos hoje" | Modificar |
| `app/dashboard/contacts/page.tsx` | Página listagem | Novo |
| `app/dashboard/layout.tsx` | Adicionar link "Contatos" na nav | Modificar |
| `components/contacts-table.tsx` | Tabela + busca + filtros + paginação | Novo |
| `components/summary-modal.tsx` | Modal de resumo | Novo |
| `tests/tags.test.ts` | Testes do módulo tags | Novo |
| `tests/contacts.test.ts` | Testes upsert/list | Novo |
| `tests/summarize.test.ts` | Testes generateSummary | Novo |
| `tests/agent.test.ts` | Atualizar pra cobrir tools | Modificar |
| `tests/webhook.test.ts` | Cenários novos (handoff, memory) | Modificar |

---

## Task 1: Migration SQL — tabela `contacts`

**Files:**
- Create: `supabase/migrations/20260518000001_contacts_table.sql`

- [ ] **Step 1: Criar o arquivo de migração**

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id                 UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
  chatwoot_conversation_id INT  NOT NULL,
  chatwoot_contact_id      INT,
  name                     TEXT,
  phone_number             TEXT,
  whatsapp_identifier      TEXT,
  current_labels           TEXT[] NOT NULL DEFAULT '{}',
  status                   TEXT NOT NULL DEFAULT 'ia' CHECK (status IN ('ia','humano','encerrado')),
  last_message             TEXT,
  last_message_at          TIMESTAMPTZ,
  message_count            INT NOT NULL DEFAULT 0,
  first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary                  TEXT,
  summary_generated_at     TIMESTAMPTZ,
  UNIQUE (inbox_id, chatwoot_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_inbox_last_msg
  ON contacts (inbox_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated write contacts" ON contacts;

CREATE POLICY "authenticated read contacts" ON contacts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write contacts" ON contacts
  FOR ALL USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Aplicar migration no Supabase via Management API**

Executar (substituir `<PAT>` pelo Personal Access Token do Supabase):

```bash
curl -X POST "https://api.supabase.com/v1/projects/oncfstviluxmzenfuyot/database/query" \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "query": "CREATE TABLE IF NOT EXISTS contacts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), inbox_id UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE, chatwoot_conversation_id INT NOT NULL, chatwoot_contact_id INT, name TEXT, phone_number TEXT, whatsapp_identifier TEXT, current_labels TEXT[] NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'ia' CHECK (status IN ('ia','humano','encerrado')), last_message TEXT, last_message_at TIMESTAMPTZ, message_count INT NOT NULL DEFAULT 0, first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), summary TEXT, summary_generated_at TIMESTAMPTZ, UNIQUE (inbox_id, chatwoot_conversation_id)); CREATE INDEX IF NOT EXISTS idx_contacts_inbox_last_msg ON contacts (inbox_id, last_message_at DESC); CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status); ALTER TABLE contacts ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS \"authenticated read contacts\" ON contacts; DROP POLICY IF EXISTS \"authenticated write contacts\" ON contacts; CREATE POLICY \"authenticated read contacts\" ON contacts FOR SELECT USING (auth.role() = 'authenticated'); CREATE POLICY \"authenticated write contacts\" ON contacts FOR ALL USING (auth.role() = 'authenticated');"
}
EOF
```

- [ ] **Step 3: Verificar tabela criada**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/oncfstviluxmzenfuyot/database/query" \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='"'"'contacts'"'"' ORDER BY ordinal_position;"}'
```

Esperado: 16 colunas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000001_contacts_table.sql
git commit -m "feat: add contacts table migration for phase 2 dashboard"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Append no final de `lib/types.ts`**

```typescript

export const BUSINESS_LABELS = [
  'novo_lead',
  'aguardando_pn',
  'pendente_orcamento',
  'orcamento_enviado',
  'lead_ganho',
  'lead_perdido',
] as const

export type BusinessLabel = typeof BUSINESS_LABELS[number]

export const SYSTEM_LABEL = 'atendimento_ia' as const
export type SystemLabel = typeof SYSTEM_LABEL

export const TERMINAL_LABELS = ['lead_ganho', 'lead_perdido'] as const
export type TerminalLabel = typeof TERMINAL_LABELS[number]

export type ContactStatus = 'ia' | 'humano' | 'encerrado'

export interface Contact {
  id: string
  inbox_id: string
  chatwoot_conversation_id: number
  chatwoot_contact_id: number | null
  name: string | null
  phone_number: string | null
  whatsapp_identifier: string | null
  current_labels: string[]
  status: ContactStatus
  last_message: string | null
  last_message_at: string | null
  message_count: number
  first_seen_at: string
  summary: string | null
  summary_generated_at: string | null
}

export interface ContactUpsertInput {
  inbox_id: string
  chatwoot_conversation_id: number
  chatwoot_contact_id?: number | null
  name?: string | null
  phone_number?: string | null
  whatsapp_identifier?: string | null
  current_labels: string[]
  last_message: string
  last_message_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add Contact, BusinessLabel and ContactStatus types"
```

---

## Task 3: Módulo `lib/tags.ts` (TDD)

**Files:**
- Create: `lib/tags.ts`
- Create: `tests/tags.test.ts`

- [ ] **Step 1: Escrever testes — `tests/tags.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addLabel, removeLabel, syncLabels } from '@/lib/tags'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const chatwootCfg = {
  baseUrl: 'https://chat.example.com',
  accountId: 1,
  userToken: 'tok',
}

describe('syncLabels', () => {
  it('faz POST com labels completos para o Chatwoot', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    await syncLabels(chatwootCfg, 13, ['novo_lead', 'atendimento_ia'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/api/v1/accounts/1/conversations/13/labels',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': 'tok',
        },
        body: JSON.stringify({ labels: ['novo_lead', 'atendimento_ia'] }),
      }
    )
  })

  it('não lança quando Chatwoot retorna não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await expect(syncLabels(chatwootCfg, 13, ['x'])).resolves.toBeUndefined()
  })
})

describe('addLabel', () => {
  it('adiciona label ao set atual sem duplicar', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const result = await addLabel(chatwootCfg, 13, ['atendimento_ia'], 'novo_lead')
    expect(result).toEqual(['atendimento_ia', 'novo_lead'])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('não chama Chatwoot se label já existe', async () => {
    const result = await addLabel(chatwootCfg, 13, ['novo_lead'], 'novo_lead')
    expect(result).toEqual(['novo_lead'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('removeLabel', () => {
  it('remove label do set atual', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const result = await removeLabel(chatwootCfg, 13, ['novo_lead', 'atendimento_ia'], 'novo_lead')
    expect(result).toEqual(['atendimento_ia'])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('não chama Chatwoot se label não está no set', async () => {
    const result = await removeLabel(chatwootCfg, 13, ['novo_lead'], 'aguardando_pn')
    expect(result).toEqual(['novo_lead'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm test tests/tags.test.ts
```

Esperado: `Cannot find module '@/lib/tags'`.

- [ ] **Step 3: Implementar `lib/tags.ts`**

```typescript
import type { ChatwootApiConfig } from '@/lib/types'

interface ChatwootCfg {
  baseUrl: string
  accountId: number
  userToken: string
}

export async function syncLabels(
  cfg: ChatwootCfg,
  conversationId: number,
  labels: string[]
): Promise<void> {
  const url = `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}/conversations/${conversationId}/labels`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': cfg.userToken,
      },
      body: JSON.stringify({ labels }),
    })
    if (!response.ok) {
      console.warn(`[tags] syncLabels failed: ${response.status}`)
    }
  } catch (err) {
    console.warn('[tags] syncLabels error:', err)
  }
}

export async function addLabel(
  cfg: ChatwootCfg,
  conversationId: number,
  currentLabels: string[],
  label: string
): Promise<string[]> {
  if (currentLabels.includes(label)) return currentLabels
  const next = [...currentLabels, label]
  await syncLabels(cfg, conversationId, next)
  return next
}

export async function removeLabel(
  cfg: ChatwootCfg,
  conversationId: number,
  currentLabels: string[],
  label: string
): Promise<string[]> {
  if (!currentLabels.includes(label)) return currentLabels
  const next = currentLabels.filter(l => l !== label)
  await syncLabels(cfg, conversationId, next)
  return next
}
```

Nota: `ChatwootApiConfig` em `lib/types.ts` foi removido na Fase 1 anterior. Definimos `ChatwootCfg` local no módulo.

- [ ] **Step 4: Rodar — deve passar**

```bash
npm test tests/tags.test.ts
```

Esperado: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tags.ts tests/tags.test.ts
git commit -m "feat: add tags module (addLabel, removeLabel, syncLabels)"
```

---

## Task 4: Módulo `lib/contacts.ts` (TDD)

**Files:**
- Create: `lib/contacts.ts`
- Create: `tests/contacts.test.ts`

- [ ] **Step 1: Escrever testes — `tests/contacts.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}))

import { upsertContact, getContactById } from '@/lib/contacts'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

describe('upsertContact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('faz upsert com on conflict (inbox_id, chatwoot_conversation_id)', async () => {
    const upsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'uuid', inbox_id: 'inbox-1', chatwoot_conversation_id: 13,
            message_count: 1, current_labels: ['novo_lead'], status: 'ia',
            previous_message_count: 0,
          },
          error: null,
        }),
      }),
    })
    mockGetAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: upsertMock }) })

    const result = await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      name: 'João',
      phone_number: '+5511999999999',
      whatsapp_identifier: '5511999999999@s.whatsapp.net',
      current_labels: ['novo_lead'],
      last_message: 'olá',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inbox_id: 'inbox-1',
        chatwoot_conversation_id: 13,
        current_labels: ['novo_lead'],
        status: 'ia',
      }),
      { onConflict: 'inbox_id,chatwoot_conversation_id' }
    )
    expect(result.contact.id).toBe('uuid')
  })

  it('calcula status=encerrado quando lead_ganho está nos labels', async () => {
    const upsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'x', status: 'encerrado' }, error: null,
        }),
      }),
    })
    mockGetAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: upsertMock }) })

    await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      current_labels: ['lead_ganho'],
      last_message: 'fechou',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    const args = upsertMock.mock.calls[0][0]
    expect(args.status).toBe('encerrado')
  })

  it('calcula status=humano quando atendimento_ia ausente e nenhum terminal', async () => {
    const upsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'x', status: 'humano' }, error: null }),
      }),
    })
    mockGetAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: upsertMock }) })

    await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      current_labels: ['novo_lead'],
      last_message: 'x',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    const args = upsertMock.mock.calls[0][0]
    expect(args.status).toBe('humano')
  })
})

describe('getContactById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna o contato pelo id', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'uuid', name: 'João' }, error: null }),
          }),
        }),
      }),
    })

    const result = await getContactById('uuid')
    expect(result?.name).toBe('João')
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
npm test tests/contacts.test.ts
```

- [ ] **Step 3: Implementar `lib/contacts.ts`**

```typescript
import { getAdminClient } from '@/lib/supabase/admin'
import type { Contact, ContactStatus, ContactUpsertInput } from '@/lib/types'
import { SYSTEM_LABEL, TERMINAL_LABELS } from '@/lib/types'

const TABLE = 'contacts'

function computeStatus(labels: string[]): ContactStatus {
  if (labels.some(l => (TERMINAL_LABELS as readonly string[]).includes(l))) return 'encerrado'
  if (labels.includes(SYSTEM_LABEL)) return 'ia'
  return 'humano'
}

export interface UpsertResult {
  contact: Contact
  wasNew: boolean
}

export async function upsertContact(input: ContactUpsertInput): Promise<UpsertResult> {
  const supabase = getAdminClient()
  const status = computeStatus(input.current_labels)

  // Fetch existing first to know if it's new and to increment message_count atomically
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id, message_count')
    .eq('inbox_id', input.inbox_id)
    .eq('chatwoot_conversation_id', input.chatwoot_conversation_id)
    .maybeSingle()

  const wasNew = !existing
  const nextCount = (existing?.message_count ?? 0) + 1

  const payload = {
    inbox_id: input.inbox_id,
    chatwoot_conversation_id: input.chatwoot_conversation_id,
    chatwoot_contact_id: input.chatwoot_contact_id ?? null,
    name: input.name ?? null,
    phone_number: input.phone_number ?? null,
    whatsapp_identifier: input.whatsapp_identifier ?? null,
    current_labels: input.current_labels,
    status,
    last_message: input.last_message,
    last_message_at: input.last_message_at,
    message_count: nextCount,
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'inbox_id,chatwoot_conversation_id' })
    .select()
    .single()

  if (error) throw error
  return { contact: data as Contact, wasNew }
}

export async function getContactById(id: string): Promise<Contact | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data as Contact) ?? null
}

export async function updateContactLabels(
  contactId: string,
  labels: string[]
): Promise<void> {
  const supabase = getAdminClient()
  await supabase
    .from(TABLE)
    .update({ current_labels: labels, status: computeStatus(labels) })
    .eq('id', contactId)
}
```

Atenção: o teste 1 espera o upsert ser chamado mas no impl real fazemos um `maybeSingle` antes. Atualize o teste para mockar AMBOS:

Substituir o teste "faz upsert com on conflict" por uma versão que mocka o select (maybeSingle) primeiro retornando `null`, depois o upsert:

```typescript
  it('faz upsert com on conflict (inbox_id, chatwoot_conversation_id)', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
      }),
    })
    const upsertChainMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'uuid', message_count: 1, current_labels: ['novo_lead'], status: 'ia' },
          error: null,
        }),
      }),
    })

    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockImplementation(() => ({
        select: selectMock,
        upsert: upsertChainMock,
      })),
    })

    const result = await upsertContact({
      inbox_id: 'inbox-1',
      chatwoot_conversation_id: 13,
      name: 'João',
      phone_number: '+5511999999999',
      whatsapp_identifier: '5511999999999@s.whatsapp.net',
      current_labels: ['novo_lead'],
      last_message: 'olá',
      last_message_at: '2026-05-17T22:00:00Z',
    })

    expect(upsertChainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inbox_id: 'inbox-1',
        chatwoot_conversation_id: 13,
        current_labels: ['novo_lead'],
        status: 'ia',
        message_count: 1,
      }),
      { onConflict: 'inbox_id,chatwoot_conversation_id' }
    )
    expect(result.contact.id).toBe('uuid')
    expect(result.wasNew).toBe(true)
  })
```

Atualizar testes 2 e 3 (status=encerrado e humano) usando o mesmo padrão de mock (incluir o `maybeSingle` retornando null antes).

- [ ] **Step 4: Rodar — deve passar**

```bash
npm test tests/contacts.test.ts
```

Esperado: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/contacts.ts tests/contacts.test.ts
git commit -m "feat: add contacts module (upsert, get, updateLabels)"
```

---

## Task 5: Módulo `lib/summarize.ts` (TDD)

**Files:**
- Create: `lib/summarize.ts`
- Create: `tests/summarize.test.ts`

- [ ] **Step 1: Escrever testes — `tests/summarize.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn() }))
vi.mock('@/lib/contacts', () => ({
  getContactById: vi.fn(),
}))
vi.mock('@/lib/inboxes', () => ({ loadOpenAIConfig: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }))

import { generateSummary } from '@/lib/summarize'
import { generateText } from 'ai'
import { loadHistory } from '@/lib/memory'
import { getContactById } from '@/lib/contacts'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGenerate = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockGetContact = getContactById as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>
const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

describe('generateSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetContact.mockResolvedValue({
      id: 'c1', whatsapp_identifier: '5511999@s.whatsapp.net', name: 'João',
    })
    mockLoadHistory.mockResolvedValue([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ])
    mockLoadOpenAI.mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' })
    mockGenerate.mockResolvedValue({ text: '• João pediu PN\n• Aguardando cotação' })

    const updateChain = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateChain }),
    })
  })

  it('lança erro se contato não existe', async () => {
    mockGetContact.mockResolvedValue(null)
    await expect(generateSummary('nope')).rejects.toThrow('Contato não encontrado')
  })

  it('lança erro se contato não tem whatsapp_identifier', async () => {
    mockGetContact.mockResolvedValue({ id: 'c1', whatsapp_identifier: null })
    await expect(generateSummary('c1')).rejects.toThrow('whatsapp_identifier ausente')
  })

  it('gera resumo, salva no contato e retorna', async () => {
    const result = await generateSummary('c1')
    expect(mockLoadHistory).toHaveBeenCalledWith('5511999@s.whatsapp.net')
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Resuma'),
        prompt: expect.stringContaining('oi'),
      })
    )
    expect(result.summary).toBe('• João pediu PN\n• Aguardando cotação')
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
npm test tests/summarize.test.ts
```

- [ ] **Step 3: Implementar `lib/summarize.ts`**

```typescript
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory } from '@/lib/memory'
import { getContactById } from '@/lib/contacts'
import { loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'

const SYSTEM_PROMPT = `Resuma essa conversa em até 5 bullets (•). Capture: nome do contato,
intenção principal, dados técnicos (Part Number, modelo, urgência), estágio atual
(cotação? aguardando? fechamento?), e próximos passos. Use frases curtas e densas.
Se faltar informação, indique explicitamente.`

export async function generateSummary(contactId: string): Promise<{ summary: string }> {
  const contact = await getContactById(contactId)
  if (!contact) throw new Error('Contato não encontrado')
  if (!contact.whatsapp_identifier) throw new Error('whatsapp_identifier ausente')

  const history = await loadHistory(contact.whatsapp_identifier)
  const conversation = history.map(m => `${m.role}: ${m.content}`).join('\n')

  const openaiCfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: openaiCfg.apiKey })

  const { text } = await generateText({
    model: openai(openaiCfg.model),
    system: SYSTEM_PROMPT,
    prompt: `Contato: ${contact.name ?? 'sem nome'}\n\nConversa:\n${conversation}`,
  })

  const supabase = getAdminClient()
  await supabase
    .from('contacts')
    .update({ summary: text, summary_generated_at: new Date().toISOString() })
    .eq('id', contactId)

  return { summary: text }
}
```

- [ ] **Step 4: Rodar — deve passar**

```bash
npm test tests/summarize.test.ts
```

Esperado: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/summarize.ts tests/summarize.test.ts
git commit -m "feat: add summarize module for on-demand conversation summary"
```

---

## Task 6: Atualizar `lib/prompt.ts` (seção 12)

**Files:**
- Modify: `lib/prompt.ts`

- [ ] **Step 1: Localizar o final do `DEFAULT_JET_PROMPT`**

Antes do trecho `A data atual é ${CURRENT_DATE}.`, adicionar a nova seção 12.

Abrir `lib/prompt.ts` e inserir esse bloco logo antes da linha `A data atual é \${CURRENT_DATE}.`:

```
---

## 12. ETIQUETAS (use as ferramentas add_label/remove_label conforme o fluxo)

Aplique as tags na hora certa para manter o CRM organizado. Não comente sobre essas tags com o cliente — são internas.

**Quando aplicar:**
- Primeira mensagem do contato → \`add_label('novo_lead')\`
- Você acabou de pedir o Part Number → \`add_label('aguardando_pn')\`
- O cliente enviou o PN → \`remove_label('aguardando_pn')\` e \`add_label('pendente_orcamento')\`
- Você sinalizou que a cotação será encaminhada (\"Recebi os dados...\") → \`add_label('orcamento_enviado')\`
- Cliente confirmou fechamento → \`add_label('lead_ganho')\`
- Cliente desistiu ou perfil não se encaixa → \`add_label('lead_perdido')\`

**Regras:**
- Nunca tente \`add_label('atendimento_ia')\` — o sistema gerencia
- Use as tools dentro do mesmo turno em que a ação acontece
- Pode chamar várias tools em sequência se necessário (remover uma, adicionar outra)
```

- [ ] **Step 2: Verificar tipos compilam**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Rodar testes existentes (não deve quebrar nada)**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add lib/prompt.ts
git commit -m "feat: add section 12 to JET prompt teaching label usage"
```

---

## Task 7: Atualizar `lib/agent.ts` para suportar tools (TDD)

**Files:**
- Modify: `lib/agent.ts`
- Modify: `tests/agent.test.ts`

- [ ] **Step 1: Substituir conteúdo de `tests/agent.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
  tool: vi.fn((cfg: unknown) => cfg),
}))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))

import { runAgent } from '@/lib/agent'
import { generateText } from 'ai'
import { loadHistory, saveMessage } from '@/lib/memory'

const mockGenerate = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>

describe('runAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama generateText com tools fornecidos', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValue({ text: 'Reply' })

    const tools = { add_label: { description: 'x' }, remove_label: { description: 'y' } }

    await runAgent('session-1', 'oi', 'PROMPT', 'sk', 'gpt-4o-mini', tools as any)

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools,
        messages: [{ role: 'user', content: 'oi' }],
      })
    )
  })

  it('funciona sem tools (param opcional)', async () => {
    mockLoadHistory.mockResolvedValue([])
    mockGenerate.mockResolvedValue({ text: 'Reply' })

    await runAgent('session-1', 'oi', 'PROMPT', 'sk', 'gpt-4o-mini')

    const call = mockGenerate.mock.calls[0][0]
    expect(call.tools).toBeUndefined()
  })

  it('salva user e assistant, retorna text', async () => {
    mockLoadHistory.mockResolvedValue([{ role: 'user', content: 'antigo' }])
    mockGenerate.mockResolvedValue({ text: 'Resposta' })

    const result = await runAgent('s', 'nova', 'PROMPT', 'sk', 'gpt-4o-mini')

    expect(mockSaveMessage).toHaveBeenCalledWith('s', 'user', 'nova')
    expect(mockSaveMessage).toHaveBeenCalledWith('s', 'assistant', 'Resposta')
    expect(result).toBe('Resposta')
  })
})
```

- [ ] **Step 2: Rodar — deve falhar (assinatura)**

```bash
npm test tests/agent.test.ts
```

- [ ] **Step 3: Atualizar `lib/agent.ts`**

```typescript
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { injectCurrentDate } from '@/lib/prompt'
import type { MemoryMessage } from '@/lib/types'

export async function runAgent(
  sessionId: string,
  userMessage: string,
  systemPrompt: string,
  openaiApiKey: string,
  openaiModel: string,
  tools?: Record<string, unknown>
): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)
  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const openai = createOpenAI({ apiKey: openaiApiKey })

  const generateParams: Parameters<typeof generateText>[0] = {
    model: openai(openaiModel),
    system: injectCurrentDate(systemPrompt),
    messages,
    stopWhen: ({ steps }) => steps.length >= 5,
  }
  if (tools) generateParams.tools = tools as never

  const { text } = await generateText(generateParams)

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
```

`stopWhen` limita o agente a no máximo 5 passos (chamadas de tool + resposta final). Evita loops.

- [ ] **Step 4: Rodar — deve passar**

```bash
npm test tests/agent.test.ts
```

Esperado: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts tests/agent.test.ts
git commit -m "feat: agent accepts tools param for label management"
```

---

## Task 8: Refatorar webhook (TDD)

**Files:**
- Modify: `app/api/webhook/route.ts`
- Modify: `tests/webhook.test.ts`

- [ ] **Step 1: Substituir conteúdo de `tests/webhook.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/agent', () => ({
  runAgent: vi.fn().mockResolvedValue('Reply do JET.'),
}))
vi.mock('@/lib/quepasa', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/inboxes', () => ({
  loadInboxByChatwootId: vi.fn(),
  loadOpenAIConfig: vi.fn(),
}))
vi.mock('@/lib/contacts', () => ({
  upsertContact: vi.fn(),
  updateContactLabels: vi.fn(),
}))
vi.mock('@/lib/memory', () => ({
  loadHistory: vi.fn().mockResolvedValue([]),
  saveMessage: vi.fn(),
}))
vi.mock('@/lib/tags', () => ({
  addLabel: vi.fn(),
  removeLabel: vi.fn(),
}))

import { POST } from '@/app/api/webhook/route'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel } from '@/lib/tags'

const mockRunAgent = runAgent as ReturnType<typeof vi.fn>
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>
const mockLoadInbox = loadInboxByChatwootId as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>
const mockUpsertContact = upsertContact as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>
const mockAddLabel = addLabel as ReturnType<typeof vi.fn>

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const baseInbox = {
  id: 'inbox-uuid', name: 'AJ', chatwoot_base_url: 'https://x.com',
  chatwoot_account_id: 14, chatwoot_inbox_id: 45,
  chatwoot_user_token: 'tok',
  quepasa_host: 'https://qp.example.com', quepasa_token: 'qp-token',
  system_prompt: 'PROMPT', enabled: true,
}

const incomingFromContact = {
  inbox_id: 45,
  id: 17,
  conversation: { labels: [] },
  messages: [{
    id: 1, content: 'oi', message_type: 0,
    conversation_id: 17,
    sender_type: 'Contact',
    sender: { id: 5, identifier: '5511999@s.whatsapp.net', phone_number: '+5511999', name: 'João' },
  }],
}

const incomingFromHuman = {
  inbox_id: 45,
  id: 17,
  conversation: { labels: ['atendimento_ia'] },
  messages: [{
    id: 2, content: 'oi sou humano', message_type: 1,
    conversation_id: 17,
    sender_type: 'User',
    sender: { id: 2, name: 'Atendente' },
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadInbox.mockResolvedValue(baseInbox)
  mockLoadOpenAI.mockResolvedValue({ apiKey: 'sk', model: 'gpt-4o-mini' })
  mockUpsertContact.mockResolvedValue({
    contact: {
      id: 'contact-uuid', inbox_id: 'inbox-uuid', chatwoot_conversation_id: 17,
      current_labels: [], status: 'humano', message_count: 1,
    },
    wasNew: true,
  })
})

describe('POST /api/webhook', () => {
  it('upsert contact em toda mensagem', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockUpsertContact).toHaveBeenCalled()
  })

  it('salva mensagem do Contact na memória', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockSaveMessage).toHaveBeenCalledWith('5511999@s.whatsapp.net', 'user', 'oi')
  })

  it('salva mensagem do humano (User) com prefixo [atendente]:', async () => {
    mockUpsertContact.mockResolvedValue({
      contact: {
        id: 'c', inbox_id: 'i', chatwoot_conversation_id: 17, whatsapp_identifier: '5511999@s.whatsapp.net',
        current_labels: ['atendimento_ia'], status: 'ia', message_count: 5,
      },
      wasNew: false,
    })
    await POST(makeRequest(incomingFromHuman))
    expect(mockSaveMessage).toHaveBeenCalledWith('5511999@s.whatsapp.net', 'user', '[atendente]: oi sou humano')
  })

  it('humano (User) não dispara resposta', async () => {
    await POST(makeRequest(incomingFromHuman))
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('AgentBot (message_type=1 com sender_type=AgentBot) é ignorado por completo', async () => {
    const p = {
      ...incomingFromContact,
      messages: [{ ...incomingFromContact.messages[0], message_type: 1, sender_type: 'AgentBot' }],
    }
    await POST(makeRequest(p))
    expect(mockSaveMessage).not.toHaveBeenCalled()
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('primeira mensagem do contato (wasNew=true) dispara resposta mesmo sem tag', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockRunAgent).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalled()
  })

  it('adiciona atendimento_ia após primeira resposta', async () => {
    await POST(makeRequest(incomingFromContact))
    expect(mockAddLabel).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://x.com', accountId: 14 }),
      17,
      [],
      'atendimento_ia'
    )
  })

  it('Contact sem tag atendimento_ia e não é primeira → não responde', async () => {
    mockUpsertContact.mockResolvedValue({
      contact: {
        id: 'c', inbox_id: 'i', chatwoot_conversation_id: 17,
        current_labels: ['novo_lead'], status: 'humano', message_count: 3,
      },
      wasNew: false,
    })
    await POST(makeRequest(incomingFromContact))
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('Contact com tag atendimento_ia → responde', async () => {
    mockUpsertContact.mockResolvedValue({
      contact: {
        id: 'c', inbox_id: 'i', chatwoot_conversation_id: 17,
        current_labels: ['atendimento_ia'], status: 'ia', message_count: 3,
      },
      wasNew: false,
    })
    await POST(makeRequest(incomingFromContact))
    expect(mockRunAgent).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
npm test tests/webhook.test.ts
```

- [ ] **Step 3: Substituir conteúdo de `app/api/webhook/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { tool } from 'ai'
import { z } from 'zod'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/quepasa'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { upsertContact, updateContactLabels } from '@/lib/contacts'
import { saveMessage } from '@/lib/memory'
import { addLabel, removeLabel } from '@/lib/tags'
import { BUSINESS_LABELS, SYSTEM_LABEL } from '@/lib/types'

interface ChatwootSender {
  id?: number
  identifier?: string
  name?: string
  phone_number?: string | null
  type?: string
}

interface ChatwootMessage {
  id?: number
  content?: string | null
  message_type?: number
  conversation_id?: number
  sender_type?: 'Contact' | 'User' | 'AgentBot'
  sender?: ChatwootSender
}

interface ChatwootConversation {
  id?: number
  labels?: string[]
}

interface RawPayload {
  body?: RawPayload
  id?: number
  inbox_id?: number
  messages?: ChatwootMessage[]
  conversation?: ChatwootConversation
  labels?: string[]
  meta?: { sender?: ChatwootSender }
}

function extractChatId(identifier?: string, phoneNumber?: string | null): string | null {
  if (identifier) {
    const digits = identifier.split('@')[0].replace(/\D/g, '')
    if (digits) return digits
  }
  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits) return digits
  }
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw: RawPayload = await req.json()
  const data: RawPayload = raw.body ?? raw

  console.log(`[webhook] RAW: ${JSON.stringify(raw).slice(0, 800)}`)

  const chatwootInboxId = data.inbox_id
  if (!chatwootInboxId) return NextResponse.json({ ok: true })

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox || !inbox.enabled) return NextResponse.json({ ok: true })

  const message = data.messages?.[0]
  if (!message || !message.content) return NextResponse.json({ ok: true })

  // AgentBot messages are our own replies — already in memory, skip entirely
  if (message.sender_type === 'AgentBot') {
    return NextResponse.json({ ok: true })
  }

  const conversationId = data.id ?? message.conversation_id
  if (!conversationId) return NextResponse.json({ ok: true })

  const senderIdent = data.meta?.sender?.identifier ?? message.sender?.identifier
  const senderPhone = data.meta?.sender?.phone_number ?? message.sender?.phone_number
  const senderName = data.meta?.sender?.name ?? message.sender?.name
  const chatId = extractChatId(senderIdent, senderPhone)
  const sessionId = senderIdent

  if (!sessionId || !chatId) return NextResponse.json({ ok: true })

  const labels = data.conversation?.labels ?? data.labels ?? []

  // Upsert contact (always)
  const { contact, wasNew } = await upsertContact({
    inbox_id: inbox.id,
    chatwoot_conversation_id: conversationId,
    chatwoot_contact_id: message.sender?.id ?? null,
    name: senderName ?? null,
    phone_number: senderPhone ?? null,
    whatsapp_identifier: senderIdent ?? null,
    current_labels: labels,
    last_message: message.content,
    last_message_at: new Date().toISOString(),
  })

  // Save to memory (always — Contact and User both stored)
  const isHuman = message.sender_type === 'User'
  const isContact = message.sender_type === 'Contact'
  if (isContact) {
    await saveMessage(sessionId, 'user', message.content)
  } else if (isHuman) {
    await saveMessage(sessionId, 'user', `[atendente]: ${message.content}`)
  }

  // Only Contact messages can trigger a reply
  if (!isContact) return NextResponse.json({ ok: true })

  // Decide if bot should respond
  const hasAtendimentoIA = labels.includes(SYSTEM_LABEL)
  if (!hasAtendimentoIA && !wasNew) {
    console.log(`[webhook] handoff: humano assumiu conversation=${conversationId}`)
    return NextResponse.json({ ok: true })
  }

  if (!inbox.quepasa_host || !inbox.quepasa_token) {
    console.warn(`[webhook] Inbox ${inbox.id} sem QuePasa configurado`)
    return NextResponse.json({ ok: true })
  }

  console.log(`[webhook] processing inbox=${inbox.id} conv=${conversationId} wasNew=${wasNew} hasIA=${hasAtendimentoIA}`)

  // Build tools — they close over current state to mutate labels
  let labelsState = [...labels]
  const chatwootCfg = {
    baseUrl: inbox.chatwoot_base_url,
    accountId: inbox.chatwoot_account_id,
    userToken: inbox.chatwoot_user_token,
  }

  const labelEnum = z.enum(BUSINESS_LABELS)
  const tools = {
    add_label: tool({
      description: 'Adiciona uma etiqueta de negócio à conversa atual.',
      inputSchema: z.object({ label: labelEnum }),
      execute: async ({ label }) => {
        labelsState = await addLabel(chatwootCfg, conversationId, labelsState, label)
        await updateContactLabels(contact.id, labelsState)
        return { ok: true, labels: labelsState }
      },
    }),
    remove_label: tool({
      description: 'Remove uma etiqueta de negócio da conversa atual.',
      inputSchema: z.object({ label: labelEnum }),
      execute: async ({ label }) => {
        labelsState = await removeLabel(chatwootCfg, conversationId, labelsState, label)
        await updateContactLabels(contact.id, labelsState)
        return { ok: true, labels: labelsState }
      },
    }),
  }

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    message.content,
    inbox.system_prompt,
    openai.apiKey,
    openai.model,
    tools
  )

  console.log(`[webhook] replyLen=${reply.length}`)

  await sendMessage(
    { host: inbox.quepasa_host, token: inbox.quepasa_token },
    chatId,
    reply
  )

  // Auto-add atendimento_ia after first reply
  if (!hasAtendimentoIA) {
    labelsState = await addLabel(chatwootCfg, conversationId, labelsState, SYSTEM_LABEL)
    await updateContactLabels(contact.id, labelsState)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Rodar — deve passar**

```bash
npm test tests/webhook.test.ts
```

Esperado: 9/9 pass.

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add app/api/webhook/route.ts tests/webhook.test.ts
git commit -m "feat: webhook upserts contact, handles handoff, runs agent with label tools"
```

---

## Task 9: API contacts — GET list

**Files:**
- Create: `app/api/contacts/route.ts`

- [ ] **Step 1: Criar `app/api/contacts/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const status = url.searchParams.get('status')
  const inboxId = url.searchParams.get('inbox_id')
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const sort = url.searchParams.get('sort') ?? 'last_message_at:desc'

  let query = supabase.from('contacts').select('*', { count: 'exact' })

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%,whatsapp_identifier.ilike.%${q}%`)
  }
  if (status && ['ia', 'humano', 'encerrado'].includes(status)) {
    query = query.eq('status', status)
  }
  if (inboxId) {
    query = query.eq('inbox_id', inboxId)
  }

  const [sortKey, sortDir] = sort.split(':')
  const validSorts = ['last_message_at', 'name', 'message_count', 'first_seen_at']
  if (validSorts.includes(sortKey)) {
    query = query.order(sortKey, { ascending: sortDir === 'asc' })
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    contacts: data,
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/contacts/route.ts
git commit -m "feat: add GET /api/contacts with filters and pagination"
```

---

## Task 10: API contacts — POST summary

**Files:**
- Create: `app/api/contacts/[id]/summary/route.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { generateSummary } from '@/lib/summarize'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const result = await generateSummary(params.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro ao gerar resumo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/contacts/[id]/summary/route.ts
git commit -m "feat: add POST /api/contacts/[id]/summary endpoint"
```

---

## Task 11: Componente `components/summary-modal.tsx`

**Files:**
- Create: `components/summary-modal.tsx`

- [ ] **Step 1: Criar componente**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SummaryModalProps {
  contactId: string
  contactName: string | null
  initialSummary: string | null
  initialGeneratedAt: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SummaryModal({
  contactId, contactName, initialSummary, initialGeneratedAt, open, onOpenChange,
}: SummaryModalProps) {
  const [summary, setSummary] = useState(initialSummary)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function regenerate() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/contacts/${contactId}/summary`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Erro ao gerar resumo')
      setLoading(false)
      return
    }
    const body = await res.json()
    setSummary(body.summary)
    setGeneratedAt(new Date().toISOString())
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resumo — {contactName ?? 'Contato'}</DialogTitle>
        </DialogHeader>
        {summary ? (
          <>
            <pre className="whitespace-pre-wrap text-sm">{summary}</pre>
            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Gerado em {new Date(generatedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum resumo gerado ainda.</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={regenerate} disabled={loading}>
            {loading ? 'Gerando...' : summary ? 'Atualizar' : 'Gerar resumo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/summary-modal.tsx
git commit -m "feat: add summary modal component"
```

---

## Task 12: Componente `components/contacts-table.tsx`

**Files:**
- Create: `components/contacts-table.tsx`

- [ ] **Step 1: Criar componente**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SummaryModal } from '@/components/summary-modal'
import type { Contact } from '@/lib/types'

interface Inbox { id: string; name: string; chatwoot_base_url: string; chatwoot_account_id: number }
interface Props { contacts: Contact[]; total: number; page: number; pageSize: number; inboxes: Inbox[] }

function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    ia: 'bg-green-100 text-green-800',
    humano: 'bg-yellow-100 text-yellow-800',
    encerrado: 'bg-gray-100 text-gray-800',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? ''}`}>{status.toUpperCase()}</span>
}

function labelBadge(label: string) {
  return (
    <span key={label} className="inline-flex px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 mr-1">
      {label}
    </span>
  )
}

export function ContactsTable({ contacts, total, page, pageSize, inboxes }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all')
  const [inboxId, setInboxId] = useState(searchParams.get('inbox_id') ?? 'all')
  const [modalContactId, setModalContactId] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const inboxMap = new Map(inboxes.map(i => [i.id, i]))
  const modalContact = contacts.find(c => c.id === modalContactId) ?? null

  function applyFilters(e?: React.FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status !== 'all') params.set('status', status)
    if (inboxId !== 'all') params.set('inbox_id', inboxId)
    params.set('page', '1')
    router.push(`/dashboard/contacts?${params.toString()}`)
  }

  function gotoPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/dashboard/contacts?${params.toString()}`)
  }

  function chatwootLink(c: Contact): string {
    const inbox = inboxMap.get(c.inbox_id)
    if (!inbox) return '#'
    return `${inbox.chatwoot_base_url}/app/accounts/${inbox.chatwoot_account_id}/conversations/${c.chatwoot_conversation_id}`
  }

  return (
    <div className="space-y-4">
      <form onSubmit={applyFilters} className="flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Buscar por nome, telefone..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ia">IA</SelectItem>
              <SelectItem value="humano">Humano</SelectItem>
              <SelectItem value="encerrado">Encerrado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {inboxes.length > 1 && (
          <div>
            <Select value={inboxId} onValueChange={setInboxId}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas inboxes</SelectItem>
                {inboxes.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="submit">Filtrar</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Última msg</TableHead>
            <TableHead>Última interação</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Primeiro contato</TableHead>
            <TableHead>Chatwoot</TableHead>
            <TableHead>Resumo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name ?? '-'}</TableCell>
              <TableCell>{c.phone_number ?? '-'}</TableCell>
              <TableCell>{c.current_labels.map(labelBadge)}</TableCell>
              <TableCell>{statusBadge(c.status)}</TableCell>
              <TableCell className="max-w-[200px] truncate">{c.last_message ?? '-'}</TableCell>
              <TableCell className="text-sm">{formatRelative(c.last_message_at)}</TableCell>
              <TableCell>{c.message_count}</TableCell>
              <TableCell className="text-sm">{new Date(c.first_seen_at).toLocaleDateString('pt-BR')}</TableCell>
              <TableCell>
                <Link href={chatwootLink(c)} target="_blank" className="text-blue-600 hover:underline">↗</Link>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => setModalContactId(c.id)}>
                  {c.summary ? 'Ver' : 'Gerar'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {contacts.length === 0 && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum contato.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex justify-between items-center text-sm">
        <span className="text-muted-foreground">{total} contatos | página {page} de {totalPages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => gotoPage(page + 1)}>Próxima</Button>
        </div>
      </div>

      {modalContact && (
        <SummaryModal
          contactId={modalContact.id}
          contactName={modalContact.name}
          initialSummary={modalContact.summary}
          initialGeneratedAt={modalContact.summary_generated_at}
          open={!!modalContactId}
          onOpenChange={open => !open && setModalContactId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/contacts-table.tsx
git commit -m "feat: add contacts table component with filters and pagination"
```

---

## Task 13: Página `/dashboard/contacts`

**Files:**
- Create: `app/dashboard/contacts/page.tsx`

- [ ] **Step 1: Criar página**

```typescript
import { getServerClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContactsTable } from '@/components/contacts-table'
import type { Contact } from '@/lib/types'

const PAGE_SIZE = 50

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; inbox_id?: string; page?: string }
}) {
  const supabase = getServerClient()

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const q = searchParams.q?.trim()
  const status = searchParams.status
  const inboxId = searchParams.inbox_id

  let query = supabase.from('contacts').select('*', { count: 'exact' })
  if (q) query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%,whatsapp_identifier.ilike.%${q}%`)
  if (status && ['ia', 'humano', 'encerrado'].includes(status)) query = query.eq('status', status)
  if (inboxId) query = query.eq('inbox_id', inboxId)
  query = query.order('last_message_at', { ascending: false, nullsFirst: false })
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data: contacts, count } = await query
  const { data: inboxes } = await supabase
    .from('inboxes')
    .select('id, name, chatwoot_base_url, chatwoot_account_id')

  return (
    <Card>
      <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
      <CardContent>
        <ContactsTable
          contacts={(contacts ?? []) as Contact[]}
          total={count ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          inboxes={inboxes ?? []}
        />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/contacts/page.tsx
git commit -m "feat: add /dashboard/contacts page"
```

---

## Task 14: Card "contatos hoje" no `/dashboard` + nav

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Adicionar link "Contatos" no nav — `app/dashboard/layout.tsx`**

Localizar o `<nav>` no layout e adicionar o link entre "Inboxes" e "OpenAI":

Substituir o bloco da nav (procurar pela linha que contém `Inboxes`):

```typescript
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="hover:underline">Inboxes</Link>
              <Link href="/dashboard/contacts" className="hover:underline">Contatos</Link>
              <Link href="/dashboard/settings/openai" className="hover:underline">OpenAI</Link>
              <Link href="/dashboard/settings/users" className="hover:underline">Usuários</Link>
            </nav>
```

- [ ] **Step 2: Adicionar card de contatos hoje em `app/dashboard/page.tsx`**

Abrir o arquivo. Antes do bloco `<Card>` com o "Status", inserir um novo card. Localizar a função `DashboardPage` e o `return`. Logo após o cálculo de `total/active`, antes do JSX, adicionar:

```typescript
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .gte('first_seen_at', since.toISOString())
  const { count: contactsTotal } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
```

E adicionar o card no JSX, antes do card de "Status":

```typescript
      <Card>
        <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{todayCount ?? 0} <span className="text-base font-normal text-muted-foreground">hoje | {contactsTotal ?? 0} no total</span></p>
          <Link href="/dashboard/contacts" className="text-sm text-blue-600 hover:underline">Ver todos →</Link>
        </CardContent>
      </Card>
```

Garantir que `import Link from 'next/link'` está presente no topo do arquivo (já deve estar).

- [ ] **Step 3: Verificar build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/layout.tsx
git commit -m "feat: dashboard home shows contacts today + nav link"
```

---

## Task 15: Build final, testes e deploy

- [ ] **Step 1: Rodar todos os testes**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm test
```

Esperado: todos os testes passam (memory + chatwoot/quepasa + agent + inboxes + webhook + tags + contacts + summarize).

- [ ] **Step 2: Rodar build**

```bash
npm run build
```

Esperado: build sem erros. Resolver erros de TypeScript se aparecerem.

- [ ] **Step 3: Push no GitHub**

```bash
git push "https://leaderaperformance-max:<GITHUB_PAT>@github.com/leaderaperformance-max/amazon_jet_aviation_agent.git" main
```

(Substituir `<GITHUB_PAT>` pelo token do usuário.)

- [ ] **Step 4: Deploy para produção**

```bash
vercel --prod --yes
```

- [ ] **Step 5: Smoke test em produção**

```bash
curl -s -X POST "https://amazon-jet-aviation-agent.vercel.app/api/webhook" \
  -H "Content-Type: application/json" \
  -d '{}' -w "\nHTTP %{http_code}\n"
```

Esperado: `{"ok":true}` HTTP 200.

Acessar `https://amazon-jet-aviation-agent.vercel.app/dashboard/contacts` no browser — deve aparecer a tabela vazia (ainda sem contatos atendidos com a nova lógica) ou com os contatos antigos se já houve interação.

- [ ] **Step 6: Teste end-to-end**

Enviar mensagem no WhatsApp conectado à inbox. Verificar:
1. Bot responde
2. Tag `atendimento_ia` aparece no Chatwoot
3. Outras tags são adicionadas conforme o fluxo (ex: `novo_lead`, `aguardando_pn`)
4. Contato aparece em `/dashboard/contacts`
5. Clicar "Gerar resumo" produz um resumo válido

- [ ] **Step 7: Commit final (se houver mudanças)**

```bash
git add .
git commit -m "feat: phase 2 dashboard + tags + handoff complete" --allow-empty
```

---

## Self-Review

### Cobertura do spec

| Requisito do spec | Task |
|---|---|
| Nova tabela `contacts` + RLS | Task 1 |
| Tipos `Contact`, `BusinessLabel`, `ContactStatus` | Task 2 |
| `lib/tags.ts` (addLabel/removeLabel/syncLabels) | Task 3 |
| `lib/contacts.ts` (upsert/get/updateLabels) | Task 4 |
| `lib/summarize.ts` | Task 5 |
| Seção 12 do system prompt | Task 6 |
| `lib/agent.ts` aceita tools | Task 7 |
| Webhook: upsert + memory + handoff + tools | Task 8 |
| GET /api/contacts com filtros | Task 9 |
| POST /api/contacts/[id]/summary | Task 10 |
| Modal de resumo | Task 11 |
| Tabela de contatos | Task 12 |
| Página /dashboard/contacts | Task 13 |
| Card "contatos hoje" + link na nav | Task 14 |
| Build + deploy + smoke test | Task 15 |

### Consistência

- `Contact` definido em Task 2, consumido em Tasks 4, 9, 12, 13 ✓
- `BusinessLabel`/`SYSTEM_LABEL` definidos em Task 2, consumidos em Tasks 3, 4, 6, 8 ✓
- `addLabel(cfg, convId, currentLabels, label)` assinatura consistente Task 3 → Task 8 ✓
- `upsertContact(input)` retorna `{contact, wasNew}` em Task 4, consumido em Task 8 ✓
- `runAgent(...tools?)` assinatura nova em Task 7, consumido em Task 8 ✓
- `generateSummary(contactId)` em Task 5, consumido em Task 10 ✓

### Sem placeholders

Todos os steps têm código completo. Sem "TBD", "implement later", etc. ✓
