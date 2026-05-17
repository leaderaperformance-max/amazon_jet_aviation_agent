# Painel Admin — Fase 1 (Configuração)

**Date:** 2026-05-17
**Status:** Aprovado
**Escopo:** Painel web para gerenciar inboxes, system prompts e credenciais, com autenticação multiusuário.

---

## 1. Objetivo

Adicionar um painel administrativo ao projeto Next.js existente. O painel permite:
- Login multiusuário (Supabase Auth)
- Gerenciar inboxes do Chatwoot (CRUD + toggle on/off)
- Editar system prompt por inbox
- Configurar credenciais OpenAI globais
- Convidar novos admins

A Fase 1 entrega configuração completa. Fases 2 (conversas) e 3 (logs/métricas) virão depois.

---

## 2. Arquitetura

Tudo no mesmo projeto Next.js, mesmo deploy Vercel.

```
amazon-jet.vercel.app/
├── /api/webhook          ← endpoint público (Chatwoot)
├── /login                ← pública
├── /setup                ← pública (só se nenhum user existir)
└── /dashboard            ← protegida
    ├── /                 ← lista de inboxes + status
    ├── /inboxes/new      ← criar inbox
    ├── /inboxes/[id]     ← editar inbox + prompt
    └── /settings
        ├── /openai       ← chave + modelo
        └── /users        ← lista + convidar
```

Middleware Next.js bloqueia `/dashboard/*` para usuários não autenticados.

---

## 3. Banco de Dados

### Novas tabelas

```sql
-- Configuração global
CREATE TABLE app_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  openai_api_key  TEXT,
  openai_model    TEXT DEFAULT 'gpt-4o-mini',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Inboxes configuradas
CREATE TABLE inboxes (
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
```

### Tabela existente preservada
- `memory_chat_amazon_jet` — sem alteração. Continua usando `session_id` como WhatsApp identifier.

### RLS (Row-Level Security)
- `inboxes` e `app_settings`: só acessível por usuários autenticados via `auth.uid()` (RLS habilitado).
- Webhook usa `SUPABASE_SERVICE_KEY` (service role) para bypass RLS.

---

## 4. Autenticação (Supabase Auth)

- **Provedor:** Supabase Auth (email + senha)
- **Sessão:** cookie HTTPOnly via `@supabase/ssr`
- **Middleware:** `middleware.ts` protege `/dashboard/*`
- **Setup inicial:** se nenhum user existir na tabela `auth.users`, redireciona para `/setup` que permite criar o primeiro admin. Depois disso, signup público fica bloqueado.
- **Convites:** dentro do painel, admin envia convite via `supabase.auth.admin.inviteUserByEmail()` — usuário recebe email com link para definir senha.

---

## 5. Telas

### `/login`
- Formulário: email, senha
- Erro inline em caso de credenciais inválidas
- Link para "Esqueci minha senha" (via Supabase magic link)
- Se nenhum user existir → redireciona para `/setup`

### `/setup` (somente primeiro acesso)
- Formulário: email, senha, confirmar senha
- Cria primeiro admin, faz login e redireciona para `/dashboard`

### `/dashboard` (home)
- Header: logo + email do usuário + botão "Sair"
- Card de status: "X inboxes ativas / Y total"
- Tabela de inboxes:
  | Nome | Account ID | Inbox ID | Status | Ações |
  | --- | --- | --- | --- | --- |
- Botão "+ Nova Inbox" → vai para `/dashboard/inboxes/new`

### `/dashboard/inboxes/new` e `/dashboard/inboxes/[id]`
- Form único (reutilizável):
  - `name` (text)
  - `chatwoot_base_url` (URL)
  - `chatwoot_account_id` (number)
  - `chatwoot_inbox_id` (number)
  - `chatwoot_user_token` (password masked)
  - `enabled` (toggle)
  - `system_prompt` (textarea grande, ~30 linhas, mono-spaced)
- Botões: "Salvar", "Cancelar". Em `/inboxes/[id]` também tem "Excluir" (modal de confirmação).
- Mostra a URL do webhook que o usuário deve copiar para o Chatwoot: `{ORIGIN}/api/webhook`.

### `/dashboard/settings/openai`
- Form: API Key (password masked), modelo (select: gpt-4o-mini, gpt-4o, gpt-4-turbo)
- Botão "Salvar"

### `/dashboard/settings/users`
- Lista de usuários (email + data de criação)
- Form inline "Convidar usuário": email → envia convite
- Cada linha tem botão "Remover" (não pode remover a si mesmo)

---

## 6. Refatoração do Agente

O agente atual (`lib/agent.ts`, `lib/chatwoot.ts`, `app/api/webhook/route.ts`) lê credenciais e prompt do `.env`/código. Tem que passar a ler do banco.

### Novo módulo `lib/inboxes.ts`
```typescript
export async function loadInboxByChatwootId(chatwootInboxId: number): Promise<InboxConfig | null>
export async function loadOpenAIConfig(): Promise<{ apiKey: string, model: string }>
```

### `lib/agent.ts` (refatorado)
```typescript
export async function runAgent(
  sessionId: string,
  userMessage: string,
  systemPrompt: string,
  openaiApiKey: string,
  openaiModel: string
): Promise<string>
```

### `lib/chatwoot.ts` (refatorado)
```typescript
export async function sendMessage(
  config: { baseUrl: string, accountId: number, userToken: string },
  conversationId: number,
  content: string
): Promise<void>
```

### `app/api/webhook/route.ts` (refatorado)
```typescript
export async function POST(req) {
  const payload = await req.json()
  const inboxId = payload.body?.inbox_id
  const inbox = await loadInboxByChatwootId(inboxId)
  if (!inbox || !inbox.enabled) return ok()

  const openai = await loadOpenAIConfig()
  const message = payload.body.messages[0]
  if (!message || message.message_type === 1 || !message.content) return ok()

  const sessionId = payload.body.meta.sender.identifier
  const reply = await runAgent(sessionId, message.content, inbox.system_prompt, openai.apiKey, openai.model)
  await sendMessage(
    { baseUrl: inbox.chatwoot_base_url, accountId: inbox.chatwoot_account_id, userToken: inbox.chatwoot_user_token },
    payload.body.id,
    reply
  )
  return ok()
}
```

### `lib/prompt.ts`
- Continua existindo mas vira utility para injetar a data atual num prompt: `injectCurrentDate(prompt)`.
- O system prompt completo do JET passa a ser o valor inicial da inbox no momento da criação (seed).

---

## 7. Variáveis de Ambiente

**Mantidas:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (para webhook bypassar RLS)

**Novas:**
- `NEXT_PUBLIC_SUPABASE_URL` (cliente)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (cliente)

**Removidas:** OPENAI_API_KEY, CHATWOOT_* — todas migram para o banco.

---

## 8. Dependências adicionais

```json
{
  "dependencies": {
    "@supabase/ssr": "latest",
    "react-hook-form": "latest",
    "zod": "latest",
    "@hookform/resolvers": "latest"
  },
  "devDependencies": {
    "tailwindcss": "latest",
    "postcss": "latest",
    "autoprefixer": "latest",
    "@types/node": "latest"
  }
}
```

E componentes do shadcn/ui (instalados via CLI): `button`, `input`, `label`, `textarea`, `table`, `dialog`, `toast`, `select`, `switch`, `card`, `tabs`.

---

## 9. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 (App Router) — já existe |
| Auth | Supabase Auth + `@supabase/ssr` |
| DB | Supabase Postgres |
| UI | shadcn/ui + Tailwind CSS |
| Forms | react-hook-form + zod |
| AI SDK | Vercel AI SDK (já existe) |

---

## 10. Fora do escopo (vai pra Fase 2/3)

- Listagem de conversas e histórico em tempo real
- Logs de webhooks recebidos
- Métricas e dashboards
- Suporte a múltiplas chaves OpenAI (uma global por enquanto)
- Roles/permissões granulares (todos são admin)
- Multi-tenant real (organizações separadas)
- Audit log de alterações
- Tools do agente (`envia-pn` etc.)
- Processamento de áudio/imagem/PDF

---

## 11. Critérios de aceitação

A Fase 1 está completa quando:
1. Um novo usuário consegue acessar `/setup`, criar a primeira conta admin e fazer login.
2. Pelo painel, é possível criar/editar/excluir inboxes.
3. Pelo painel, é possível editar o system prompt de uma inbox.
4. Pelo painel, é possível configurar a chave OpenAI e o modelo.
5. Pelo painel, o admin atual consegue convidar outros admins.
6. Uma mensagem chegando via webhook do Chatwoot é roteada para a inbox correta pelo `chatwoot_inbox_id` e processada com o prompt e credenciais corretas.
7. Se a inbox estiver `enabled = false`, o webhook ignora a mensagem.
8. Os testes existentes do agente continuam passando (com os novos parâmetros mockados).
