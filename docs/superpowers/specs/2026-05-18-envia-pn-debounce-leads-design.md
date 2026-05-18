# Fase 6 — Tool envia_pn + Dashboard Leads Pendentes + Debouncing 5s

**Date:** 2026-05-18
**Status:** Aprovado
**Escopo:** 3 features integradas: (1) Tool `envia_pn` que envia lead qualificado ao vendedor via WhatsApp e salva em tabela `leads`; (2) Dashboard `/dashboard/leads` listando cotações pendentes; (3) Debouncing de 5s pra agrupar mensagens em rajada.

---

## 1. Objetivo

**1.1** O bot já valida PNs, mas a informação não chega ao vendedor humano automaticamente. Adicionar tool `envia_pn` que dispara notificação WhatsApp pro vendedor (`5591981617148`) com dados estruturados E salva o lead em tabela própria.

**1.2** Criar tela `/dashboard/leads` listando todos os leads onde o bot coletou dados e enviou ao vendedor — pendentes de atendimento humano. Permite acompanhar funil em tempo real.

**1.3** Implementar debouncing de 5s: quando cliente manda múltiplas mensagens em rajada (`oi`, `tudo bem`, `?`), o bot espera 5s, junta tudo e responde uma vez só.

---

## 2. Schema novo

```sql
-- Lead enviado ao vendedor (1 lead por contato pode ter múltiplos no tempo)
CREATE TABLE IF NOT EXISTS leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  part_number         TEXT NOT NULL,
  quantity            TEXT NOT NULL,
  urgency             TEXT NOT NULL,          -- 'AOG' | 'rotina' | livre
  customer_name       TEXT,
  customer_phone      TEXT,
  notes               TEXT,                   -- texto extra que o agente passar
  sent_to_seller_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','em_atendimento','fechado_ganho','fechado_perdido'))
);
CREATE INDEX idx_leads_status_sent ON leads (status, sent_to_seller_at DESC);
CREATE INDEX idx_leads_contact ON leads (contact_id);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read leads" ON leads FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write leads" ON leads FOR ALL USING (auth.role() = 'authenticated');

-- Mensagens pendentes para debouncing
CREATE TABLE IF NOT EXISTS pending_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            TEXT NOT NULL,
  content               TEXT NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chatwoot_message_id   BIGINT,
  processed             BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_pending_session_received ON pending_messages (session_id, received_at);
CREATE INDEX idx_pending_unprocessed ON pending_messages (session_id, processed) WHERE processed = FALSE;

ALTER TABLE pending_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only pending" ON pending_messages FOR ALL USING (auth.role() = 'service_role');
```

---

## 3. Tool `envia_pn`

### Assinatura

```typescript
envia_pn({
  part_number: string,           // PN validado (normalized)
  quantity: string,              // "2", "1 unidade", "10-20 dependendo"
  urgency: 'AOG' | 'rotina',     // bot mapeia das palavras-chave
  customer_name?: string,        // opcional, do contato Chatwoot
  customer_phone?: string,       // opcional, do contato Chatwoot
  notes?: string,                // contexto adicional do agente
})
  → { ok: true, lead_id: string }
```

### Execução

1. Salva linha em `leads` com `contact_id`, todos os campos, `status='pendente'`
2. Monta mensagem formatada:
   ```
   🆕 *NOVO LEAD QUALIFICADO*

   👤 *Cliente:* João Silva
   📱 *WhatsApp:* +55 11 99999-9999
   🔧 *Part Number:* MS21266-2N
   🔢 *Quantidade:* 2
   ⚡ *Urgência:* AOG 🔴

   📝 _Cliente confirmou que peça é pra aeronave em solo, urgência máxima._

   🔗 Atender em:
   https://chat.leaderaperformance.com.br/app/accounts/1/conversations/463
   ```
3. Envia via QuePasa pro número fixo `5591981617148`
4. Adiciona tag `orcamento_enviado` na conversa (Chatwoot)
5. Retorna `{ ok: true, lead_id }` pro LLM

### Endpoint QuePasa
- URL: `${quepasa_host}/v4/send` (mesma da inbox config)
- Header `X-QUEPASA-CHATID: 5591981617148`

### System Prompt — Seção 14 nova

```
## 14. ENVIO AO VENDEDOR (tool envia_pn)

Quando você tiver TODOS os dados qualificados:
- Part Number validado (após validate_part_number(valid:true))
- Quantidade (perguntar se não tiver)
- Urgência ("AOG" ou "rotina")

CHAME a tool `envia_pn` IMEDIATAMENTE com:
- part_number: o normalized da validação
- quantity: a quantidade fornecida
- urgency: "AOG" se cliente mencionou urgência/AOG, caso contrário "rotina"
- customer_name: nome do cliente se você sabe (a memória mostra)
- customer_phone: telefone se você sabe
- notes: qualquer contexto relevante (modelo da aeronave, condição preferida, etc.)

Após `envia_pn`:
- A tag `orcamento_enviado` é adicionada automaticamente pelo sistema
- Responda ao cliente: "Recebi os dados. Nosso especialista vai te retornar com a cotação em até 48h úteis."
- Para AOG, diga: "Dados enviados ao AOG Desk. Especialista vai te contatar agora."

NÃO chame `envia_pn` sem ter Part Number validado.
NÃO chame mais de uma vez na mesma conversa, exceto se cliente mandar PN diferente.
```

---

## 4. Dashboard `/dashboard/leads`

### Listagem

Tabela com cards/linhas mostrando:

| Coluna | Origem |
|---|---|
| Cliente | `leads.customer_name` ou `contacts.name` (fallback) |
| Telefone | `leads.customer_phone` ou `contacts.phone_number` |
| Part Number | `leads.part_number` |
| Quantidade | `leads.quantity` |
| Urgência | `leads.urgency` (badge: 🔴 AOG / 🟡 rotina) |
| Enviado há | `formatRelative(leads.sent_to_seller_at)` |
| Status | `leads.status` (badge) |
| Notas | `leads.notes` (truncado, tooltip mostra full) |
| Ações | Botão "Marcar atendido" / link Chatwoot |

### Filtros

- Status: Pendente (default) / Em atendimento / Fechado Ganho / Fechado Perdido / Todos
- Urgência: Todas / AOG / Rotina
- Ordenação: AOG primeiro, depois `sent_to_seller_at DESC`

### Ações

- **Marcar como em atendimento:** PATCH `/api/leads/{id}` com `status='em_atendimento'`
- **Marcar como fechado (ganho/perdido):** atualiza status + adiciona tag correspondente na conversa do Chatwoot via tags API
- Link direto pra conversa no Chatwoot (abre nova aba)

### Nav

Adiciona "Leads" na nav do dashboard (entre "Contatos" e "OpenAI").

---

## 5. Debouncing 5s

### Filosofia

Quando cliente manda múltiplas mensagens em rajada, juntar tudo e responder uma vez. Evita resposta fragmentada e melhora qualidade do contexto.

### Implementação (Vercel-compatible)

```
Webhook recebe mensagem M
    ↓
INSERT em pending_messages (session_id, content, received_at = now())
    ↓
    Lê o `id` retornado (próprio M)
    ↓
await sleep(5000)  // 5 segundos
    ↓
SELECT id FROM pending_messages
WHERE session_id = M.session_id
  AND received_at > M.received_at
LIMIT 1
    ↓
Encontrou? → ABORT (outra execução vai processar)
    ↓
Não encontrou? → continua:
    ↓
SELECT * FROM pending_messages
WHERE session_id = M.session_id
  AND processed = FALSE
ORDER BY received_at ASC
    ↓
UPDATE pending_messages SET processed = TRUE
WHERE id IN (...lista...)
    ↓
Combina os contents:
  "oi\n\ntudo bem\n\n?"
    ↓
Chama runAgent com texto combinado
```

### Garantias

- **Concorrência:** se 3 webhooks chegam simultâneos, todos awaitam 5s. Só o ÚLTIMO (com `received_at` mais novo) consegue passar do check de "newer". Os outros abortam.
- **Race condition no UPDATE:** se duas execuções marcam processed=TRUE ao mesmo tempo, ok — Postgres serializa. Pior caso: agente roda 2x com mesma lista (raro). Mitigação: `UPDATE ... RETURNING id` e usar apenas os que voltaram.
- **Mensagens com attachment** entram no debounce normalmente — o `enrichedContent` (após processAttachment) é o que salvamos em `pending_messages.content`.
- **AgentBot / User**: continuam sendo ignorados ANTES de entrar no debounce.
- **Dedup atômico** (fase 5) continua acontecendo ANTES — sem mudança ali.

### Runtime serverless

- Cada execução fica até 5s em sleep + ~3-10s no agente = ~8-15s total
- Vercel Pro permite 60s — confortável
- Custo: cada webhook ainda usa 1 invocação, mas a maioria aborta após 5s sem processar nada (apenas 1 INSERT + 1 SELECT + sleep). Muito barato.

### Edge cases

- Cliente manda 1 mensagem isolada → aguarda 5s → processa normal (só 1 mensagem na lista)
- Cliente manda 5 mensagens em 4s → 4 abortam, 1 (a última) processa as 5 juntas
- Cliente manda 1, espera 6s, manda outra → cada uma processada separadamente (correto)

---

## 6. Mudanças no fluxo do webhook

Posição da deduplicação atualizada:

```
1. Filtros básicos (inbox_id, AgentBot, etc)
2. Dedup atômico por chatwoot_message_id
3. Process attachments → enrichedContent
4. INSERT em pending_messages (com enrichedContent)
5. await 5s
6. Check se chegou mensagem mais nova nesse session → se sim, ABORT
7. SELECT all unprocessed for session, mark processed
8. Combine contents → finalContent
9. Upsert contact + save to memory + run agent + send via QuePasa
   (tudo igual antes, mas com finalContent no lugar de enrichedContent)
```

---

## 7. Estrutura de arquivos

### Novos

```
lib/leads.ts                     ← createLead, listLeads, updateLeadStatus
lib/debounce.ts                  ← insertPending, getNewerExists, drainPending
app/api/leads/route.ts           ← GET (list)
app/api/leads/[id]/route.ts      ← PATCH (status update)
app/dashboard/leads/page.tsx     ← Tela listagem
components/leads-table.tsx       ← Tabela com filtros e ações
tests/leads.test.ts
tests/debounce.test.ts
```

### Modificados

```
app/api/webhook/route.ts         ← chama debounce + nova tool envia_pn
lib/prompt.ts                    ← seção 14 sobre envia_pn
app/dashboard/layout.tsx         ← link "Leads" na nav
tests/webhook.test.ts            ← novo cenário com debounce
```

### Schema migration

```
supabase/migrations/20260519000001_leads_and_pending.sql
```

---

## 8. Configuração do número do vendedor

Pra não hardcodar `5591981617148`, adicionar uma coluna na tabela `inboxes`:

```sql
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS seller_phone TEXT;
```

E uma seção no form de inbox: "WhatsApp do vendedor (recebe leads qualificados)".

Inbox da Amazon Jet vai ter `seller_phone = '5591981617148'`.

Se `seller_phone` for null, a tool `envia_pn` salva o lead mas não envia WhatsApp (loga warning).

---

## 9. Critérios de aceitação

1. Bot coleta PN + quantity + urgency → chama `envia_pn` → vendedor recebe WhatsApp formatado.
2. Tag `orcamento_enviado` é aplicada na conversa automaticamente.
3. Lead aparece em `/dashboard/leads` com todos os dados.
4. Admin pode marcar lead como "em atendimento" ou "fechado".
5. Cliente manda 3 msgs em 3s → bot responde 1x com tudo junto.
6. Cliente manda 1 msg, espera 10s, manda outra → 2 respostas separadas.
7. Build limpo, testes passam, deploy OK.

---

## 10. Fora do escopo

- Notificações por outro canal (email, Telegram) pro vendedor
- Anexar arquivos junto com o lead (cliente mandou foto da etiqueta → vendedor recebe só o texto extraído)
- Status do lead refletindo nas tags Chatwoot além de `orcamento_enviado` (sincronização bidirecional)
- Atribuir lead a vendedor específico (multi-vendedor)
- SLA timer / alertas se lead AOG não foi atendido em X min
