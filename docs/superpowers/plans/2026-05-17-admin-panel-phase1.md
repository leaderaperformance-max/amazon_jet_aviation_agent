# Painel Admin — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar painel administrativo ao projeto Next.js com autenticação multiusuário (Supabase Auth), CRUD de inboxes, edição de system prompt e configuração de credenciais OpenAI.

**Architecture:** Mesmo Next.js, mesmo deploy. Tudo via Supabase (Auth + Postgres). Webhook continua público; rotas `/dashboard/*` protegidas por middleware. Config do agente migra de `.env` para tabelas no banco. shadcn/ui + Tailwind para UI.

**Tech Stack:** Next.js 14, TypeScript, Supabase Auth + Postgres, `@supabase/ssr`, shadcn/ui, Tailwind CSS, react-hook-form, zod, Vitest.

---

## File Map

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `lib/supabase/server.ts` | Supabase client SSR (server components, server actions) | Novo |
| `lib/supabase/browser.ts` | Supabase client browser (client components) | Novo |
| `lib/supabase/admin.ts` | Service-role client (webhook bypass RLS) | Novo |
| `lib/inboxes.ts` | `loadInboxByChatwootId`, `loadOpenAIConfig` | Novo |
| `lib/prompt.ts` | `injectCurrentDate(prompt)` — utility de data | Refatorar |
| `lib/agent.ts` | `runAgent(sessionId, msg, prompt, apiKey, model)` | Refatorar |
| `lib/chatwoot.ts` | `sendMessage(config, conversationId, content)` | Refatorar |
| `lib/types.ts` | Adicionar `InboxConfig`, `OpenAIConfig` | Modificar |
| `app/api/webhook/route.ts` | Usa `loadInboxByChatwootId` + nova assinatura | Refatorar |
| `middleware.ts` | Protege `/dashboard/*` via cookie de sessão | Novo |
| `app/(auth)/login/page.tsx` | Tela de login | Novo |
| `app/(auth)/setup/page.tsx` | Cria primeiro admin | Novo |
| `app/dashboard/layout.tsx` | Layout protegido + nav | Novo |
| `app/dashboard/page.tsx` | Lista de inboxes | Novo |
| `app/dashboard/inboxes/new/page.tsx` | Criar inbox | Novo |
| `app/dashboard/inboxes/[id]/page.tsx` | Editar inbox | Novo |
| `app/dashboard/settings/openai/page.tsx` | Configurar OpenAI | Novo |
| `app/dashboard/settings/users/page.tsx` | Convidar admins | Novo |
| `app/api/inboxes/route.ts` | GET (list), POST (create) | Novo |
| `app/api/inboxes/[id]/route.ts` | GET, PUT, DELETE | Novo |
| `app/api/settings/openai/route.ts` | GET, PUT | Novo |
| `app/api/settings/users/route.ts` | GET, POST (invite), DELETE | Novo |
| `components/ui/*` | shadcn components (button, input, etc.) | Novo (CLI) |
| `tests/inboxes.test.ts` | Testes do módulo inboxes | Novo |

---

## Task 1: Instalar Tailwind, shadcn/ui e Supabase SSR

**Files:** `package.json`, `tailwind.config.ts`, `postcss.config.js`, `app/globals.css`, `components.json`

- [ ] **Step 1: Instalar Tailwind**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configurar `tailwind.config.ts`**

Sobrescrever `tailwind.config.js` (gerado pelo init) com `tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {},
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
```

Remover `tailwind.config.js`.

- [ ] **Step 3: Configurar globals.css**

Sobrescrever `app/globals.css` com:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 4: Instalar dependências shadcn e supabase**

```bash
npm install class-variance-authority clsx tailwind-merge lucide-react tailwindcss-animate
npm install @supabase/ssr react-hook-form zod @hookform/resolvers
```

- [ ] **Step 5: Inicializar shadcn**

```bash
npx shadcn@latest init -y -d
```

Aceitar defaults. Isto cria `components.json`, `lib/utils.ts` e configura paths.

- [ ] **Step 6: Instalar componentes shadcn que vamos usar**

```bash
npx shadcn@latest add button input label textarea card table dialog toast select switch tabs form
```

- [ ] **Step 7: Verificar build**

```bash
npm run build
```

Esperado: build passa sem erro.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: install tailwind, shadcn/ui and supabase ssr"
```

---

## Task 2: Migração SQL — criar tabelas `app_settings` e `inboxes`

**Files:** Nenhum local (executar no Supabase SQL Editor)

- [ ] **Step 1: Executar SQL no Supabase Dashboard**

Acessar `https://oncfstviluxmzenfuyot.supabase.co` → SQL Editor → New Query → colar e Run:

```sql
-- 1) Configuração global (1 linha só)
CREATE TABLE IF NOT EXISTS app_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  openai_api_key  TEXT,
  openai_model    TEXT DEFAULT 'gpt-4o-mini',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 2) Inboxes
CREATE TABLE IF NOT EXISTS inboxes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  chatwoot_base_url     TEXT NOT NULL,
  chatwoot_account_id   INT  NOT NULL,
  chatwoot_inbox_id     INT  NOT NULL,
  chatwoot_user_token   TEXT NOT NULL,
  system_prompt         TEXT NOT NULL,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chatwoot_account_id, chatwoot_inbox_id)
);

CREATE INDEX IF NOT EXISTS idx_inboxes_chatwoot_inbox
  ON inboxes (chatwoot_inbox_id, enabled);

-- 3) RLS — só autenticados leem/escrevem
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read app_settings" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write app_settings" ON app_settings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated read inboxes" ON inboxes
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write inboxes" ON inboxes
  FOR ALL USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verificar as tabelas existem**

Executar no SQL Editor:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('app_settings', 'inboxes');
```

Esperado: 2 rows retornadas.

- [ ] **Step 3: Adicionar publishable key ao .env.local**

Obter a `anon` key no Supabase Dashboard → Project Settings → API → "anon public".

Adicionar ao `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://oncfstviluxmzenfuyot.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<colar-a-anon-key-aqui>
```

---

## Task 3: Atualizar `lib/types.ts` com tipos novos

**Files:** `lib/types.ts`

- [ ] **Step 1: Adicionar tipos ao final do arquivo**

Abrir `lib/types.ts` e adicionar no final:

```typescript
export interface InboxConfig {
  id: string
  name: string
  chatwoot_base_url: string
  chatwoot_account_id: number
  chatwoot_inbox_id: number
  chatwoot_user_token: string
  system_prompt: string
  enabled: boolean
}

export interface OpenAIConfig {
  apiKey: string
  model: string
}

export interface ChatwootApiConfig {
  baseUrl: string
  accountId: number
  userToken: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add InboxConfig, OpenAIConfig, ChatwootApiConfig types"
```

---

## Task 4: Refatorar `lib/prompt.ts` para `injectCurrentDate`

**Files:** `lib/prompt.ts`

- [ ] **Step 1: Substituir o conteúdo de `lib/prompt.ts`**

```typescript
export function injectCurrentDate(systemPrompt: string): string {
  const now = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
  return systemPrompt.replace(/\$\{CURRENT_DATE\}/g, now)
}

export const DEFAULT_JET_PROMPT = `# SYSTEM PROMPT — JET (Amazon Jet Aviation)

(prompt completo aqui — copiar do arquivo antigo)

A data atual é \${CURRENT_DATE}.`
```

**IMPORTANTE:** Substituir `(prompt completo aqui — copiar do arquivo antigo)` pelo conteúdo COMPLETO do system prompt que está atualmente em `lib/prompt.ts`, mas trocando a interpolação `${now}` por `\${CURRENT_DATE}` (escapar o `$` no template literal).

- [ ] **Step 2: Verificar tudo compila**

```bash
npx tsc --noEmit
```

Esperado: erros referenciando `getSystemPrompt` em `lib/agent.ts` e `tests/agent.test.ts`. Isso é esperado — corrigido nas próximas tasks.

- [ ] **Step 3: NÃO COMMITAR AINDA** — deixe para a próxima task que vai corrigir o agente.

---

## Task 5: Criar `lib/inboxes.ts` (TDD)

**Files:** `lib/inboxes.ts`, `lib/supabase/admin.ts`, `tests/inboxes.test.ts`

- [ ] **Step 1: Criar `lib/supabase/admin.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 2: Escrever o teste com falha — `tests/inboxes.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}))

import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'
import { getAdminClient } from '@/lib/supabase/admin'

const mockGetAdminClient = getAdminClient as ReturnType<typeof vi.fn>

describe('loadInboxByChatwootId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna inbox quando achada e enabled', async () => {
    const inbox = {
      id: 'abc', name: 'Amazon Jet', chatwoot_base_url: 'https://x.com',
      chatwoot_account_id: 14, chatwoot_inbox_id: 45,
      chatwoot_user_token: 'tok', system_prompt: 'prompt', enabled: true,
    }
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: inbox, error: null }),
          }),
        }),
      }),
    })

    const result = await loadInboxByChatwootId(45)
    expect(result).toEqual(inbox)
  })

  it('retorna null quando inbox não existe', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    const result = await loadInboxByChatwootId(999)
    expect(result).toBeNull()
  })
})

describe('loadOpenAIConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna apiKey e model do app_settings', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { openai_api_key: 'sk-xxx', openai_model: 'gpt-4o-mini' },
              error: null,
            }),
          }),
        }),
      }),
    })

    const result = await loadOpenAIConfig()
    expect(result).toEqual({ apiKey: 'sk-xxx', model: 'gpt-4o-mini' })
  })

  it('lança erro se openai_api_key estiver vazia', async () => {
    mockGetAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { openai_api_key: null, openai_model: 'gpt-4o-mini' },
              error: null,
            }),
          }),
        }),
      }),
    })

    await expect(loadOpenAIConfig()).rejects.toThrow('OpenAI API key não configurada')
  })
})
```

- [ ] **Step 3: Rodar teste — deve falhar**

```bash
npm test tests/inboxes.test.ts
```

Esperado: erro `Cannot find module '@/lib/inboxes'`.

- [ ] **Step 4: Criar `lib/inboxes.ts`**

```typescript
import { getAdminClient } from '@/lib/supabase/admin'
import type { InboxConfig, OpenAIConfig } from '@/lib/types'

export async function loadInboxByChatwootId(chatwootInboxId: number): Promise<InboxConfig | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('inboxes')
    .select('*')
    .eq('chatwoot_inbox_id', chatwootInboxId)
    .maybeSingle()

  if (error) throw error
  return data as InboxConfig | null
}

export async function loadOpenAIConfig(): Promise<OpenAIConfig> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('openai_api_key, openai_model')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  if (!data?.openai_api_key) throw new Error('OpenAI API key não configurada')

  return { apiKey: data.openai_api_key, model: data.openai_model ?? 'gpt-4o-mini' }
}
```

- [ ] **Step 5: Rodar teste — deve passar**

```bash
npm test tests/inboxes.test.ts
```

Esperado: 4/4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add lib/inboxes.ts lib/supabase/admin.ts tests/inboxes.test.ts
git commit -m "feat: add inboxes module to load config from Supabase"
```

---

## Task 6: Refatorar `lib/agent.ts` (TDD)

**Files:** `lib/agent.ts`, `tests/agent.test.ts`

- [ ] **Step 1: Atualizar `tests/agent.test.ts`** (substituir conteúdo todo)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/memory', () => ({ loadHistory: vi.fn(), saveMessage: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))

import { runAgent } from '@/lib/agent'
import { generateText } from 'ai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { createOpenAI } from '@ai-sdk/openai'

const mockGenerateText = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>
const mockCreateOpenAI = createOpenAI as ReturnType<typeof vi.fn>

describe('runAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama generateText com prompt e modelo dados, salva user+assistant, retorna text', async () => {
    mockLoadHistory.mockResolvedValue([{ role: 'user', content: 'olá' }])
    mockGenerateText.mockResolvedValue({ text: 'Reply do JET' })

    const result = await runAgent(
      'session-1',
      'preciso de uma peça',
      'PROMPT_BASE com ${CURRENT_DATE}',
      'sk-test',
      'gpt-4o-mini'
    )

    expect(mockCreateOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test' })
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mocked-gpt-4o-mini',
        system: expect.stringContaining('PROMPT_BASE com'),
        messages: [
          { role: 'user', content: 'olá' },
          { role: 'user', content: 'preciso de uma peça' },
        ],
      })
    )
    // a data deve ter sido injetada
    const callArgs = mockGenerateText.mock.calls[0][0]
    expect(callArgs.system).not.toContain('${CURRENT_DATE}')

    expect(mockSaveMessage).toHaveBeenCalledWith('session-1', 'user', 'preciso de uma peça')
    expect(mockSaveMessage).toHaveBeenCalledWith('session-1', 'assistant', 'Reply do JET')
    expect(result).toBe('Reply do JET')
  })
})
```

- [ ] **Step 2: Rodar teste — deve falhar**

```bash
npm test tests/agent.test.ts
```

Esperado: erros (assinatura antiga).

- [ ] **Step 3: Substituir o conteúdo de `lib/agent.ts`**

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
  openaiModel: string
): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)
  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const openai = createOpenAI({ apiKey: openaiApiKey })

  const { text } = await generateText({
    model: openai(openaiModel),
    system: injectCurrentDate(systemPrompt),
    messages,
  })

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
```

- [ ] **Step 4: Rodar teste — deve passar**

```bash
npm test tests/agent.test.ts
```

Esperado: 1/1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts lib/prompt.ts tests/agent.test.ts
git commit -m "refactor: agent now accepts prompt/key/model as parameters"
```

---

## Task 7: Refatorar `lib/chatwoot.ts` (TDD)

**Files:** `lib/chatwoot.ts`, `tests/chatwoot.test.ts`

- [ ] **Step 1: Substituir `tests/chatwoot.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendMessage } from '@/lib/chatwoot'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendMessage', () => {
  it('faz POST com URL, headers e body corretos a partir do config', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    await sendMessage(
      { baseUrl: 'https://chat.example.com', accountId: 14, userToken: 'tok-123' },
      42,
      'Olá!'
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/api/v1/accounts/14/conversations/42/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': 'tok-123',
        },
        body: JSON.stringify({
          content: 'Olá!',
          message_type: 'outgoing',
          private: false,
        }),
      }
    )
  })

  it('não lança erro quando fetch retorna não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await expect(
      sendMessage({ baseUrl: 'https://x.com', accountId: 1, userToken: 't' }, 1, 'oi')
    ).resolves.toBeUndefined()
  })

  it('não lança erro quando fetch dá throw', async () => {
    fetchMock.mockRejectedValue(new Error('net err'))
    await expect(
      sendMessage({ baseUrl: 'https://x.com', accountId: 1, userToken: 't' }, 1, 'oi')
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar teste — deve falhar**

```bash
npm test tests/chatwoot.test.ts
```

Esperado: erro de assinatura.

- [ ] **Step 3: Substituir `lib/chatwoot.ts`**

```typescript
import type { ChatwootApiConfig } from '@/lib/types'

export async function sendMessage(
  config: ChatwootApiConfig,
  conversationId: number,
  content: string
): Promise<void> {
  const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': config.userToken,
      },
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
    })
    if (!response.ok) {
      console.warn(`Chatwoot sendMessage failed: ${response.status}`)
    }
  } catch (err) {
    console.warn('Chatwoot sendMessage error:', err)
  }
}
```

- [ ] **Step 4: Rodar teste — deve passar**

```bash
npm test tests/chatwoot.test.ts
```

Esperado: 3/3 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/chatwoot.ts tests/chatwoot.test.ts
git commit -m "refactor: chatwoot sendMessage accepts ChatwootApiConfig"
```

---

## Task 8: Refatorar `app/api/webhook/route.ts` (TDD)

**Files:** `app/api/webhook/route.ts`, `tests/webhook.test.ts`

- [ ] **Step 1: Substituir `tests/webhook.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/agent', () => ({
  runAgent: vi.fn().mockResolvedValue('Reply do JET.'),
}))
vi.mock('@/lib/chatwoot', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/inboxes', () => ({
  loadInboxByChatwootId: vi.fn(),
  loadOpenAIConfig: vi.fn(),
}))

import { POST } from '@/app/api/webhook/route'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/chatwoot'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'

const mockRunAgent = runAgent as ReturnType<typeof vi.fn>
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>
const mockLoadInbox = loadInboxByChatwootId as ReturnType<typeof vi.fn>
const mockLoadOpenAI = loadOpenAIConfig as ReturnType<typeof vi.fn>

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const baseInbox = {
  id: 'uuid', name: 'AJ', chatwoot_base_url: 'https://x.com',
  chatwoot_account_id: 14, chatwoot_inbox_id: 45,
  chatwoot_user_token: 'tok', system_prompt: 'PROMPT', enabled: true,
}

const validPayload = {
  body: {
    id: 13,
    inbox_id: 45,
    messages: [{
      id: 1, content: 'preciso de uma peça', message_type: 0,
      sender_type: 'Contact',
      sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' },
    }],
    meta: { sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' } },
    event: 'automation_event.message_created',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadInbox.mockResolvedValue(baseInbox)
  mockLoadOpenAI.mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' })
})

describe('POST /api/webhook', () => {
  it('skip quando inbox não existe', async () => {
    mockLoadInbox.mockResolvedValue(null)
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip quando inbox está disabled', async () => {
    mockLoadInbox.mockResolvedValue({ ...baseInbox, enabled: false })
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip mensagens outgoing (message_type === 1)', async () => {
    const p = { ...validPayload, body: { ...validPayload.body,
      messages: [{ ...validPayload.body.messages[0], message_type: 1 }] } }
    const res = await POST(makeRequest(p))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('skip content vazio', async () => {
    const p = { ...validPayload, body: { ...validPayload.body,
      messages: [{ ...validPayload.body.messages[0], content: null }] } }
    const res = await POST(makeRequest(p))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('processa mensagem válida usando config da inbox', async () => {
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockLoadInbox).toHaveBeenCalledWith(45)
    expect(mockRunAgent).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      'preciso de uma peça',
      'PROMPT',
      'sk-test',
      'gpt-4o-mini'
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      { baseUrl: 'https://x.com', accountId: 14, userToken: 'tok' },
      13,
      'Reply do JET.'
    )
  })
})
```

- [ ] **Step 2: Rodar teste — deve falhar**

```bash
npm test tests/webhook.test.ts
```

Esperado: erros de assinatura.

- [ ] **Step 3: Substituir `app/api/webhook/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/chatwoot'
import { loadInboxByChatwootId, loadOpenAIConfig } from '@/lib/inboxes'

interface WebhookPayload {
  body?: {
    id?: number
    inbox_id?: number
    messages?: Array<{
      content?: string | null
      message_type?: number
    }>
    meta?: {
      sender?: { identifier?: string }
    }
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload: WebhookPayload = await req.json()

  const chatwootInboxId = payload.body?.inbox_id
  if (!chatwootInboxId) return NextResponse.json({ ok: true })

  const inbox = await loadInboxByChatwootId(chatwootInboxId)
  if (!inbox || !inbox.enabled) return NextResponse.json({ ok: true })

  const message = payload.body?.messages?.[0]
  if (!message || message.message_type === 1 || !message.content) {
    return NextResponse.json({ ok: true })
  }

  const sessionId = payload.body?.meta?.sender?.identifier
  const conversationId = payload.body?.id
  if (!sessionId || !conversationId) return NextResponse.json({ ok: true })

  const openai = await loadOpenAIConfig()
  const reply = await runAgent(
    sessionId,
    message.content,
    inbox.system_prompt,
    openai.apiKey,
    openai.model
  )

  await sendMessage(
    {
      baseUrl: inbox.chatwoot_base_url,
      accountId: inbox.chatwoot_account_id,
      userToken: inbox.chatwoot_user_token,
    },
    conversationId,
    reply
  )

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Rodar teste — deve passar**

```bash
npm test tests/webhook.test.ts
```

Esperado: 5/5 pass.

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

Esperado: todos passam (memory + chatwoot + agent + inboxes + webhook).

- [ ] **Step 6: Commit**

```bash
git add app/api/webhook/route.ts tests/webhook.test.ts
git commit -m "refactor: webhook loads inbox config from DB by chatwoot_inbox_id"
```

---

## Task 9: Supabase clients (server, browser)

**Files:** `lib/supabase/server.ts`, `lib/supabase/browser.ts`

- [ ] **Step 1: Criar `lib/supabase/server.ts`**

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function getServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 2: Criar `lib/supabase/browser.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/
git commit -m "feat: add supabase ssr clients (server + browser)"
```

---

## Task 10: Middleware de autenticação

**Files:** `middleware.ts`

- [ ] **Step 1: Criar `middleware.ts` na raiz do projeto**

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/api/inboxes') || pathname.startsWith('/api/settings')
  const isAuthPage = pathname === '/login' || pathname === '/setup'

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhook).*)',
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add auth middleware protecting dashboard routes"
```

---

## Task 11: Página `/login`

**Files:** `app/(auth)/login/page.tsx`, `app/(auth)/layout.tsx`

- [ ] **Step 1: Criar `app/(auth)/layout.tsx`**

```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/(auth)/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = getBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader><CardTitle>Login</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/
git commit -m "feat: add login page with Supabase auth"
```

---

## Task 12: Página `/setup` (primeiro admin)

**Files:** `app/(auth)/setup/page.tsx`, `app/api/auth/setup/route.ts`

- [ ] **Step 1: Criar `app/api/auth/setup/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  const admin = getAdminClient()
  const { data: users, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  if (users.users.length > 0) {
    return NextResponse.json({ error: 'Setup já foi feito' }, { status: 400 })
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Criar `app/(auth)/setup/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Senhas não coincidem')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || 'Erro ao criar admin')
      setLoading(false)
      return
    }

    const supabase = getBrowserClient()
    await supabase.auth.signInWithPassword({ email, password })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader><CardTitle>Criar Primeiro Admin</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div>
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando...' : 'Criar admin'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Atualizar middleware para redirecionar para setup quando não há users**

Substituir o trecho de redirecionamento em `middleware.ts`:

```typescript
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```

Por:

```typescript
  if (isAuthPage || pathname === '/') {
    // Verifica se há algum user — se não, redireciona para /setup
    try {
      const res = await fetch(new URL('/api/auth/has-users', request.url))
      const { hasUsers } = await res.json()
      if (!hasUsers && pathname !== '/setup') {
        return NextResponse.redirect(new URL('/setup', request.url))
      }
      if (hasUsers && pathname === '/setup') {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    } catch {}
  }

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
```

- [ ] **Step 4: Criar `app/api/auth/has-users/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const admin = getAdminClient()
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) return NextResponse.json({ hasUsers: false }, { status: 500 })
  return NextResponse.json({ hasUsers: data.users.length > 0 })
}
```

- [ ] **Step 5: Commit**

```bash
git add app/ middleware.ts
git commit -m "feat: add setup page for first admin creation"
```

---

## Task 13: Layout do dashboard

**Files:** `app/dashboard/layout.tsx`

- [ ] **Step 1: Criar `app/dashboard/layout.tsx`**

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold">Amazon Jet Agent</Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="hover:underline">Inboxes</Link>
              <Link href="/dashboard/settings/openai" className="hover:underline">OpenAI</Link>
              <Link href="/dashboard/settings/users" className="hover:underline">Usuários</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <form action="/api/auth/logout" method="POST">
              <Button type="submit" variant="outline" size="sm">Sair</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="container mx-auto py-8 flex-1">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Criar `app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = getServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
}
```

Aceitar usar `request.url` em vez do env como fallback — substituir no POST:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = getServerClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', req.url))
}
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/layout.tsx app/api/auth/logout/
git commit -m "feat: add dashboard layout with nav and logout"
```

---

## Task 14: API CRUD de inboxes

**Files:** `app/api/inboxes/route.ts`, `app/api/inboxes/[id]/route.ts`

- [ ] **Step 1: Criar `app/api/inboxes/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('inboxes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inboxes: data })
}

export async function POST(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('inboxes')
    .insert({
      name: body.name,
      chatwoot_base_url: body.chatwoot_base_url,
      chatwoot_account_id: body.chatwoot_account_id,
      chatwoot_inbox_id: body.chatwoot_inbox_id,
      chatwoot_user_token: body.chatwoot_user_token,
      system_prompt: body.system_prompt,
      enabled: body.enabled ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inbox: data })
}
```

- [ ] **Step 2: Criar `app/api/inboxes/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('inboxes')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ inbox: data })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('inboxes')
    .update({
      name: body.name,
      chatwoot_base_url: body.chatwoot_base_url,
      chatwoot_account_id: body.chatwoot_account_id,
      chatwoot_inbox_id: body.chatwoot_inbox_id,
      chatwoot_user_token: body.chatwoot_user_token,
      system_prompt: body.system_prompt,
      enabled: body.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inbox: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase.from('inboxes').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/inboxes/
git commit -m "feat: add inboxes CRUD API"
```

---

## Task 15: Página `/dashboard` — lista de inboxes

**Files:** `app/dashboard/page.tsx`, `components/inbox-toggle.tsx`

- [ ] **Step 1: Criar `components/inbox-toggle.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Switch } from '@/components/ui/switch'

export function InboxToggle({ id, initial }: { id: string; initial: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [loading, setLoading] = useState(false)

  async function toggle(checked: boolean) {
    setLoading(true)
    setEnabled(checked)
    const res = await fetch(`/api/inboxes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: checked }),
    })
    if (!res.ok) setEnabled(!checked)
    setLoading(false)
    router.refresh()
  }

  return <Switch checked={enabled} onCheckedChange={toggle} disabled={loading} />
}
```

Nota: O PUT em `/api/inboxes/[id]` exige todos os campos. Atualizar para aceitar PATCH parcial — voltar ao `app/api/inboxes/[id]/route.ts`:

Substituir a função `PUT` para tornar todos os campos opcionais:

```typescript
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['name','chatwoot_base_url','chatwoot_account_id','chatwoot_inbox_id','chatwoot_user_token','system_prompt','enabled']) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabase
    .from('inboxes')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inbox: data })
}
```

- [ ] **Step 2: Criar `app/dashboard/page.tsx`**

```typescript
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InboxToggle } from '@/components/inbox-toggle'

export default async function DashboardPage() {
  const supabase = getServerClient()
  const { data: inboxes } = await supabase
    .from('inboxes')
    .select('*')
    .order('created_at', { ascending: false })

  const total = inboxes?.length ?? 0
  const active = inboxes?.filter(i => i.enabled).length ?? 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Status</CardTitle></CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{active} <span className="text-base font-normal text-muted-foreground">de {total} inboxes ativas</span></p>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Inboxes</h2>
        <Button asChild><Link href="/dashboard/inboxes/new">+ Nova Inbox</Link></Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Account ID</TableHead>
              <TableHead>Inbox ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inboxes?.map(inbox => (
              <TableRow key={inbox.id}>
                <TableCell className="font-medium">{inbox.name}</TableCell>
                <TableCell>{inbox.chatwoot_account_id}</TableCell>
                <TableCell>{inbox.chatwoot_inbox_id}</TableCell>
                <TableCell><InboxToggle id={inbox.id} initial={inbox.enabled} /></TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/inboxes/${inbox.id}`}>Editar</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!inboxes || inboxes.length === 0) && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma inbox cadastrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx components/inbox-toggle.tsx app/api/inboxes/[id]/route.ts
git commit -m "feat: dashboard list of inboxes with toggle"
```

---

## Task 16: Páginas de criação/edição de inbox

**Files:** `app/dashboard/inboxes/new/page.tsx`, `app/dashboard/inboxes/[id]/page.tsx`, `components/inbox-form.tsx`

- [ ] **Step 1: Criar `components/inbox-form.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface InboxFormProps {
  inbox?: {
    id: string
    name: string
    chatwoot_base_url: string
    chatwoot_account_id: number
    chatwoot_inbox_id: number
    chatwoot_user_token: string
    system_prompt: string
    enabled: boolean
  }
  defaultSystemPrompt?: string
}

export function InboxForm({ inbox, defaultSystemPrompt }: InboxFormProps) {
  const router = useRouter()
  const isEdit = !!inbox

  const [name, setName] = useState(inbox?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(inbox?.chatwoot_base_url ?? 'https://chat.leaderaperformance.com.br')
  const [accountId, setAccountId] = useState(String(inbox?.chatwoot_account_id ?? ''))
  const [inboxId, setInboxId] = useState(String(inbox?.chatwoot_inbox_id ?? ''))
  const [token, setToken] = useState(inbox?.chatwoot_user_token ?? '')
  const [enabled, setEnabled] = useState(inbox?.enabled ?? true)
  const [systemPrompt, setSystemPrompt] = useState(inbox?.system_prompt ?? defaultSystemPrompt ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const url = isEdit ? `/api/inboxes/${inbox!.id}` : '/api/inboxes'
    const method = isEdit ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        chatwoot_base_url: baseUrl,
        chatwoot_account_id: Number(accountId),
        chatwoot_inbox_id: Number(inboxId),
        chatwoot_user_token: token,
        system_prompt: systemPrompt,
        enabled,
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error || 'Erro ao salvar')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('Excluir esta inbox? Isso não pode ser desfeito.')) return
    setLoading(true)
    await fetch(`/api/inboxes/${inbox!.id}`, { method: 'DELETE' })
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader><CardTitle>{isEdit ? 'Editar Inbox' : 'Nova Inbox'}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="accountId">Chatwoot Account ID</Label>
              <Input id="accountId" type="number" value={accountId} onChange={e => setAccountId(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="inboxId">Chatwoot Inbox ID</Label>
              <Input id="inboxId" type="number" value={inboxId} onChange={e => setInboxId(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label htmlFor="baseUrl">Chatwoot Base URL</Label>
            <Input id="baseUrl" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="token">User Token</Label>
            <Input id="token" type="password" value={token} onChange={e => setToken(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="enabled">Inbox ativa</Label>
          </div>
          <div>
            <Label htmlFor="prompt">System Prompt</Label>
            <Textarea id="prompt" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} required rows={20} className="font-mono text-sm" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-between">
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
              <Button type="button" variant="outline" onClick={() => router.push('/dashboard')}>Cancelar</Button>
            </div>
            {isEdit && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>Excluir</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Criar `app/dashboard/inboxes/new/page.tsx`**

```typescript
import { InboxForm } from '@/components/inbox-form'
import { DEFAULT_JET_PROMPT } from '@/lib/prompt'

export default function NewInboxPage() {
  return <InboxForm defaultSystemPrompt={DEFAULT_JET_PROMPT} />
}
```

- [ ] **Step 3: Criar `app/dashboard/inboxes/[id]/page.tsx`**

```typescript
import { notFound } from 'next/navigation'
import { getServerClient } from '@/lib/supabase/server'
import { InboxForm } from '@/components/inbox-form'

export default async function EditInboxPage({ params }: { params: { id: string } }) {
  const supabase = getServerClient()
  const { data } = await supabase.from('inboxes').select('*').eq('id', params.id).maybeSingle()
  if (!data) notFound()

  return <InboxForm inbox={data} />
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/inboxes/ components/inbox-form.tsx
git commit -m "feat: inbox create/edit pages with form component"
```

---

## Task 17: Configuração OpenAI

**Files:** `app/dashboard/settings/openai/page.tsx`, `app/api/settings/openai/route.ts`, `components/openai-form.tsx`

- [ ] **Step 1: Criar `app/api/settings/openai/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('app_settings')
    .select('openai_api_key, openai_model')
    .eq('id', 1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}

export async function PUT(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { error } = await supabase
    .from('app_settings')
    .update({
      openai_api_key: body.openai_api_key,
      openai_model: body.openai_model,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Criar `components/openai-form.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function OpenAIForm({ initial }: { initial: { openai_api_key: string | null; openai_model: string | null } }) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState(initial.openai_api_key ?? '')
  const [model, setModel] = useState(initial.openai_model ?? 'gpt-4o-mini')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/settings/openai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openai_api_key: apiKey, openai_model: model }),
    })
    setMsg(res.ok ? 'Salvo!' : 'Erro ao salvar')
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div>
        <Label htmlFor="apikey">OpenAI API Key</Label>
        <Input id="apikey" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
      </div>
      <div>
        <Label htmlFor="model">Modelo</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
            <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Criar `app/dashboard/settings/openai/page.tsx`**

```typescript
import { getServerClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OpenAIForm } from '@/components/openai-form'

export default async function OpenAISettingsPage() {
  const supabase = getServerClient()
  const { data } = await supabase.from('app_settings').select('openai_api_key, openai_model').eq('id', 1).maybeSingle()

  return (
    <Card>
      <CardHeader><CardTitle>Configuração OpenAI</CardTitle></CardHeader>
      <CardContent>
        <OpenAIForm initial={data ?? { openai_api_key: null, openai_model: null }} />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/settings/openai/ app/api/settings/openai/ components/openai-form.tsx
git commit -m "feat: openai settings page"
```

---

## Task 18: Gerenciamento de usuários (convites)

**Files:** `app/dashboard/settings/users/page.tsx`, `app/api/settings/users/route.ts`, `components/users-manager.tsx`

- [ ] **Step 1: Criar `app/api/settings/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = getAdminClient()
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = data.users.map(u => ({ id: u.id, email: u.email, created_at: u.created_at }))
  return NextResponse.json({ users })
}

export async function POST(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { email } = await req.json()
  const admin = getAdminClient()
  const { error } = await admin.auth.admin.inviteUserByEmail(email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (userId === user.id) {
    return NextResponse.json({ error: 'não pode remover a si mesmo' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Criar `components/users-manager.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface User { id: string; email: string; created_at: string }

export function UsersManager({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setMsg('Convite enviado!')
      setEmail('')
      router.refresh()
    } else {
      const body = await res.json()
      setMsg(body.error || 'Erro')
    }
    setLoading(false)
  }

  async function remove(userId: string) {
    if (!confirm('Remover este usuário?')) return
    await fetch('/api/settings/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="flex gap-2 max-w-md">
        <Input type="email" placeholder="email@exemplo.com" value={email} onChange={e => setEmail(e.target.value)} required />
        <Button type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Convidar'}</Button>
      </form>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.id}>
              <TableCell>{u.email} {u.id === currentUserId && <span className="text-xs text-muted-foreground">(você)</span>}</TableCell>
              <TableCell>{new Date(u.created_at).toLocaleDateString('pt-BR')}</TableCell>
              <TableCell className="text-right">
                {u.id !== currentUserId && (
                  <Button variant="ghost" size="sm" onClick={() => remove(u.id)}>Remover</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 3: Criar `app/dashboard/settings/users/page.tsx`**

```typescript
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UsersManager } from '@/components/users-manager'

export default async function UsersPage() {
  const supabase = getServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getAdminClient()
  const { data } = await admin.auth.admin.listUsers()
  const users = data?.users.map(u => ({ id: u.id, email: u.email ?? '', created_at: u.created_at })) ?? []

  return (
    <Card>
      <CardHeader><CardTitle>Usuários Administradores</CardTitle></CardHeader>
      <CardContent>
        <UsersManager users={users} currentUserId={user!.id} />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/settings/users/ app/api/settings/users/ components/users-manager.tsx
git commit -m "feat: users management page with invite/remove"
```

---

## Task 19: Build final, testes e deploy

**Files:** N/A — verificação e deploy

- [ ] **Step 1: Rodar todos os testes**

```bash
npm test
```

Esperado: todos os testes passam (memory + chatwoot + agent + inboxes + webhook).

- [ ] **Step 2: Rodar build**

```bash
npm run build
```

Esperado: build sem erros. Resolver typescript errors se houver.

- [ ] **Step 3: Testar localmente (smoke test)**

Abrir 2 terminais:

```bash
# Terminal 1
npm run dev
```

Abrir `http://localhost:3001` — deve redirecionar para `/setup` (sem users) ou `/login` (com users).

- [ ] **Step 4: Adicionar `NEXT_PUBLIC_SUPABASE_*` no Vercel**

Antes de fazer deploy, garantir que essas env vars estão no projeto Vercel:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

Comando (se já tiver Vercel CLI e estiver logado):

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

(SUPABASE_URL e SUPABASE_SERVICE_KEY já existem do projeto anterior.)

- [ ] **Step 5: Deploy para produção**

```bash
vercel --prod
```

- [ ] **Step 6: Acessar a URL de produção**

Abrir `https://<projeto>.vercel.app` no browser. Deve abrir `/setup` (primeira vez). Criar admin, fazer login, criar primeira inbox, configurar OpenAI.

- [ ] **Step 7: Configurar webhook no Chatwoot**

No Chatwoot → Inbox → URL do Webhook → colar:

```
https://<projeto>.vercel.app/api/webhook
```

- [ ] **Step 8: Teste end-to-end**

Enviar mensagem no WhatsApp conectado à inbox. JET deve responder.

- [ ] **Step 9: Commit final**

```bash
git add .
git commit -m "feat: phase 1 admin panel complete" --allow-empty
```

---

## Self-Review (cobertura do spec)

| Requisito do Spec | Task |
|---|---|
| Login multiusuário (Supabase Auth) | Task 11 |
| Primeiro admin via `/setup` | Task 12 |
| Tabela `app_settings` | Task 2 |
| Tabela `inboxes` com unique (account_id, inbox_id) | Task 2 |
| RLS habilitada | Task 2 |
| Middleware protege `/dashboard/*` | Task 10 |
| Layout dashboard + nav + logout | Task 13 |
| Lista de inboxes + status + toggle | Task 15 |
| Criar/editar/excluir inbox | Task 16 |
| System prompt por inbox (textarea) | Task 16 |
| Configuração OpenAI | Task 17 |
| Convidar/remover usuários | Task 18 |
| `lib/inboxes.ts` (loadInboxByChatwootId, loadOpenAIConfig) | Task 5 |
| Refatorar `lib/agent.ts` com novos parâmetros | Task 6 |
| Refatorar `lib/chatwoot.ts` aceitar config | Task 7 |
| Refatorar webhook usar inbox do banco | Task 8 |
| `lib/prompt.ts` vira `injectCurrentDate` | Task 4 |
| Deploy Vercel + atualizar URL Chatwoot | Task 19 |
| Critério de aceitação 1 (setup novo admin) | Task 12+19 |
| Critério 2 (CRUD inboxes pelo painel) | Task 14+15+16 |
| Critério 3 (editar prompt pelo painel) | Task 16 |
| Critério 4 (configurar OpenAI pelo painel) | Task 17 |
| Critério 5 (convidar admins) | Task 18 |
| Critério 6 (roteamento por inbox_id) | Task 8 |
| Critério 7 (inbox disabled ignora) | Task 8 |
| Critério 8 (testes existentes passam) | Task 6+7+8 |
