# Spec — Automações do Funil de Vendas (Amazon Jet Aviation)

**Data:** 2026-06-24
**Origem:** documento "Orientação para Desenvolvimento — Agente de IA + CRM/Kanban", pontos 5, 7 e 9.

## 1. Objetivo

Implementar as **3 mensagens automáticas por tempo** que mantêm os leads aquecidos no funil de vendas:

- **Ponto 5** — lead parado em "Leads Novos" por 24h → mensagem "equipe ainda buscando fornecedores".
- **Ponto 7** — lead em "Orçamento Enviado" há 24h → follow-up da cotação.
- **Ponto 9** — lead em "Venda Fechada" → reativação a cada 15 dias.

Tudo gerado por IA (personalizado com o histórico do lead), enviado no WhatsApp via QuePasa.

Inclui também (§12) uma **SLA de resposta**: se um lead manda mensagem e o humano não responde em 15 min, a IA retoma a conversa.

## 2. O que JÁ existe (fora do escopo)

| Ponto | Onde já é resolvido |
|-------|---------------------|
| 1 (perguntas PN/qtd/AOG), 2 (qualificação + grupo) | Agente de IA atual |
| 3 (etiquetas automáticas) | Agente de IA atual (`add_label`) |
| 4, 10 (estrutura do Kanban, entrada no funil) | **Funil nativo do Chatwoot** ("Amazon Jet Vendas") |
| 6, 8 (mover card, trocar etiqueta, registrar data/valor) | Vendedor faz no Chatwoot (drag do card + campo `amount` / atributo `valor`) |
| 11, 12 (regras, campos do CRM) | Chatwoot (contato, atributos, `assigned`, `amount`, datas do funil) |

**Decorrência:** nosso build é SÓ as 3 automações + o cron + dedup + prompts + cliente da API do funil. Nada de board novo no dashboard, nada de campo novo de CRM.

## 3. Descobertas da API do funil (Chatwoot)

Plugin de funil exposto em `/app/accounts/14/funnels/...`. API confirmada com o token que já temos no banco (`inboxes.chatwoot_user_token`, conta 14):

- `GET /api/v1/accounts/14/funnels` → lista funis + steps.
- `GET /api/v1/accounts/14/funnels/{funnelId}/funnel_steps/{stepId}/funnel_items` → **itens (cards) daquele step**, com todos os campos abaixo.

Funil atual: **id 9**, identifier `amazon_jet_vendas`, steps:

| step_id | título | identifier | step_type | automação |
|---------|--------|-----------|-----------|-----------|
| 34 | Leads Novos | `leads_novos` | `start` | ponto 5 (24h) |
| 36 | Orçamento Enviado | `oramento_enviado` [sic] | `middle` | ponto 7 (24h) |
| 38 | Venda Fechada | `venda_fechada` | `end` | ponto 9 (15d) |

Campos relevantes de cada `funnel_item`:

- `funnel_step_id` — coluna atual.
- `start_in_step` (unix ts) — **quando entrou na etapa** = relógio dos 24h/15d. Reseta quando o card muda de coluna.
- `amount` — valor do negócio (ex: "0.0").
- `label_list` — etiquetas (ex: `["novo_lead","orcamento_enviado"]`).
- `status` — `active` (ignorar não-active).
- `contact.identifier` (ex: `556185750787@s.whatsapp.net`) = nosso `session_id`; `contact.phone_number`.
- `assigned` — responsável interno (ponto 12).
- `conversation.inbox_id` — pra achar o gateway QuePasa.

> ⚠️ **Não hardcodar 9/34/36/38.** No início de cada execução, `GET /funnels`, achar o funil por `identifier='amazon_jet_vendas'` (env `FUNNEL_IDENTIFIER`), e mapear os steps por `step_type` (`start`/`middle`/`end`). Resiliente se o funil for recriado.

## 4. Regra de disparo (por funnel_item)

```
idade_na_etapa = agora - start_in_step
inatividade    = agora - contacts.last_message_at   (do nosso banco)

dispara SE:
  idade_na_etapa >= threshold
  E inatividade   >= threshold      ← gate que evita atropelar humano ativo
  E não-duplicado (ver §6)
  E item.status == 'active'
  E contato tem identifier/phone
```

**Handoff:** NÃO bloqueia (decisão do usuário em 2026-06-24). Leads em "Orçamento Enviado"/"Venda Fechada" quase sempre têm humano; bloquear esvaziaria os pontos 7 e 9. O **gate de inatividade** é a proteção: se o vendedor (ou cliente) falou dentro do período, `last_message_at` é recente → não dispara. (O handoff segue valendo pro atendimento em tempo real — a IA não responde mensagem do cliente quando humano assumiu; isto aqui é só um cutucão agendado em lead parado, coisa diferente.)

> Por que `last_message_at` do nosso banco e não `start_in_step`: o webhook salva TODA mensagem (cliente e `[atendente]:`), então `last_message_at` reflete atividade dos dois lados sem custo de API extra.

### Thresholds (env, defaults do doc)
- `FUNNEL_LEADS_NOVOS_HORAS=24`
- `FUNNEL_ORCAMENTO_HORAS=24`
- `FUNNEL_VENDA_FECHADA_DIAS=15`

## 5. Mensagens (IA personalizada)

Reusa o padrão do `lib/followup.ts` (`generateText` + histórico via `loadHistory`). 3 prompts por etapa:

- **5 (leads_novos):** reconforto, sem cobrança — "seguimos buscando o melhor fornecedor/condição pra sua peça". Mantém o lead aquecido enquanto a cotação não saiu.
- **7 (orcamento_enviado):** follow-up consultivo da cotação (já existe a variante no `FOLLOWUP_SYSTEM_PROMPT`, branch `orcamento_enviado`).
- **9 (venda_fechada):** reativação pós-venda — abre nova oportunidade de cotação.

Regras das mensagens: citar PN/nome se houver no histórico, nunca inventar; 2–4 frases; tom premium; nunca dizer "follow-up"/"automação".

## 6. Dedup (regra 11 — "evitar mensagens duplicadas")

Tabela nova `funnel_automations_sent`:

```sql
create table funnel_automations_sent (
  id uuid primary key default gen_random_uuid(),
  funnel_item_id   bigint not null,
  conversation_id  bigint,
  automation_type  text not null,   -- 'leads_novos' | 'orcamento_enviado' | 'venda_fechada'
  start_in_step    bigint not null, -- âncora: identifica a "entrada na etapa"
  sent_at          timestamptz not null default now(),
  message          text
);
create index on funnel_automations_sent (funnel_item_id, automation_type, start_in_step);
```

- **5 e 7 (one-shot por entrada na etapa):** pula se já existe row `(funnel_item_id, automation_type, start_in_step)`. Se o card muda de etapa e volta, `start_in_step` muda → nova âncora → pode disparar de novo (correto).
- **9 (recorrente 15d):** dispara se `agora - max(sent_at) >= 15 dias` pra `(funnel_item_id, 'venda_fechada')`.

## 7. Envio

1. `loadInboxByChatwootId(funnel_item.conversation.inbox_id)` → host/token QuePasa.
2. `sendMessage({host,token}, contact.identifier (digits), mensagem)`.
3. `saveMessage(sessionId, 'assistant', mensagem)` — mantém o contexto consistente.
4. Grava row de dedup.
5. Erro de envio → **não** grava dedup (re-tenta no próximo ciclo).

## 8. Cron / agendamento

- Endpoint `POST /api/cron/funnel-automations?secret=CRON_SECRET`, `maxDuration = 60`.
- Fluxo: resolve funil/steps → pra cada step, lista funnel_items → aplica regra §4 → gera msg → envia → dedup.
- **Agendamento:** cron-job.org (já usado pelo projeto) a cada ~3h. Vercel Hobby cron é 1x/dia (grosseiro demais pros 24h); cron-job.org dá a granularidade.

## 9. Reconciliação com o follow-up existente

`lib/followup.ts` (cron `/api/cron/followup`, diário) hoje faz follow-up por `status='ia'` + labels de engajamento — **sobrepõe ao ponto 7**.

**Decisão:** o novo `funnel-automations` passa a ser o follow-up oficial dos leads que estão no funil. Pra evitar mensagem dupla, **desativamos o cron `/api/cron/followup` antigo** (remove do `vercel.json`) — o novo cobre melhor (é funnel-aware e tem o gate de inatividade). O código do `followup.ts` é reaproveitado (prompts/envio), não jogado fora.

## 10. Testes

- Unit: elegibilidade (idade + inatividade + status) por tipo de automação.
- Unit: mapeamento `step_type` → `automation_type` (resiliente a ids).
- Unit: dedup one-shot (5/7) vs recorrente 15d (9).
- Unit: skip quando sem identifier/phone, sem quepasa, status != active.
- Mocks: cliente da API do funil, QuePasa, LLM (`generateText`).

## 11. Setup no Chatwoot (usuário)

- Funil "Amazon Jet Vendas" ✓ (existe).
- Atributo `valor` ✓ (criado). Opcional: padronizar o campo `amount` do card como valor da venda.
- Token do Chatwoot com acesso à API do funil ✓ (testado).
- Nada mais — sem novas etiquetas obrigatórias (a automação lê a COLUNA, não a etiqueta).

## 12. SLA 15 min — takeover automático da IA

**Regra:** se o cliente manda mensagem numa conversa que está com humano (sem `atendimento_ia`) e **ninguém responde em 15 min**, a IA **retoma a conversa** (re-ativa) e responde. (Decisão do usuário 2026-06-24: takeover completo.)

Isto é a **exceção** à regra de silêncio pós-handoff: a IA fica muda após o humano assumir, *exceto* se o humano não responder dentro da SLA.

### Mecanismo (reusa QStash, igual ao debounce)
1. Mensagem de `Contact` chega numa conversa handed-off (`!atendimento_ia && !wasNew`) → além de salvar, agenda job QStash **+15 min** → `POST /api/sla-takeover?secret=CRON_SECRET` com `{sessionId, conversationId, chatwootInboxId, sinceAt}`.
2. Aos 15 min, o endpoint checa:
   - Existe mensagem `[atendente]:` OU `ai` salva DEPOIS de `sinceAt`? → humano/IA já respondeu → **cancela**.
   - Existe mensagem de cliente MAIS NOVA que `sinceAt`? → o job dela cuida → **pula** (evita duplicar / responder no meio da digitação).
   - Conversa encerrada/resolvida? → pula.
3. Se nada disso → **takeover**:
   - Re-adiciona `atendimento_ia` (Chatwoot + `contacts.current_labels`) + `contacts.status='ia'`.
   - Roda o agente no conteúdo pendente do cliente → responde via QuePasa.
   - A partir daí a IA é dona da conversa até um humano tirar a tag de novo.

### Config
- `SLA_TAKEOVER_MIN=15`, `SLA_TAKEOVER_ENABLED=true` (env).

### Por que é seguro
- O prompt do agente já LÊ as mensagens `[atendente]:` e nunca contradiz/repete o que o humano falou (regra já existente). Então, mesmo retomando, a IA respeita o contexto do vendedor.
- O gate "sem resposta em 15 min" garante que a IA só assume conversa realmente parada.

### Edge cases
- Grupo → nunca (já pulado no webhook).
- Vendedor responde direto no WhatsApp (fora do Chatwoot) → não detectado → IA pode assumir achando que ninguém respondeu. Limitação conhecida; mitigação: vendedores respondem pelo Chatwoot (msgs `[atendente]:` são capturadas).
- Idempotência: só o job da última msg do cliente age; após re-adicionar `atendimento_ia`, o fluxo normal volta a valer.
- IA já é dona (conversa não handed-off) → não se aplica (fluxo normal responde na hora).

### Testes
- Cancela se há `[atendente]:`/`ai` após `sinceAt`.
- Pula se há msg de cliente mais nova.
- Takeover re-adiciona `atendimento_ia` + `status='ia'` + responde, quando 15 min sem resposta.
- Mocks: QStash, memory, QuePasa, runAgent.

> ⚠️ Ao implementar, atualizar a memória `handoff-silence-intentional` pra registrar essa exceção de SLA (hoje ela diz "IA muda pra sempre após handoff").

## 13. Fora deste spec (futuro)

- Dashboard ler `amount` dos funnel_items pra métricas de receita (analytics do ponto 12).
- Resumo diário no WhatsApp do vendedor (task #7).
- Retomada da IA pós-handoff (decidido manter como está).
