# Fase 2 — Dashboard de Contatos + Tagging Automático + Handoff Humano

**Date:** 2026-05-17
**Status:** Aprovado
**Escopo:** Dashboard read-only com todos os contatos atendidos, sincronização de tags do Chatwoot via tool calling do agente, e handoff humano via remoção manual de tag.

---

## 1. Objetivo

Adicionar ao painel admin uma visão de todos os contatos que mandaram mensagem pra qualquer inbox configurada, com dados úteis pra acompanhamento de leads. Em paralelo, dar ao agente JET a capacidade de aplicar/remover tags do Chatwoot conforme conduz a conversa, e respeitar handoff humano (humano remove `atendimento_ia` → bot para de responder, mas continua salvando histórico).

---

## 2. Arquitetura

Tudo no mesmo projeto Next.js. Toda mensagem que chega no webhook:

1. **Espelha o contato/conversa** numa nova tabela `contacts` no Supabase (cache pro dashboard, evita chamar Chatwoot API por linha)
2. **Salva a mensagem na memória** independente do remetente (contato, bot ou humano)
3. **Decide se responde:**
   - Resposta do bot já reflete-se no Chatwoot via QuePasa+webhook (não duplica)
   - Mensagem de humano: só salva memória, NÃO responde
   - Mensagem de contato: responde SE tag `atendimento_ia` presente OU se for o primeiro contato

Dashboard carrega 100% do Supabase, zero call ao Chatwoot na renderização. "Gerar resumo" é a única ação que dispara chamada ao OpenAI sob demanda.

---

## 3. Banco de dados

### Nova tabela: `contacts`

```sql
CREATE TABLE contacts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id                UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
  chatwoot_conversation_id INT NOT NULL,
  chatwoot_contact_id     INT,
  name                    TEXT,
  phone_number            TEXT,
  whatsapp_identifier     TEXT,                              -- ex: "5511999999999@s.whatsapp.net"
  current_labels          TEXT[] NOT NULL DEFAULT '{}',
  status                  TEXT NOT NULL DEFAULT 'ia',        -- 'ia' | 'humano' | 'encerrado'
  last_message            TEXT,
  last_message_at         TIMESTAMPTZ,
  message_count           INT NOT NULL DEFAULT 0,
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary                 TEXT,
  summary_generated_at    TIMESTAMPTZ,
  UNIQUE (inbox_id, chatwoot_conversation_id)
);

CREATE INDEX idx_contacts_inbox_last_msg ON contacts (inbox_id, last_message_at DESC);
CREATE INDEX idx_contacts_status ON contacts (status);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read contacts" ON contacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write contacts" ON contacts FOR ALL USING (auth.role() = 'authenticated');
```

### Cálculo do `status`

Recalculado a cada upsert, baseado nas `current_labels`:
- Se `lead_ganho` OU `lead_perdido` presentes → `encerrado`
- Senão se `atendimento_ia` presente → `ia`
- Senão → `humano`

### Tabela existente: `memory_chat_amazon_jet`

Continua igual (schema n8n/LangChain). Nada muda — só passamos a inserir mensagens de humanos também, prefixadas com `[atendente]: ` no campo `content` para o LLM distinguir.

---

## 4. Tags

### Tags de sistema (gerenciadas por regra fixa)

- `atendimento_ia` — adicionada automaticamente pelo código quando o bot envia sua primeira resposta numa conversa. **O bot NÃO pode remover via tool.** Removida apenas pelo humano no Chatwoot (handoff manual — confirmado pelo usuário).

### Tags de negócio (gerenciadas por tool calling)

Disponíveis pro agente JET via tools:
- `novo_lead`
- `aguardando_pn`
- `pendente_orcamento`
- `orcamento_enviado`
- `lead_ganho`
- `lead_perdido`

### Tools do agente

```typescript
// Adiciona uma label de negócio na conversa atual
add_label({ label: BusinessLabel }): { ok: true }

// Remove uma label de negócio da conversa atual
remove_label({ label: BusinessLabel }): { ok: true }
```

Onde `BusinessLabel` é o enum das 6 tags acima. O contexto da conversa (qual inbox, qual conversation_id) é injetado pelo runtime, não passa pelo LLM.

### System prompt — instruções de tag

Adicionar uma seção nova ao `DEFAULT_JET_PROMPT`:

```
## 12. ETIQUETAS (use as ferramentas add_label/remove_label conforme o fluxo)

Aplique as tags na hora certa para manter o CRM organizado:

- Primeira mensagem do contato → add_label('novo_lead')
- Ao pedir o Part Number → add_label('aguardando_pn')
- Cliente enviou PN → remove_label('aguardando_pn') + add_label('pendente_orcamento')
- Você acabou de enviar resposta confirmando que a cotação será enviada → add_label('orcamento_enviado')
- Cliente confirmou fechamento → add_label('lead_ganho')
- Cliente desistiu / fora do perfil → add_label('lead_perdido')

Regras:
- Use as ferramentas no momento certo, sem comentar sobre elas com o cliente
- Nunca tente add_label('atendimento_ia') — esse é gerenciado pelo sistema
```

### Sincronização com Chatwoot

`addLabel`/`removeLabel` faz dois passos:
1. PUT na API do Chatwoot: `POST /api/v1/accounts/{accountId}/conversations/{convId}/labels` com `{ labels: [...] }` (Chatwoot precisa do conjunto completo, não diff)
2. Atualiza `contacts.current_labels` no Supabase

---

## 5. Webhook refatorado

```
POST /api/webhook
  ↓
[1] Lê inbox_id, identifica inbox no Supabase. Se não existir/disabled → 200 ok
  ↓
[2] Lê os dados do payload (mensagem, contato, conversa, labels atuais do Chatwoot)
  ↓
[3] Upsert em `contacts`:
     - chave: (inbox_id, chatwoot_conversation_id)
     - atualiza nome, phone, whatsapp_identifier, last_message, last_message_at, current_labels
     - incrementa message_count
     - recalcula status
  ↓
[4] Salva mensagem na memória (com role apropriado):
     - sender_type='Contact' → role='user', content=text
     - sender_type='User'    → role='user', content='[atendente]: ' + text
     - sender_type='AgentBot'→ NÃO salva (já foi salva quando o bot mesmo respondeu)
  ↓
[5] Decide se responde:
     - sender_type !== 'Contact' → não responde (200 ok)
     - content vazio → não responde
     - tag 'atendimento_ia' presente → responde
     - OU é a primeira mensagem dessa conversa (contacts.message_count antes do upsert era 0,
       ou seja, ainda não tinha registro no banco) → responde
     - Qualquer outro caso → não responde (humano assumiu)
  ↓
[6] runAgent com tools add_label/remove_label (contextualizadas para esta conversa)
  ↓
[7] Envia resposta via QuePasa
  ↓
[8] Se for a primeira resposta do bot pra essa conversa (tag não estava lá):
     - Adiciona 'atendimento_ia' via Chatwoot API
     - Atualiza contacts.current_labels e status
```

---

## 6. Resumo da conversa (sob demanda)

### Endpoint

`POST /api/contacts/[id]/summary` — autenticado.

### Lógica

1. Lê `contacts` row para obter `inbox_id` e `whatsapp_identifier`
2. Carrega últimas 50 mensagens de `memory_chat_amazon_jet` para esse `session_id`
3. Chama OpenAI com um prompt curto:
   ```
   Resuma essa conversa em até 5 bullets (•). Capture: nome,
   intenção, dados técnicos (PN, modelo), estágio (cotação? fechamento?),
   próximos passos. Se faltar informação, indique.
   ```
4. Salva em `contacts.summary` + `contacts.summary_generated_at`
5. Retorna `{ summary }`

---

## 7. Tela /dashboard/contacts

### Listagem

Tabela com 10 colunas:
1. Nome
2. Telefone
3. Tags (badges coloridas)
4. Status (badge `IA` verde / `Humano` amarelo / `Encerrado` cinza)
5. Última mensagem (truncado em 50 char)
6. Última interação (relativo: "há 2 min", "ontem 14:32")
7. Total msgs
8. Primeiro contato (data curta: 15/05/26)
9. Link Chatwoot (ícone ↗ abre nova aba)
10. Resumo (`[Gerar resumo]` ou `[Ver resumo]`)

### Recursos

- **Busca:** input no topo, filtra por `name`/`phone_number`/`whatsapp_identifier` (LIKE)
- **Filtro status:** Todos / IA / Humano / Encerrado
- **Filtro inbox:** dropdown se houver mais de 1 inbox configurada
- **Ordenação:** default `last_message_at DESC`. Permite clicar em colunas Nome, Total msgs, Última interação
- **Paginação:** 50/página

### Modal de resumo

Clicar `[Ver resumo]` abre `Dialog` (shadcn) com:
- Texto do resumo (whitespace-pre)
- Data da geração ("Gerado em 17/05 22:15")
- Botão `Atualizar` (regenera)
- Botão `Fechar`

### Card adicional em `/dashboard`

Acima da lista de inboxes:

```
┌──────────────────────────────────┐
│ X contatos atendidos hoje        │
│ Y total                          │
│ [Ver todos →]                    │
└──────────────────────────────────┘
```

---

## 8. API endpoints

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/contacts` | Lista paginada com filtros (`q`, `status`, `inbox_id`, `page`, `sort`) |
| POST | `/api/contacts/[id]/summary` | Gera/regenera o resumo do contato |

Sem POST/PUT/DELETE — dashboard é read-only.

---

## 9. Estrutura de arquivos

```
lib/
├── tags.ts                       ← addLabel, removeLabel, syncLabels
├── contacts.ts                   ← upsertContact, listContacts, getContact
├── summarize.ts                  ← generateSummary
├── agent.ts                      ← MODIFICADO: aceita tools no generateText
└── prompt.ts                     ← MODIFICADO: nova seção 12 sobre tags

app/api/
├── webhook/route.ts              ← REFATORADO (upsert + memory + tools + handoff)
└── contacts/
    ├── route.ts                  ← GET list
    └── [id]/summary/route.ts     ← POST gerar resumo

app/dashboard/
├── page.tsx                      ← adiciona card de contatos
└── contacts/page.tsx             ← nova tela

components/
├── contacts-table.tsx            ← tabela + busca + filtros + paginação
└── summary-modal.tsx             ← modal de resumo

tests/
├── tags.test.ts                  ← novo
├── contacts.test.ts              ← novo
├── summarize.test.ts             ← novo
├── webhook.test.ts               ← ATUALIZADO (cenários novos)
└── agent.test.ts                 ← ATUALIZADO (suporte a tools)

supabase/migrations/
└── 20260518000001_contacts_table.sql  ← novo
```

---

## 10. Critérios de aceitação

A Fase 2 está completa quando:

1. Uma mensagem nova de WhatsApp dispara o webhook e cria/atualiza uma linha em `contacts`.
2. Mensagens de humanos (sender_type=User) são salvas na memória mas o bot não responde.
3. Mensagens de contato (sender_type=Contact) são respondidas SE tag `atendimento_ia` presente OU é o primeiro contato.
4. O bot adiciona `atendimento_ia` automaticamente após sua primeira resposta na conversa.
5. O bot usa `add_label`/`remove_label` para aplicar tags de negócio (`novo_lead`, `aguardando_pn`, etc.) durante o atendimento.
6. Quando o humano remove `atendimento_ia` no Chatwoot, o bot para de responder novas mensagens da mesma conversa, mas a memória continua acumulando.
7. `/dashboard/contacts` mostra a tabela com 10 colunas, busca, filtros e paginação.
8. "Gerar resumo" abre modal com bullet points gerados por LLM, salvos pra acesso futuro.
9. Card no `/dashboard` mostra contagem do dia.
10. Todos os testes existentes continuam passando + os novos cobrem `tags`, `contacts`, `summarize` e cenários novos do webhook.

---

## 11. Fora do escopo (Fase 3+)

- Ações no dashboard (toggle bot, adicionar/remover tag manual) — usuário pediu read-only
- Gráficos/métricas avançadas (volume por dia, taxa de conversão)
- Exportar CSV
- Notificações push pro admin (ex: "novo lead chegou")
- Tools além de tags (ex: `envia-pn` pra cotação)
- Multi-canal (só WhatsApp+QuePasa por enquanto)
- Áudio, imagem, PDF
- Filtro/segmentação por tag específica no dashboard
