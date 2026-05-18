# Fase 4 — Brand Redesign do Painel (Amazon Jet Aviation)

**Date:** 2026-05-18
**Status:** Aprovado
**Escopo:** Reestilizar o painel admin completo com a identidade visual da Amazon Jet Aviation — paleta navy/prata, tipografia Inter, logo inline, tema dark/light com toggle, look "premium aviação".

---

## 1. Objetivo

O painel atual usa o estilo padrão do shadcn/ui (genérico). Queremos um visual exclusivo alinhado à marca: navy profundo do logo, prata cromada, espaços generosos, tipografia editorial Inter, e gráficos com paleta coerente. Suporte a dark e light theme com toggle no header.

---

## 2. Paleta de cores

### Dark mode (principal)

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#0A0E1A` | Fundo geral |
| `--surface` | `#111729` | Cards |
| `--surface-2` | `#1A2238` | Cards elevados, hover, inputs |
| `--border` | `#2A3552` | Bordas |
| `--primary` | `#C9D1E3` | Logo, destaques metálicos |
| `--accent` | `#4F8DE3` | CTAs, links, gráficos primários |
| `--foreground` | `#E8ECF5` | Texto principal |
| `--muted` | `#8A94B0` | Texto secundário |
| `--success` | `#10B981` | IA ativo, leads ganhos |
| `--warning` | `#F59E0B` | Humano, aguardando |
| `--danger` | `#EF4444` | Leads perdidos, erros |

### Light mode

| Token | Valor |
|---|---|
| `--background` | `#F7F8FC` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#F1F4F9` |
| `--border` | `#E2E7F0` |
| `--primary` | `#0A2540` |
| `--accent` | `#1E5FCE` |
| `--foreground` | `#0A0E1A` |
| `--muted` | `#5C6479` |
| `--success/warning/danger` | mesmos do dark |

Valores são HEX para serem usados via CSS custom properties. Convertidos para HSL/RGB onde necessário pelos componentes shadcn.

---

## 3. Tipografia

**Família:** `Inter` carregada via `next/font/google` em `app/layout.tsx`. Self-hosted, zero CLS, fallback `system-ui, -apple-system, sans-serif`.

**Escala:**

| Uso | Tamanho | Peso | Outros |
|---|---|---|---|
| H1 (página) | 28px | 700 | — |
| H2 (card title) | 16px | 600 | — |
| H3 | 14px | 600 | — |
| KPI número | 36-40px | 700 | `tabular-nums` |
| Corpo | 14px | 400 | — |
| Label / muted | 12px | 500 | uppercase, tracking `0.05em` |

---

## 4. Logo e Header

### Logo asset

Recriado como **SVG inline** em `components/brand/logo-icon.tsx` para:
- Nitidez em qualquer tamanho
- Troca de cor automática via `currentColor` (combina com o tema)
- Zero dependência de arquivos externos

Aproximação fiel: círculo navy `#0A2540` (ou `#C9D1E3` no light), com wing estilizado prateado dentro (linhas horizontais geométricas que sobem da esquerda pra direita).

### Header `/dashboard/*`

```
┌──────────────────────────────────────────────────────────────────┐
│  [Logo] AMAZON JET    Análise · Contatos · OpenAI · Usuários    │
│                                       [☀️/🌙]  email   [Sair]    │
└──────────────────────────────────────────────────────────────────┘
```

- Esquerda: logo (32px) + wordmark "AMAZON JET" em uppercase, tracking `0.1em`, peso 600
- Centro: nav com links separados por `·`. Item ativo: underline `accent` 2px com `offset-2`
- Direita: theme toggle (ícone sun/moon, troca instant) + email do usuário (muted, 13px) + botão "Sair" outline pequeno
- Borda inferior: 1px `border`

### Auth pages `/login` e `/setup`

- Background com gradiente sutil: `radial-gradient(circle at top, #1A2238 0%, #0A0E1A 70%)` (dark) ou `linear-gradient(180deg, #FFFFFF, #F1F4F9)` (light)
- Card centralizado max-width 420px
- Logo 80px no topo do card, wordmark abaixo
- Form com inputs do novo estilo

---

## 5. Componentes (restilizados)

### Cards

- `background: surface`
- `border: 1px border`
- `border-radius: 12px`
- `padding: 24px`
- Sem box-shadow (limpo, plano)
- Hover (clicáveis): `border-color: accent`, leve transition

### KPI Cards

```
┌──────────────────────────────┐
│  CONTATOS NOVOS              │  ← uppercase 12px tracking
│                              │
│  142             ▲ 12%       │  ← 40px tabular-nums + delta
│                              │
└──────────────────────────────┘
```

Delta colorido: verde se >0, vermelho se <0, omitido se ==0.

### Badges

**Status (badge pill, padding-x 10px, padding-y 3px, radius full):**
- IA: `bg-success/15 text-success`
- Humano: `bg-warning/15 text-warning`
- Encerrado: `bg-muted/15 text-muted`

**Tags Chatwoot (chip retangular, radius 6px):**
- Default: `bg-accent/12 text-accent border border-accent/20`
- `lead_ganho`: `bg-success/12 text-success`
- `lead_perdido`: `bg-danger/12 text-danger`

### Botões

- **Primário:** `bg-accent text-white hover:brightness-110`, padding generoso (10px y, 16px x)
- **Outline:** `border-border text-foreground hover:bg-surface-2`
- **Ghost:** `text-foreground hover:bg-surface-2` (sem bg ou border)
- **Destrutivo:** `bg-danger text-white hover:brightness-110`
- Radius: 8px
- Transitions: 150ms

### Tabelas

- Header row: `bg-surface-2`, texto `text-muted uppercase tracking-wider text-xs`, padding y 12px
- Body rows: border-bottom `border/50`, padding y 14px
- Hover: `bg-surface-2`
- Densidade um pouco maior que atual

### Inputs / Selects / Textareas

- `bg-surface-2 border border-border`
- Focus: `ring-2 ring-accent ring-offset-2 ring-offset-background border-accent`
- Placeholder: `text-muted`
- Padding: 10px y, 14px x
- Radius: 8px

### Dialog (modal)

- Overlay: `bg-black/60 backdrop-blur-sm`
- Content: `bg-surface border-border`, radius 16px, padding 28px
- Anim: fade + scale 95→100 em 200ms

---

## 6. Paleta de gráficos (Recharts)

Cores ÚNICAS para todos os charts:

| Token | Valor | Uso |
|---|---|---|
| `chart-1` | `#4F8DE3` | Primária — azul aviação |
| `chart-2` | `#B8C5DA` | Secundária — prata cromada |
| `chart-3` | `#2DD4BF` | Positivo — turquesa |
| `chart-4` | `#F59E0B` | Atenção — âmbar |
| `chart-5` | `#F87171` | Negativo — coral |
| `chart-6` | `#A78BFA` | Terciário — violeta |

**Aplicações:**
- **Funil:** gradient linear `chart-1 → chart-3` (azul → turquesa, sensação de progressão)
- **Donut status:** IA=`chart-3`, Humano=`chart-4`, Encerrado=`chart-6`
- **Volume line:** Mensagens=`chart-1`, Novos contatos=`chart-2`
- **Tags bar:** `chart-1`
- **Inboxes bar:** `chart-6`

**Eixos e grid:**
- Grid: `border` com opacity 0.3
- Axis labels: `muted` 11px
- Tooltip: `bg-surface-2` + `border-border` + texto `foreground`

---

## 7. Theme toggle (dark/light)

**Biblioteca:** `next-themes` (gerencia preferência em cookie + system preference + zero flash)

**Implementação:**
- `ThemeProvider` envolvendo `app/layout.tsx`
- `components/brand/theme-toggle.tsx` — botão icon-only que alterna `theme: dark | light`
- `<html>` recebe `class="dark"` ou nada — Tailwind dark mode `class` (já configurado)
- Persistência automática

**Posição:** no header, à esquerda do email do usuário, ícone sun/moon (lucide-react: `Sun`, `Moon`), 20px.

---

## 8. Estrutura de arquivos

### Novos

```
components/brand/
├── logo-icon.tsx                 ← SVG inline do wing dentro do círculo
├── logo-full.tsx                 ← LogoIcon + wordmark "AMAZON JET"
└── theme-toggle.tsx              ← sun/moon toggle
```

### Modificados

```
tailwind.config.ts                ← novos tokens de cor + chart-* + Inter font
app/globals.css                   ← redefine :root e .dark com paleta completa
app/layout.tsx                    ← Inter via next/font + ThemeProvider
app/dashboard/layout.tsx          ← novo header com Logo + nav melhorada + toggle
app/(auth)/layout.tsx             ← bg gradient + logo grande
app/(auth)/login/page.tsx         ← card refinado
app/(auth)/setup/page.tsx         ← card refinado

components/analytics/
├── kpi-cards.tsx                 ← labels uppercase, números maiores, deltas estilizados
├── funnel-chart.tsx              ← cores nova paleta + gradient progressivo
├── status-donut.tsx              ← cores nova paleta
├── volume-chart.tsx              ← cores + grid sutil + tooltip estilizado
├── tag-distribution.tsx          ← cor accent
├── inbox-distribution.tsx        ← cor violeta
├── top-contacts.tsx              ← badges restilizadas
└── inbox-status.tsx              ← visual refinado

components/contacts-table.tsx     ← badges/tags com novo estilo
components/inbox-form.tsx         ← seções com headers melhores, inputs refinados
components/inbox-toggle.tsx       ← switch maior, animação suave
components/openai-form.tsx        ← layout mais aberto
components/users-manager.tsx      ← idem
components/summary-modal.tsx      ← modal premium
```

### Dependências novas

```
npm install next-themes
```

---

## 9. Critérios de aceitação

A Fase 4 está completa quando:

1. Fonte Inter carregada em todas as páginas
2. Paleta navy/prata aplicada via CSS vars no `app/globals.css` (dark e light)
3. Tailwind config tem tokens novos (incluindo `chart-1` a `chart-6`)
4. Logo SVG inline renderiza no header e em `/login` `/setup`
5. Theme toggle funciona, persiste, sem flash entre páginas
6. Header `/dashboard` redesenhado com nav melhorada
7. KPI cards com layout novo (label uppercase + número grande + delta)
8. Cards têm radius 12px, padding 24px, border 1px sem shadow
9. Tabelas, badges, botões, inputs restilizados conforme spec
10. Charts usam a nova paleta (chart-1..6)
11. Páginas `/login` e `/setup` com gradiente + logo grande
12. Build passa, todos os 44 testes continuam passando
13. Visualmente coerente entre dark e light

---

## 10. Fora do escopo

- **Animações complexas** (carrosséis, parallax, etc.) — só transições sutis (150-200ms hover/focus)
- **Página de marketing/landing externa**
- **Tema customizado por usuário no banco** — só preferência local via cookie
- **Acessibilidade AAA** (contraste AAA, leitor de tela exaustivo) — vamos no AA que a paleta já entrega
- **Internacionalização (i18n)** — textos seguem em português
- **Micro-interações de gráficos** (animação de barras, etc.) — Recharts já tem defaults bons, não customizar
- **Layouts mobile-first refinados** — funciona em mobile mas otimização polish fica pra depois
