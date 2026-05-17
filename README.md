# Amazon Jet Aviation — AI Agent

Agente de atendimento WhatsApp/Chatwoot com painel administrativo, rodando em Next.js + Supabase.

## Stack

- **Frontend / API:** Next.js 14 (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Auth + DB:** Supabase (Auth + Postgres)
- **AI:** Vercel AI SDK + OpenAI
- **Hospedagem:** Vercel

## Como funciona

```
WhatsApp → QuePasa → Chatwoot → webhook → Next.js agent
                                            ↓
                                          OpenAI (gpt-4o-mini)
                                            ↓
                                          Chatwoot API → WhatsApp
```

Cada inbox do Chatwoot tem sua própria configuração (URL, token, system prompt, on/off) cadastrada pelo painel admin.

## Setup local

1. Clonar o repo e instalar dependências:
   ```bash
   git clone <repo>
   cd amazon-jet-aviation-agent
   npm install
   ```

2. Criar `.env.local` baseado em `.env.example` com suas chaves do Supabase.

3. Aplicar migração no Supabase (uma vez):
   ```bash
   # Copiar o conteúdo de supabase/migrations/*.sql
   # e rodar no Supabase Dashboard → SQL Editor
   ```

4. Rodar dev server:
   ```bash
   npm run dev
   ```

5. Acessar `http://localhost:3000/setup` para criar o primeiro admin.

## Deploy na Vercel

1. Conectar o repo na Vercel.
2. Em **Settings → Environment Variables**, adicionar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
3. Deploy.
4. Acessar `<deploy>.vercel.app/setup` e criar o primeiro admin.
5. Em `/dashboard/settings/openai`, configurar a chave OpenAI.
6. Em `/dashboard`, cadastrar suas inboxes Chatwoot.
7. No Chatwoot, em cada inbox, apontar a URL do webhook para `<deploy>.vercel.app/api/webhook`.

## Painel Admin (`/dashboard`)

- **Inboxes** — lista, criar, editar, toggle on/off, definir system prompt por inbox
- **OpenAI** — configurar chave e modelo (gpt-4o-mini, gpt-4o, gpt-4-turbo)
- **Usuários** — convidar novos admins por email, remover

## Estrutura do projeto

```
app/
├── (auth)/          ← /login, /setup
├── api/
│   ├── auth/        ← setup, has-users, logout
│   ├── inboxes/     ← CRUD
│   ├── settings/    ← openai, users
│   └── webhook/     ← endpoint público do Chatwoot
└── dashboard/       ← painel admin (protegido)
lib/
├── agent.ts         ← runAgent(sessionId, msg, prompt, key, model)
├── chatwoot.ts      ← sendMessage(config, convId, content)
├── inboxes.ts       ← loadInboxByChatwootId, loadOpenAIConfig
├── memory.ts        ← loadHistory, saveMessage (Supabase n8n/LangChain format)
├── prompt.ts        ← injectCurrentDate, DEFAULT_JET_PROMPT
└── supabase/        ← admin, server, browser clients
tests/               ← Vitest (17 tests)
supabase/migrations/ ← SQL migrations
```

## Testes

```bash
npm test          # roda todos
npm run test:watch # modo watch
npm run build     # produção
```

## Segurança

- **NUNCA** commite `.env.local` (já está no `.gitignore`).
- A chave OpenAI e tokens Chatwoot são armazenados no Supabase, gerenciados pelo painel.
- O endpoint `/api/webhook` é **público** (qualquer um pode bater nele) — para camada extra, filtre por IP do Chatwoot no Vercel.
- O `SUPABASE_SERVICE_KEY` dá acesso completo ao banco. Trate como senha.
- Rotacione credenciais periodicamente, especialmente após colaboradores deixarem o time.

## Licença

Privado / interno.
