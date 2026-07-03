# Spec — Melhorias de Qualificação + Ciclo de Vida da Cotação

**Data:** 2026-07-03
**Origem:** doc "Especificação de Melhorias da IA de Atendimento – Amazon Jet Aviation" (8 pontos). Vídeo excluído do escopo (a pedido); demais mídias (foto/PDF/áudio/planilha) contempladas.

## 1. Objetivo

Aprimorar a qualificação de leads: (A) parar de classificar AOG errado e padronizar coleta de motores; (B) impedir cotações duplicadas e tratar anexos/mensagens tardios como complemento da MESMA cotação, via máquina de estados no código.

## 2. Já resolvido (fora de escopo)

- **Vídeo já é ignorado** — `processAttachment` (lib/media/process.ts) não processa vídeo.
- **Foto/PDF/áudio/planilha já são lidos** — visão, extração de PDF, transcrição, xlsx/csv.
- **Agrupamento curto** — o debounce (QStash) já junta o que chega em ~15-25s numa cotação. Este spec cobre o gap "minutos depois" + a duplicação.

---

# BLOCO A — Qualificação (prompt + `envia_pn`)

## A1. Classificação AOG em 3 níveis

**Problema atual (confirmado no código):** o directive (lib/agent.ts) e o prompt (lib/prompt.ts:158) dizem `"urgente / agora → AOG"`. A `envia_pn` só aceita `urgency: z.enum(['AOG','rotina'])`. Resultado: "urgente" vira AOG automaticamente.

**Mudanças:**
1. `envia_pn.inputSchema.urgency` → `z.enum(['AOG', 'Urgente', 'rotina'])` (process-incoming.ts).
2. Regras novas no directive (agent.ts) e no prompt.ts:
   - **AOG** → SÓ com confirmação explícita de aeronave parada: "aeronave parada", "em solo", "AOG", "grounded", "não voa/não decola". 
   - **Urgente** → cliente diz "urgente" / "o mais breve possível" / "rápido" / "com pressa" SEM confirmar aeronave parada → classifica **Urgente** E pergunta *"A aeronave está parada (AOG)?"*. Se confirmar parada → AOG.
   - **rotina** → "sem pressa", "quando der", "normal", "rotina".
   - REMOVER as linhas atuais que mapeiam "urgente → AOG".
3. Notificação ao vendedor (process-incoming.ts, `urgencyEmoji`): AOG 🔴 · Urgente 🟠 · rotina 🟡.
4. A pergunta de urgência (directive "falta URGÊNCIA") passa a capturar os 3 níveis / fazer o follow-up de AOG quando o cliente só disser "urgente".

## A2. Fluxo de motor

**Gatilho:** termos no texto/histórico → Motor, Engine, Lycoming, Continental, Pratt (& Whitney), PT6, IO-540, O-360, IO-550, TSIO, AEIO, GO, VO, HIO (e variações de modelo de motor).

**Coleta obrigatória (modo motor):** modelo do motor · PN (se houver) · SN (se houver) · modelo da aeronave · **foto da plaqueta**. Se PN ou SN não forem conhecidos → orientar o cliente a enviar a **foto da plaqueta do motor**.

**Sem mudança de schema:** o motor entra na `envia_pn` como um item — `part_number` = PN (ou o modelo do motor se sem PN), `quantity`, `notes` = "SN: {sn}"; `general_notes` = "Aeronave: {modelo}, Motor: {modelo do motor}". Só guia o prompt (nova seção "MODO MOTOR" no directive + prompt.ts).

> A2 não bloqueia envio: se o cliente não tiver PN/SN mas tiver modelo do motor + aeronave + foto da plaqueta, é o suficiente pra `envia_pn` (o vendedor cota pela plaqueta).

---

# BLOCO B — Ciclo de vida da cotação (máquina de estados no código)

Objetivo: a **trava anti-duplicação fica no código**, não depende do modelo obedecer.

## B1. Modelo de dados — tabela `quote_sessions`

`id` é o "conversation_id" que a spec recomenda (único por cotação aberta).

```sql
create table if not exists quote_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id   text not null,
  state        text not null default 'aguardando_info',  -- aguardando_info | recebendo_anexos | qualificado | cotado
  part_numbers text[] not null default '{}',
  lead_ids     uuid[] not null default '{}',
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,            -- null = aberta
  updated_at   timestamptz not null default now()
);
-- no máximo 1 cotação ABERTA por sessão
create unique index if not exists uq_quote_open on quote_sessions (session_id) where closed_at is null;
create index if not exists idx_quote_session on quote_sessions (session_id, closed_at);
```

## B2. Módulo `lib/quote-session.ts`

- `getOpenQuote(sessionId)` → retorna a cotação aberta OU null. **Auto-close por inatividade:** se a aberta tem `updated_at` mais velho que `QUOTE_IDLE_HOURS` (env, default 48), fecha ela (`closed_at=now`) e retorna null (uma nova será aberta) — assim cliente que volta dias depois abre cotação nova.
- `openQuote(sessionId)` → cria uma aberta (`aguardando_info`). Respeita o unique index (se já existe aberta, retorna a existente).
- `markState(id, state)`, `addPartNumbers(id, pns[])`, `addLeadIds(id, ids[])`, `touch(id)` (bump updated_at), `closeQuote(id)`.

## B3. Guarda de deduplicação na `envia_pn` (o coração do Bloco B)

No `execute` da `envia_pn` (process-incoming.ts), ANTES de criar leads:

1. `quote = getOpenQuote(sessionId)` — se null, `openQuote(sessionId)`.
2. Separa os `items` em:
   - **novos** → `part_number` NÃO está em `quote.part_numbers`.
   - **repetidos** → já está.
3. **novos** → `createLead` (como hoje) + adiciona aos `quote.part_numbers`/`lead_ids` + notifica o vendedor com o lead completo (mensagem atual).
4. **repetidos** → **NÃO cria lead**. Junta pra uma mensagem de **atualização** ao vendedor.
5. Se houve repetidos (ou a chamada é 100% complemento) → envia ao grupo: *"📎 Atualização na cotação de {cliente} (id {quote.id}): cliente reforçou/mandou mais sobre {PNs}. Ver conversa no Chatwoot."*
6. `markState(quote.id, 'cotado')`. Retorna `{ ok: true, count: novos.length, updated: repetidos.length }`.

**Efeito:** mesmo que o gpt-4o-mini chame `envia_pn` de novo com o mesmo PN (anexo tardio, retomada, etc.), o código **não cria lead duplicado** — só atualiza. Garantia dura.

## B4. Injeção do estado no prompt

Em `processIncomingMessage`, antes do `runAgent`, carrega a cotação aberta e injeta no contexto (via `toolDirective` ou prefixo do system prompt):

> `COTAÇÃO ATUAL desta conversa: estado={state}; PNs já na cotação=[...]; já enviada ao time={sim/não}. Anexos/mensagens novos = COMPLEMENTO da mesma cotação (não recote). Só é NOVA cotação se o cliente pedir outro produto/PN/aeronave.`

Ajuda o modelo a se comportar; a trava real continua no B3.

## B5. Estados e transições

- `aguardando_info` — cotação aberta, sem PN ainda.
- `recebendo_anexos` — chegou anexo (setado quando o batch do worker tem anexo).
- `qualificado` — informativo (tem PN/qtd/urgência; transitório, best-effort).
- `cotado` — `envia_pn` disparou (B3).

Enforcement crítico é no `cotado` (dedup). Os intermediários são best-effort (visibilidade/dashboard futuro).

## B6. Atualização ao vendedor

Helper que reusa o envio QuePasa ao grupo (mesma config da notificação de lead) pra mandar a mensagem "📎 Atualização" do B3.5. Sem criar lead, sem planilha nova.

---

## 3. Testes

- **A1:** enum de urgência aceita os 3 níveis; classificação (aeronave parada→AOG, "urgente" sem parada→Urgente+pergunta, rotina); emoji do vendedor.
- **A2:** detecção de termos de motor dispara o fluxo (via prompt — teste do texto do directive/prompt presente).
- **B2:** `getOpenQuote` (aberta / auto-close por inatividade / null), `openQuote` idempotente.
- **B3:** guarda de dedup — PNs novos criam lead; repetidos NÃO criam + geram atualização; mix (novo+repetido) faz os dois.
- **B5:** transições de estado.

## 4. Fases de implementação (implementar/testar por partes)

1. **Fase A1** — urgência 3 níveis (enum + directive + prompt + emoji) + testes.
2. **Fase A2** — fluxo de motor (directive + prompt) + teste.
3. **Fase B1** — migração `quote_sessions` + `lib/quote-session.ts` + testes do módulo.
4. **Fase B2** — guarda de dedup na `envia_pn` (usa quote-session) + testes.
5. **Fase B3** — injeção de estado no prompt + mensagem de atualização ao vendedor + transições.

Cada fase: TDD, build, deploy, valida em produção antes da próxima.

## 5. Fora de escopo / futuro

- Vídeo (a pedido).
- Dashboard visual da máquina de estados (os estados ficam prontos pra isso depois).
- Detecção "nova demanda" 100% automática — B usa: PNs novos = leads novos na mesma cotação aberta; inatividade (48h) fecha e a próxima abre nova. Não tenta adivinhar troca de assunto no meio.
