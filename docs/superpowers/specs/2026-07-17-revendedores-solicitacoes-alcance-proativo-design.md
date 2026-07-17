# Revendedores, Solicitações (anti-duplicação) e Alcance Proativo ao Cliente

**Data:** 2026-07-17
**Status:** Design aprovado nas partes (aguardando revisão da spec escrita)

## 1. Contexto e problema

A Amazon Jet Aviation trabalha com **consultores/revendedores parceiros** (ex.: Anderson, Karina, Alessandra, Glauber, Marco Antônio — o grupo "NORTE SAÚDE"). Cada consultor tem **um ou mais números** de WhatsApp.

Quando um **cliente final** manda uma cotação no **privado do consultor**, o consultor **reencaminha** essa cotação pro número da IA processar e disparar no **grupo de cotação**. Isso gera três problemas hoje:

1. **A IA trata o consultor como se fosse o cliente.** Ela não pede quem é o cliente final, então a cotação vai pro grupo com os dados errados (do consultor, não do cliente).
2. **Duplicação.** Consultores (e clientes) mandam a mesma solicitação **mais de uma vez**. A IA reenvia a **mesma cotação** no grupo várias vezes — e às vezes dispara uma versão **antiga** em vez da última.
3. **Cliente final fica "órfão".** Como o cliente falou só com o consultor, ele nunca recebe um retorno da Amazon Jet, e quando (se) ele fala com a gente, a IA não sabe de nada do histórico.

## 2. Visão geral da solução

Três partes, construídas **em cima da máquina `quote_sessions`** que já existe na branch `feat/qualif-ciclo-cotacao` (ainda não mergeada) — que evolui para a tabela **`solicitacoes`**.

- **Parte 1 — Detecção de revendedor + confirmação do cliente.** Lista de números cadastrados. Mensagem vinda de um número da lista = revendedor encaminhando. A IA coleta e **confirma nome + número do cliente final** antes de qualquer disparo.
- **Parte 2 — Solicitações anti-duplicação com ID.** Cada solicitação tem um **ID único sequencial (`#0001`…)**, é **chaveada pelo número do cliente final**, e o disparo no grupo obedece: manda **1 vez**, atualização manda a **lista completa nova 1 vez**, repetição idêntica **pergunta** se é nova ou a mesma.
- **Parte 3 — Alcance proativo ao cliente.** No caso do revendedor, assim que o cliente é confirmado, a IA **cria contato+conversa no Chatwoot** pro número do cliente e manda uma **mensagem cordial citando o consultor**, além de **semear o contexto na memória** pra atender bem quando o cliente responder.
- **Parte 4 — Card no Kanban (funil).** No fluxo do revendedor, a etiqueta de qualificação (`orçamento_pendente`) é posta na conversa do **CLIENTE** (não do revendedor) — a automação de etiqueta→card do próprio Chatwoot cria o card no estágio certo. Conforme a conversa do cliente evolui, as etiquetas normais da IA movem o card pelos estágios. Uma etiqueta só (trava das solicitações) = **um card só**, sem duplicar.

### Princípio central (híbrido IA + banco)

A IA lê o contexto e monta a **cotação mais recente**; o **banco (`solicitacoes`) é a trava determinística** que decide se libera ou bloqueia o disparo. Assim, mesmo quando o LLM escorrega (manda repetido ou pega uma antiga), o banco impede a duplicação. Não confiamos o anti-duplicação a "a IA vai lembrar".

## 3. Componentes

### 3.1 Tabela `resellers` + `lib/resellers.ts`

Cadastro dos consultores parceiros. **Uma linha por número** (um consultor com 2 números = 2 linhas com o mesmo `name`).

```
resellers
  id          uuid PK default gen_random_uuid()
  name        text not null          -- nome do consultor (ex. "Anderson")
  phone       text not null unique   -- número normalizado (só dígitos, com DDI/DDD)
  active      boolean not null default true
  created_at  timestamptz default now()
```

`lib/resellers.ts`:
- `normalizePhone(raw): string` — só dígitos (reaproveitar a normalização já usada no projeto).
- `findReseller(phone): Promise<{ name: string } | null>` — lookup por `phone` normalizado e `active = true`. Retorna o nome do consultor ou `null`.

O cadastro inicial dos números é feito manualmente (seed/insert) — fora do escopo de UI.

### 3.2 Tabela `solicitacoes` (evolução de `quote_sessions`) + `lib/solicitacoes.ts`

Evolui `quote_sessions`. Diferenças: ganha **ID sequencial legível**, passa a ser **chaveada pelo cliente final** (não pela sessão da conversa) e registra a **origem revendedor**.

```
solicitacoes
  id                uuid PK default gen_random_uuid()
  numero            bigint not null unique     -- de uma SEQUENCE; exibido como #0001
  client_phone      text not null              -- CHAVE de dedup (número do cliente final, normalizado)
  client_name       text
  state             text not null default 'aberta'  -- aberta | enviada | fechada
  part_numbers      text[] not null default '{}'
  lead_ids          uuid[] not null default '{}'
  via_reseller      boolean not null default false
  reseller_name     text                       -- nome do consultor, quando via_reseller
  reseller_phone    text                       -- número do consultor que encaminhou
  origin_session_id text not null              -- sessão por onde a mensagem chegou (consultor OU cliente)
  sent_to_group_at  timestamptz                -- null = ainda não disparou no grupo
  opened_at         timestamptz default now()
  updated_at        timestamptz default now()
  closed_at         timestamptz
```

- **SEQUENCE** dedicada (`solicitacoes_numero_seq`) pro `numero` — atômica, nunca reutiliza. Formato de exibição: `#` + `numero` com zero à esquerda em **4 dígitos** (`padStart(4,'0')`), crescendo pra 5 dígitos naturalmente depois de `#9999`.
- **Índice único parcial** `uq_solicitacao_aberta` em `(client_phone) WHERE closed_at IS NULL` — garante **no máximo 1 solicitação aberta por cliente**.

`lib/solicitacoes.ts` (evolução do módulo `quote-session.ts`):
- `splitItemsByQuote(items, existingPNs)` — **reaproveitado como está** (separa PNs novos dos repetidos, case-insensitive + trim).
- `getOpenSolicitacao(clientPhone, nowMs?)` — solicitação aberta do cliente, fechando sozinha após `QUOTE_IDLE_HOURS` (default 48) sem novidade.
- `openSolicitacao(input)` — cria com `numero` da sequence, `client_phone`, `origin_session_id`, e (se houver) `via_reseller/reseller_name/reseller_phone`.
- `addToSolicitacao(id, pns, leadIds)` — acumula PNs/leads (dedup por set).
- `markSent(id)` — seta `state='enviada'` + `sent_to_group_at = now()`.
- `markState(id, state)`, `closeSolicitacao(id)`.
- `formatNumero(numero): string` — `#0001`.

### 3.3 `lib/chatwoot-outbound.ts` (novo — Parte 3)

Cria contato + conversa no Chatwoot pro número do cliente e manda a mensagem proativa. Usa a API do Chatwoot (não existe helper hoje).

- `ensureClientConversation(cfg, { phone, name, inboxId }): Promise<{ contactId; conversationId }>`
  - `POST /api/v1/accounts/{accountId}/contacts` (ou `contacts/search` + `contacts/filter` pra não duplicar) → cria/acha o contato pelo `phone_number`.
  - `POST /api/v1/accounts/{accountId}/conversations` com `inbox_id` (o inbox WhatsApp, id 45) e `contact_id` → cria a conversa (ou reaproveita a aberta).
- `sendProactiveMessage(cfg, conversationId, text)` — reaproveita o padrão de [chatwoot-send.ts](lib/chatwoot-send.ts) (`POST …/conversations/{id}/messages`, `message_type: outgoing`), deixando o Chatwoot+QuePasa entregarem no WhatsApp do cliente.

> **Nota de entrega:** o inbox WhatsApp já roteia pelo QuePasa. Mandar via API do Chatwoot mantém o registro no CRM (o time vê a conversa e dá sequência). Se o `POST` de mensagem outgoing não disparar no WhatsApp por limitação do canal, o fallback é `sendMessage` do QuePasa direto pro número + criar a conversa no Chatwoot pra rastreio. A escolha final fica pro plano de implementação, validando em produção.

### 3.4 Integração no agente

**Detecção (early, em `process-incoming.ts`):** onde já temos `senderPhone`, chamar `findReseller(senderPhone)`. Se for revendedor, marcar `isReseller = true` + `resellerName`.

**Diretiva/contexto pro agente:** reaproveitar o mecanismo `quoteContext` que a branch já injeta em `runAgent` (via `buildToolDirective`). Injetar dois tipos de contexto:
- Quando **`isReseller`**: "Esta mensagem vem de um CONSULTOR/REVENDEDOR ([Nome]) repassando a cotação de um cliente dele. Antes de enviar ao grupo, PEÇA e CONFIRME o nome e o número do cliente final. Só dispare depois de confirmar."
- Quando existe **solicitação aberta** pro cliente: "Esta conversa é do lead encaminhado pelo consultor [Nome]. Cotação #0102 já recebida: [PNs]. Atenda com esse contexto — não peça de novo o que já temos; toque pro orçamento."

**Ferramenta `envia_pn` (em `process-incoming.ts`) — ajustes:**
- Ganha campos opcionais `client_name?` e `client_phone?`. Quando o contexto é revendedor, o directive exige que a IA só chame `envia_pn` **com** esses campos preenchidos (o cliente confirmado). A execução valida: se `isReseller` e faltar `client_phone`, retorna `{ status: 'faltou_cliente' }` e não dispara.
- **Chave da solicitação:** `client_phone` (revendedor) ou o número do próprio remetente (cliente direto).
- **Lógica de disparo (a trava determinística):**

```
sol = getOpenSolicitacao(clientPhone) ?? openSolicitacao(...)
{ novos, repetidos } = splitItemsByQuote(items, sol.part_numbers)

se sol.sent_to_group_at == null:                 # primeira vez (todos os itens são novos)
    cria leads p/ os itens, addToSolicitacao, markSent
    dispara no grupo  → 🆕 SOLICITAÇÃO #NNNN (lista completa)
    se via_reseller: alcance proativo ao cliente + semeia memória
    return { status: 'enviada', numero }

senão se novos.length > 0:                        # já enviada, tem item novo
    cria leads p/ novos, addToSolicitacao
    dispara no grupo  → 🔄 ATUALIZAÇÃO #NNNN (lista completa nova)
    return { status: 'atualizada', numero }

senão:                                            # já enviada, tudo repetido
    NÃO dispara
    return { status: 'possivel_duplicata', numero }   # → IA pergunta "nova ou a mesma?"
```

- **Nova ferramenta `nova_solicitacao`** (ou `envia_pn` com `forcar_nova: true`): quando, após `possivel_duplicata`, o cliente responde que é **nova cotação**, a IA fecha a atual (`closeSolicitacao`) e abre outra (novo `numero`, novo disparo `🆕`). Se responder "a mesma", a IA só tranquiliza ("sua cotação #NNNN já está com o time") e não dispara nada.
- **Remoção do `orcamento_pendente` duplicado:** a lógica de etiqueta atual (`addLabel(..., 'orçamento_pendente')`) continua **só no primeiro disparo** (status `enviada`), não em atualização/duplicata.

## 4. Fluxos detalhados

### 4.1 Cliente direto (o que muda)

Igual hoje, **mas** passando pela trava de `solicitacoes`:
1. Cliente manda PNs → IA qualifica → chama `envia_pn` (sem campos de cliente; usa o próprio número).
2. Primeira vez → cria `#NNNN`, dispara `🆕` no grupo, etiqueta `orçamento_pendente`.
3. Reenvio/adições seguem a tabela de disparo (atualização / pergunta). **Sem mensagem proativa** (o cliente já está falando com o bot).

### 4.2 Revendedor encaminha cotação

1. Chega mensagem de número **na lista `resellers`** → `isReseller = true`, `resellerName`.
2. IA lê a cotação (PNs+qtd) e, pela diretiva, **pede nome + número do cliente final**: *"Me confirma o nome e o número do cliente pra eu registrar a cotação?"*
3. Consultor responde nome+número. Se **não** responder, a IA **segura** (não dispara).
4. IA chama `envia_pn` com `client_name`+`client_phone`.
5. Execução: cria/abre `solicitacoes` chaveada por `client_phone`, `via_reseller=true`, `reseller_name=[Nome]`.
6. Dispara no grupo `🆕 SOLICITAÇÃO #NNNN` com **Cliente:** [nome+número do cliente] e linha **"via consultor: [Nome]"**.
7. **Alcance proativo:** cria contato+conversa do cliente no Chatwoot e manda a mensagem cordial (§6.2). **Semeia a memória** (§7).
8. Daqui pra frente, a máquina anti-duplicação vale igual (a chave é o cliente, então dois clientes do mesmo consultor = duas solicitações separadas).

## 5. Regra de envio ao grupo (resumo)

| Situação | O que o grupo recebe |
|---|---|
| 1ª vez qualificada | **🆕 SOLICITAÇÃO #NNNN** — lista atual completa |
| Cliente acrescenta/muda item (já enviada) | **🔄 ATUALIZAÇÃO #NNNN** — lista completa nova (1 vez) |
| Cliente repete os mesmos PNs (já enviada) | **Nada** — IA pergunta "é nova ou a mesma?"; se **nova** → novo `#`, novo 🆕; se **mesma** → nada |

## 6. Mensagens

### 6.1 Grupo de cotação (`envia_pn`)

Mantém o formato atual, com **duas mudanças**: cabeçalho com o **ID** e, no caso revendedor, a linha do consultor.

```
🆕 *SOLICITAÇÃO #0102*        (ou 🔄 *ATUALIZAÇÃO #0102*)
📡 Origem: WhatsApp
👤 Cliente: [nome do cliente final]
📱 WhatsApp: [número do cliente final]
🤝 via consultor: [Nome do consultor]     ← só quando via_reseller
⚡ Urgência: AOG 🔴 / Urgente 🟠 / rotina 🟡
📋 ITENS (n): …
📊 Planilha: [link interno]               ← continua só no grupo, nunca pro cliente
🔗 Atender em: [url Chatwoot]
```

### 6.2 Mensagem proativa ao cliente (texto aprovado)

```
Olá, [Nome do cliente]! Aqui é da Amazon Jet Aviation ✈️

Recebemos seu pedido de cotação através do seu
consultor [Nome do consultor]:
• [PN-1] — Qtd [x]
• [PN-2] — Qtd [x]

Nosso time já está trabalhando no seu orçamento e em
breve retornamos com uma posição. Qualquer coisa, pode
falar com a gente por aqui! 🙂
```

Se a lista de PNs for grande (> 6 itens), troca o bloco de itens por *"sua solicitação de cotação"* sem listar.

## 7. Semeadura de contexto/memória

Objetivo: quando o **cliente responder**, o agente já sabe a origem e o histórico.

Duas camadas:
1. **Estruturada (fonte de verdade):** a origem (`via_reseller`, `reseller_name`) e o estado (`#NNNN`, PNs) vivem na `solicitacoes`. A cada turno, o agente recebe via `quoteContext` a diretiva: *"lead encaminhado pelo consultor [Nome]; cotação #0102 já recebida: [PNs]; atenda com esse contexto"*.
2. **Histórico do chat:** ao mandar a mensagem proativa, gravar `saveMessage(clientPhone, 'assistant', <texto proativo>)` — assim o histórico do cliente já começa coerente (a IA não cumprimenta de novo do zero).

Não gravamos "instrução interna" crua como mensagem de chat (evita a IA repapaguear); o contexto de origem entra via diretiva estruturada.

## 8. Tratamento de erros / edge cases

- **Consultor não confirma o cliente:** IA segura, não dispara (regra do usuário).
- **Número do cliente inválido/malformado:** normaliza; se não der pra normalizar, a IA repergunta o número.
- **Falha ao criar contato/conversa no Chatwoot:** não bloquear o disparo no grupo (o grupo é o crítico). Logar erro; o alcance proativo é best-effort com retry leve.
- **Idle/expiração:** solicitação aberta parada > `QUOTE_IDLE_HOURS` fecha sozinha; a próxima mensagem do mesmo cliente abre uma nova (novo `#`).
- **Corrida no índice único:** `openSolicitacao` trata violação do índice parcial (`uq_solicitacao_aberta`) relendo a aberta existente.
- **Cliente = número de um consultor:** raro; se o "cliente final" informado for um número que também está na lista de consultores, tratar como cliente normal (chaveia pelo número informado).

## 9. Testes (Vitest)

- `resellers`: `normalizePhone`, `findReseller` (achou/não achou/inativo).
- `solicitacoes`: `splitItemsByQuote` (já coberto), `formatNumero` (#0001, #9999, #10000), `getOpenSolicitacao` (idle fecha), unicidade da aberta por cliente.
- `envia_pn` (lógica de disparo): primeira vez → `enviada`; item novo → `atualizada`; tudo repetido → `possivel_duplicata` (não dispara); `forcar_nova` → novo número.
- Revendedor: com `isReseller`, sem `client_phone` → `faltou_cliente` (não dispara); com cliente → chaveia por `client_phone` e marca `via_reseller`.
- `chatwoot-outbound`: monta os endpoints certos (mock de fetch); falha não derruba o disparo do grupo.
- Memória: proativa gera `saveMessage(clientPhone, 'assistant', …)`.

## 10. Segurança e privacidade

- O **número do cliente vem do consultor** (parceiro confiável, fluxo legítimo do negócio) — não é conteúdo não confiável de terceiros. Ainda assim, a IA **confirma** o número antes de usar.
- **Cold outreach:** a mensagem proativa é pra um lead morno (o cliente pediu cotação a um parceiro). Como sai pelo QuePasa próprio, existe risco de spam/ban se abusar — manter a mensagem única, cordial e só no fluxo revendedor. Sem envios em massa.
- **Link da planilha continua interno** — só no grupo, nunca pro cliente (regra existente, mantida).
- **Etiqueta `orcamento_enviado` continua proibida** pra IA (regra existente, mantida).

## 11. Relação com o trabalho existente

- Evolui `lib/quote-session.ts` + tabela `quote_sessions` (branch `feat/qualif-ciclo-cotacao`, não mergeada) para `lib/solicitacoes.ts` + `solicitacoes`. O plano de implementação decide se rebaseia em cima daquela branch ou reconstrói em `main` (a qualificação AOG/motor daquela branch é independente e pode subir junto ou separado).
- Reaproveita `splitItemsByQuote`, o `quoteContext` de `runAgent`, o padrão de `chatwoot-send.ts` e `saveMessage`.

## 12. Fora de escopo (YAGNI)

- UI de cadastro de consultores (é insert manual no banco por ora).
- Relatórios/dashboard de solicitações.
- Vídeo (explicitamente ignorado; outras mídias seguem o fluxo normal).
- Criar o card do Kanban **pelo código** (Parte 4 usa a automação de etiqueta→card já existente do Chatwoot; o código só garante que a etiqueta caia na conversa do cliente).
