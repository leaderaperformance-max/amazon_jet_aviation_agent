# Amazon Jet Aviation Agent — Design Spec

**Date:** 2026-05-16  
**Status:** Aprovado  
**Escopo:** MVP — agente JET respondendo mensagens via Chatwoot/WhatsApp

---

## 1. Objetivo

Migrar o agente de atendimento da Amazon Jet Aviation do n8n para um serviço hardcoded hospedado na Vercel. O MVP entrega o agente respondendo perguntas com memória de conversa. Tools (envia-pn, escalação) são fora do escopo do MVP.

---

## 2. Arquitetura

```
Cliente WhatsApp
    ↓
QuePasa API
    ↓
Chatwoot (inbox: Amazon Jet Aviation - WPP)
    ↓  automation_event.message_created
Vercel Function — POST /api/webhook
    ↓
[filtra mensagens outgoing — evita loop]
    ↓
[carrega histórico — Supabase memory_chat_amazon_jet]
    ↓
OpenAI gpt-4o-mini + system prompt JET
    ↓
[salva resposta no histórico]
    ↓
Chatwoot API — POST /conversations/{id}/messages
    ↓
QuePasa → WhatsApp → Cliente
```

---

## 3. Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 20 (Vercel) |
| Framework | Next.js 14 (App Router) |
| AI SDK | Vercel AI SDK (`ai` + `@ai-sdk/openai`) |
| Modelo | gpt-4o-mini |
| Banco | Supabase (PostgreSQL) |
| Memória | Tabela `memory_chat_amazon_jet` (session_id = WhatsApp identifier) |
| Linguagem | TypeScript |

---

## 4. Estrutura de Arquivos

```
/
├── app/
│   └── api/
│       └── webhook/
│           └── route.ts          ← endpoint POST /api/webhook
├── lib/
│   ├── agent.ts                  ← lógica do agente JET (system prompt + openai call)
│   ├── chatwoot.ts               ← enviar resposta via Chatwoot API
│   ├── memory.ts                 ← ler/salvar histórico no Supabase
│   └── supabase.ts               ← client Supabase singleton
├── .env.local                    ← credenciais (não commitado)
├── .env.example                  ← template sem valores reais
├── .gitignore
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 5. Endpoint — POST /api/webhook

**Payload recebido (Chatwoot `automation_event.message_created`):**
```json
{
  "body": {
    "id": 13,
    "messages": [{ "id": 1061220, "content": "oi", "message_type": 0, "sender_type": "Contact" }],
    "meta": {
      "sender": { "identifier": "5593991565755@s.whatsapp.net", "name": "Edilson Alves" }
    },
    "event": "automation_event.message_created"
  }
}
```

**Lógica:**
1. `message_type === 1` → skip (mensagem outgoing do bot, evita loop)
2. `messages[0].content` vazio/null → skip (áudio/mídia sem texto por ora)
3. Extrai `conversation_id`, `session_id` (identifier), `content`
4. Chama `agent.run(session_id, content)` → retorna resposta
5. Chama `chatwoot.sendMessage(conversation_id, resposta)`
6. Retorna `200 OK`

---

## 6. Memória — Supabase

**Tabela:** `memory_chat_amazon_jet`  
**Schema esperado (igual ao n8n):**
```sql
id          uuid primary key
session_id  text not null
role        text not null  -- 'user' | 'assistant'
content     text not null
created_at  timestamptz default now()
```

**Janela:** últimas 25 mensagens por session_id (igual ao n8n — contextWindowLength: 25).

---

## 7. Agente JET

- Modelo: `gpt-4o-mini`
- System prompt: idêntico ao n8n (seção completa de identidade, fluxo, FAQ)
- Data atual injetada dinamicamente no system prompt
- Sem tools no MVP

---

## 8. Envio de Resposta — Chatwoot API

```
POST https://chat.leaderaperformance.com.br/api/v1/accounts/14/conversations/{id}/messages
Headers:
  api_access_token: <CHATWOOT_USER_TOKEN>
Body:
  { "content": "...", "message_type": "outgoing", "private": false }
```

---

## 9. Variáveis de Ambiente

```
OPENAI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
CHATWOOT_BASE_URL=https://chat.leaderaperformance.com.br
CHATWOOT_USER_TOKEN=<CHATWOOT_USER_TOKEN>
CHATWOOT_ACCOUNT_ID=14
```

---

## 10. Fora do Escopo do MVP

- Debounce de mensagens (Upstash QStash) — adicionado na v2
- Tool `envia-pn`
- Transcrição de áudio (Whisper)
- Análise de imagem (GPT-4 Vision)
- Extração de documentos PDF
- Sub-agente de resumo de histórico
- Verificação de número próprio (anti-loop pelo número)
- Frontend/dashboard
