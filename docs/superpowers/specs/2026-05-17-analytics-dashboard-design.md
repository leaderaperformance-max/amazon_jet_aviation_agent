# Fase 3 — Dashboard Analítico de Atendimento

**Date:** 2026-05-17
**Status:** Aprovado
**Escopo:** Substituir a home do `/dashboard` por um dashboard analítico completo com KPIs, gráficos e tabelas — cobrindo volume, conversão e performance do agente IA.

---

## 1. Objetivo

Transformar a home do painel em uma visão executiva do atendimento. O usuário escolhe um intervalo de datas e vê: contagem de novos contatos, mensagens, leads ganhos/perdidos, taxa de conversão, % de conversas atendidas só pelo bot, tempo médio de resposta, funil de conversão, distribuição por status/tag/inbox, volume ao longo do tempo e top 10 contatos do período. O bloco antigo com lista de inboxes vai pro rodapé em formato compacto.

---

## 2. Arquitetura

**Onde fica:** `/dashboard` (substitui a home atual).

**Endpoint único:** `GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` retorna um JSON com todos os dados agregados em paralelo. O frontend renderiza tudo de uma vez. Cache HTTP de 60s.

**Dados:** apenas tabelas existentes — nenhuma migration nova.
- `contacts` (status, labels, datas, message_count)
- `memory_chat_amazon_jet` (mensagens com timestamps)
- `inboxes` (nomes para exibição e para o bloco de fundo)

**Charting:** shadcn/ui Chart (Recharts por baixo). Calendar + Popover (shadcn) para o seletor de datas.

---

## 3. KPI Cards

8 cards no topo, distribuídos em duas linhas de 4. Cada card tem: número grande, rótulo curto, e badge opcional de variação vs. período anterior (mesma duração).

### Linha 1 — Volume

| Card | Definição |
|---|---|
| **Contatos novos** | `count(contacts WHERE first_seen_at BETWEEN from AND to)` |
| **Mensagens recebidas** | `count(memory WHERE created_at BETWEEN from AND to AND role='user' AND content NOT LIKE '[atendente]:%')` |
| **Atendidos só pela IA** (%) | `% de session_ids no período sem mensagens [atendente]:` |
| **Tempo médio de resposta IA** (s) | Média de `(assistant.created_at - user.created_at)` para pares consecutivos no período |

### Linha 2 — Conversão

| Card | Definição |
|---|---|
| **Leads ganhos** | `count(contacts WHERE 'lead_ganho' = ANY(current_labels) AND first_seen_at BETWEEN from AND to)` |
| **Leads perdidos** | idem com `'lead_perdido'` |
| **Taxa de conversão** (%) | `ganhos / (ganhos + perdidos)` (ou `0` se denominador `0`) |
| **Em atendimento agora** | `count(contacts WHERE status IN ('ia','humano'))` — global, não filtrado por período |

**Variação:** computada chamando a mesma query com o intervalo deslocado `(from - delta, to - delta)` onde `delta = to - from`. Mostrada como badge `▲ 12%` (verde se >0) ou `▼ 5%` (vermelho se <0).

---

## 4. Gráficos

### 4.1 Funil de Conversão (lado esquerdo, primeira fila)

Barras horizontais empilhadas. Para contatos cujo `first_seen_at` está no período:

```
novo_lead          ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100
aguardando_pn      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     76  (76% do anterior)
pendente_orcamento ▓▓▓▓▓▓▓▓▓▓▓▓        52  (68%)
orcamento_enviado  ▓▓▓▓▓▓▓▓             38  (73%)
lead_ganho         ▓▓▓▓▓                24  (63%)
```

Cada barra mostra: rótulo, contagem absoluta, e (a partir do 2º) % de conversão em relação ao estágio anterior. Cores em gradiente verde→azul.

Cálculo: `count(contacts WHERE '<stage>' = ANY(current_labels) AND first_seen_at BETWEEN from AND to)` para cada estágio.

### 4.2 Distribuição por Status (lado direito, primeira fila)

Donut chart com 3 fatias (IA, Humano, Encerrado). Centro do donut: total. Hover: contagem + %. Filtra por `first_seen_at` no período.

### 4.3 Volume ao longo do tempo (full width, segunda fila)

Line chart com 2 séries sobrepostas:
- 🔵 Mensagens recebidas/dia
- 🟢 Novos contatos/dia

Granularidade automática: dia se período ≤90d, semana se >90d.

Query: `GROUP BY date_trunc('day', created_at|first_seen_at)`.

### 4.4 Distribuição por Tag (lado esquerdo, terceira fila)

Bar chart vertical. Eixo X: tags (`novo_lead`, `aguardando_pn`, `pendente_orcamento`, `orcamento_enviado`, `lead_ganho`, `lead_perdido`, `atendimento_ia`). Eixo Y: contagem de contatos com aquela tag (`first_seen_at` no período). Cor azul única.

### 4.5 Atendimento por Inbox (lado direito, terceira fila — condicional)

Bar chart com contagem de conversas no período por inbox. Renderiza **apenas se houver mais de uma inbox** configurada (`SELECT COUNT(*) FROM inboxes > 1`). Caso contrário, o slot some e a fila tem só o gráfico de tags.

---

## 5. Tabelas e blocos de fundo

### 5.1 Top 10 contatos do período

Tabela compacta dos 10 contatos com maior `message_count` cujo `last_message_at` está no período. Colunas:

| Coluna | Origem |
|---|---|
| Nome | `contacts.name` |
| Telefone | `contacts.phone_number` |
| Tags | badges de `current_labels` |
| Total msgs | `contacts.message_count` |
| Status | badge de `contacts.status` |
| Última interação | `formatRelative(last_message_at)` |

Clicar na linha → navega para `/dashboard/contacts?q=<phone_number>`.

### 5.2 Status das inboxes (rodapé compacto)

Preserva o que estava na home antiga em formato resumido. Uma linha por inbox configurada:

```
🟢 Amazon Jet Aviation - WPP    14/45    [Editar]
🔴 LeaderAPerformance            1/1     [Editar]

                                       [+ Nova Inbox]
```

Sem tabela complexa. Toggle de status à esquerda, link "Editar" leva pra `/dashboard/inboxes/[id]`. Botão "Nova Inbox" à direita.

---

## 6. Date Range Picker

No topo da página, à direita do título. Shadcn `Popover` + `Calendar` no modo `range`. Presets rápidos como atalhos:

- Hoje
- 7 dias
- 30 dias
- 90 dias
- Tudo (do início ao agora)

Default: últimos 30 dias.

Mudança de range → atualiza a query string `?from=...&to=...` → página recarrega (Next.js Server Component). Não há refetch via SWR/fetch no cliente — é um Server Component, simples.

---

## 7. API endpoint

```
GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Autenticado. Retorna:

```typescript
interface AnalyticsResponse {
  kpis: {
    newContacts: number
    receivedMessages: number
    aiOnlyPercent: number          // 0-1
    avgResponseTimeSec: number
    leadsWon: number
    leadsLost: number
    conversionRate: number         // 0-1
    activeNow: number
    deltas: {
      newContacts: number          // -1 a +N (variação fracionária)
      receivedMessages: number
      aiOnlyPercent: number
      avgResponseTimeSec: number
      leadsWon: number
      leadsLost: number
      conversionRate: number
    }
  }
  funnel: Array<{
    stage: string
    count: number
    conversionFromPrev: number | null  // null no primeiro estágio
  }>
  statusDistribution: {
    ia: number
    humano: number
    encerrado: number
  }
  volumeOverTime: Array<{
    date: string                    // 'YYYY-MM-DD'
    messages: number
    newContacts: number
  }>
  tagDistribution: Array<{
    tag: string
    count: number
  }>
  inboxDistribution: Array<{
    inbox_id: string
    name: string
    count: number
  }>
  topContacts: Array<{
    id: string
    name: string | null
    phone_number: string | null
    current_labels: string[]
    message_count: number
    status: 'ia' | 'humano' | 'encerrado'
    last_message_at: string | null
  }>
}
```

A `page.tsx` da home faz a chamada server-side direto (sem passar pelo HTTP/fetch) chamando a função `computeAnalytics(from, to)` de `lib/analytics.ts`. O endpoint REST existe pra futuras integrações (ex: app mobile, embed).

---

## 8. Estrutura de arquivos

```
lib/
└── analytics.ts                  ← computeAnalytics(from, to): AnalyticsResponse

app/
├── api/analytics/route.ts        ← GET endpoint (apenas wrapper auth + chamada)
└── dashboard/
    └── page.tsx                  ← REFATORADO (substitui home atual)

components/
├── analytics/
│   ├── date-range-picker.tsx     ← Popover + Calendar + presets
│   ├── kpi-cards.tsx             ← 8 cards
│   ├── funnel-chart.tsx          ← barras horizontais
│   ├── status-donut.tsx          ← donut chart
│   ├── volume-chart.tsx          ← line chart
│   ├── tag-distribution.tsx      ← bar chart
│   ├── inbox-distribution.tsx    ← bar chart (condicional)
│   ├── top-contacts.tsx          ← tabela top 10
│   └── inbox-status.tsx          ← bloco compacto rodapé
└── ui/                           ← + shadcn calendar, popover, chart

tests/
└── analytics.test.ts             ← testes da função computeAnalytics
```

---

## 9. Dependências novas

```bash
npx shadcn@latest add chart calendar popover
# recharts vem como peer dep do chart
```

---

## 10. Critérios de aceitação

A Fase 3 está completa quando:

1. Acessando `/dashboard` (já logado), o usuário vê o novo dashboard analítico.
2. Date range picker no topo, default últimos 30 dias, com presets (Hoje, 7d, 30d, 90d, Tudo).
3. Mudar a data atualiza todos os gráficos e cards.
4. 8 KPI cards mostram os números corretos para o período.
5. Cada card mostra a variação % em relação ao período anterior (mesma duração).
6. Funil de conversão renderiza com 5 estágios + % de conversão entre eles.
7. Donut de status mostra IA/Humano/Encerrado.
8. Line chart de volume mostra 2 séries (mensagens, novos contatos).
9. Bar chart de tags mostra as 7 tags (6 negócio + atendimento_ia).
10. Bar chart de inboxes aparece só se houver >1 inbox.
11. Tabela top 10 contatos mostra os mais ativos do período, clicáveis para `/dashboard/contacts?q=...`.
12. Bloco compacto de inboxes no rodapé com toggle e link de editar.
13. Build passa, todos os testes anteriores continuam passando + novos para `lib/analytics.ts`.

---

## 11. Fora do escopo (deixa pra Fase 4+)

- **Tempo médio em cada estágio do funil** — exige tabela de eventos `label_changes` que ainda não temos
- **Custo OpenAI / uso de tokens** — exige captura do retorno do `generateText` (input/output tokens) e persistência
- **Heatmap hora × dia da semana** — útil mas não essencial agora
- **Export CSV / PDF** — relatórios
- **Comparação entre períodos arbitrários** (não só "período anterior automático")
- **Dashboards por usuário/role** — todos veem o mesmo
- **Drill-down nos gráficos** — clicar numa barra do funil pra ver os contatos daquele estágio (interessante mas a tabela top contatos já cobre parte)
- **Tempo desde a primeira mensagem do contato até `lead_ganho`/`lead_perdido`** — exige timestamps de label change
