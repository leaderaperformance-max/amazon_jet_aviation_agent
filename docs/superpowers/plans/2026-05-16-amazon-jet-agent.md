# Amazon Jet Aviation Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um agente de atendimento JET em Next.js/Vercel que recebe webhooks do Chatwoot, processa mensagens com GPT-4o-mini e responde via Chatwoot API.

**Architecture:** Webhook POST `/api/webhook` recebe evento Chatwoot, filtra mensagens outgoing, carrega histórico do Supabase, chama OpenAI com o system prompt do JET, salva resposta e envia de volta via Chatwoot API.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Vercel AI SDK (`ai` + `@ai-sdk/openai`), Supabase JS SDK, Vitest para testes.

---

## File Map

| Arquivo | Responsabilidade |
|---------|-----------------|
| `app/api/webhook/route.ts` | Endpoint POST — parse, filtra, orquestra |
| `lib/types.ts` | Tipos TypeScript para payload Chatwoot |
| `lib/supabase.ts` | Singleton do client Supabase |
| `lib/memory.ts` | Ler e salvar histórico de conversa |
| `lib/chatwoot.ts` | Enviar mensagem via Chatwoot API |
| `lib/prompt.ts` | System prompt do agente JET |
| `lib/agent.ts` | Lógica principal: histórico + OpenAI + resposta |
| `tests/memory.test.ts` | Testes unitários da memória |
| `tests/chatwoot.test.ts` | Testes unitários do client Chatwoot |
| `tests/agent.test.ts` | Testes unitários do agente |
| `tests/webhook.test.ts` | Testes de integração do endpoint |

---

## Task 1: Scaffolding do Projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Criar projeto Next.js**

No diretório `/Users/victorhugosantanaalmeida/amazon-jet-aviation-agent`, executar:

```bash
npx create-next-app@14 . --typescript --app --no-src-dir --no-tailwind --eslint --import-alias "@/*"
```

Responder as perguntas interativas: aceitar defaults (sem Tailwind, com ESLint, com App Router).

- [ ] **Step 2: Instalar dependências**

```bash
npm install ai @ai-sdk/openai @supabase/supabase-js
npm install -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

- [ ] **Step 3: Configurar Vitest**

Criar `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 4: Adicionar script de teste ao package.json**

Abrir `package.json` e adicionar em `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Criar .gitignore com .env.local**

Verificar que `.gitignore` contém `.env.local`. Se não contiver, adicionar a linha:

```
.env.local
```

- [ ] **Step 6: Criar .env.example**

Criar `.env.example`:

```
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
CHATWOOT_BASE_URL=
CHATWOOT_USER_TOKEN=
CHATWOOT_ACCOUNT_ID=
```

- [ ] **Step 7: Criar .env.local com credenciais reais**

Criar `.env.local`:

```
OPENAI_API_KEY=<OPENAI_API_KEY>
SUPABASE_URL=https://oncfstviluxmzenfuyot.supabase.co
SUPABASE_SERVICE_KEY=<SUPABASE_SERVICE_KEY>
CHATWOOT_BASE_URL=https://chat.leaderaperformance.com.br
CHATWOOT_USER_TOKEN=<CHATWOOT_USER_TOKEN>
CHATWOOT_ACCOUNT_ID=14
```

- [ ] **Step 8: Commit inicial**

```bash
git init
git add . --ignore-errors
git commit -m "feat: scaffold Next.js project with Vitest"
```

---

## Task 2: Tipos TypeScript

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Criar lib/types.ts**

```typescript
export interface ChatwootSender {
  id: number
  identifier: string
  name: string
  phone_number: string | null
  type: 'contact' | 'user'
}

export interface ChatwootMessage {
  id: number
  content: string | null
  message_type: number // 0 = incoming, 1 = outgoing
  sender_type: 'Contact' | 'User'
  sender: ChatwootSender
}

export interface ChatwootWebhookBody {
  id: number
  messages: ChatwootMessage[]
  meta: {
    sender: ChatwootSender
  }
  event: string
}

export interface ChatwootWebhookPayload {
  body: ChatwootWebhookBody
}

export interface MemoryMessage {
  role: 'user' | 'assistant'
  content: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add Chatwoot webhook TypeScript types"
```

---

## Task 3: Supabase Client

**Files:**
- Create: `lib/supabase.ts`

- [ ] **Step 1: Criar lib/supabase.ts**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat: add Supabase singleton client"
```

---

## Task 4: Migração da Tabela no Supabase

**Files:**
- Nenhum arquivo local — executar SQL no Supabase Dashboard

A tabela `memory_chat_amazon_jet` pode já existir no Supabase (criada pelo n8n). Este passo verifica e cria se necessário.

- [ ] **Step 1: Verificar se a tabela existe**

Acessar o Supabase Dashboard em `https://oncfstviluxmzenfuyot.supabase.co`, ir em **Table Editor** e verificar se `memory_chat_amazon_jet` existe.

- [ ] **Step 2: Se não existir — executar no SQL Editor do Supabase**

```sql
CREATE TABLE IF NOT EXISTS memory_chat_amazon_jet (
  id        BIGSERIAL PRIMARY KEY,
  session_id TEXT      NOT NULL,
  role      TEXT      NOT NULL CHECK (role IN ('user', 'assistant')),
  content   TEXT      NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_session
  ON memory_chat_amazon_jet (session_id, created_at);
```

- [ ] **Step 3: Se a tabela JÁ existir — verificar o schema**

Executar no SQL Editor:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'memory_chat_amazon_jet'
ORDER BY ordinal_position;
```

Se o schema for diferente do acima (ex: coluna `message` JSONB do n8n LangChain), anotar as diferenças — o `lib/memory.ts` precisará ser adaptado no Task 5 para ler/escrever no formato correto.

---

## Task 5: Memory Module

**Files:**
- Create: `lib/memory.ts`
- Create: `tests/memory.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `tests/memory.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { loadHistory, saveMessage } from '@/lib/memory'
import { supabase } from '@/lib/supabase'

const mockFrom = supabase.from as ReturnType<typeof vi.fn>

describe('loadHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna histórico formatado como CoreMessage[]', async () => {
    const rows = [
      { role: 'user', content: 'olá' },
      { role: 'assistant', content: 'Olá! Aqui é o Jet.' },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
          }),
        }),
      }),
    })

    const result = await loadHistory('5511999999999@s.whatsapp.net')
    expect(result).toEqual([
      { role: 'user', content: 'olá' },
      { role: 'assistant', content: 'Olá! Aqui é o Jet.' },
    ])
  })

  it('retorna array vazio quando não há histórico', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    })

    const result = await loadHistory('novo@s.whatsapp.net')
    expect(result).toEqual([])
  })
})

describe('saveMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('insere mensagem do usuário no Supabase', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert: insertMock })

    await saveMessage('5511999999999@s.whatsapp.net', 'user', 'preciso de uma peça')

    expect(insertMock).toHaveBeenCalledWith({
      session_id: '5511999999999@s.whatsapp.net',
      role: 'user',
      content: 'preciso de uma peça',
    })
  })

  it('insere resposta do assistente no Supabase', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    mockFrom.mockReturnValue({ insert: insertMock })

    await saveMessage('5511999999999@s.whatsapp.net', 'assistant', 'Me envia o Part Number.')

    expect(insertMock).toHaveBeenCalledWith({
      session_id: '5511999999999@s.whatsapp.net',
      role: 'assistant',
      content: 'Me envia o Part Number.',
    })
  })
})
```

- [ ] **Step 2: Rodar o teste — deve falhar**

```bash
npm test tests/memory.test.ts
```

Esperado: erro `Cannot find module '@/lib/memory'`

- [ ] **Step 3: Implementar lib/memory.ts**

```typescript
import { supabase } from '@/lib/supabase'
import type { MemoryMessage } from '@/lib/types'

const TABLE = 'memory_chat_amazon_jet'
const WINDOW = 25

export async function loadHistory(sessionId: string): Promise<MemoryMessage[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(WINDOW)

  if (error || !data) return []
  return (data as MemoryMessage[]).reverse()
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await supabase.from(TABLE).insert({ session_id: sessionId, role, content })
}
```

- [ ] **Step 4: Rodar o teste — deve passar**

```bash
npm test tests/memory.test.ts
```

Esperado: `2 tests passed`

- [ ] **Step 5: Commit**

```bash
git add lib/memory.ts tests/memory.test.ts
git commit -m "feat: add memory module with Supabase read/write"
```

---

## Task 6: Chatwoot Client

**Files:**
- Create: `lib/chatwoot.ts`
- Create: `tests/chatwoot.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `tests/chatwoot.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendMessage } from '@/lib/chatwoot'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

describe('sendMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('faz POST para a API do Chatwoot com o conteúdo correto', async () => {
    fetchMock.mockResolvedValue({ ok: true })

    process.env.CHATWOOT_BASE_URL = 'https://chat.example.com'
    process.env.CHATWOOT_USER_TOKEN = 'test-token'
    process.env.CHATWOOT_ACCOUNT_ID = '14'

    await sendMessage(42, 'Olá, aqui é o Jet.')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/api/v1/accounts/14/conversations/42/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': 'test-token',
        },
        body: JSON.stringify({
          content: 'Olá, aqui é o Jet.',
          message_type: 'outgoing',
          private: false,
        }),
      }
    )
  })

  it('não lança erro mesmo se o Chatwoot retornar erro HTTP', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await expect(sendMessage(42, 'teste')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar o teste — deve falhar**

```bash
npm test tests/chatwoot.test.ts
```

Esperado: erro `Cannot find module '@/lib/chatwoot'`

- [ ] **Step 3: Implementar lib/chatwoot.ts**

```typescript
export async function sendMessage(conversationId: number, content: string): Promise<void> {
  const base = process.env.CHATWOOT_BASE_URL
  const token = process.env.CHATWOOT_USER_TOKEN
  const accountId = process.env.CHATWOOT_ACCOUNT_ID

  const url = `${base}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': token!,
    },
    body: JSON.stringify({
      content,
      message_type: 'outgoing',
      private: false,
    }),
  })
}
```

- [ ] **Step 4: Rodar o teste — deve passar**

```bash
npm test tests/chatwoot.test.ts
```

Esperado: `2 tests passed`

- [ ] **Step 5: Commit**

```bash
git add lib/chatwoot.ts tests/chatwoot.test.ts
git commit -m "feat: add Chatwoot API client"
```

---

## Task 7: System Prompt

**Files:**
- Create: `lib/prompt.ts`

- [ ] **Step 1: Criar lib/prompt.ts**

```typescript
export function getSystemPrompt(): string {
  const now = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })

  return `# SYSTEM PROMPT — JET (Amazon Jet Aviation)

Você é o **Jet**, assistente virtual oficial da **Amazon Jet Aviation Corp** (Miami, FL — EIN 39-3382928), empresa especializada em fornecimento e importação de peças aeronáuticas dos EUA para o Brasil e América Latina.

Sua missão é **qualificar leads no menor número de mensagens possível** e proteger o tempo da equipe comercial. WhatsApp é canal direto — seja ágil, objetivo, sem rodeios.

---

## 1. IDENTIDADE E TOM

**Tom:** profissional, direto e ágil. Trate o cliente sempre por **"você"**, com respeito e objetividade. Linguagem clara, técnica quando necessário. Mensagens curtas — ideal de 1 a 3 linhas. Evite parágrafos longos no WhatsApp.

**Vocabulário OBRIGATÓRIO** (use naturalmente quando fizer sentido):
- "operação", "sua operação"
- "aeronavegabilidade"
- "peça certificada"
- "agilidade"
- "solução completa"
- "parceiro logístico"

**Vocabulário PROIBIDO** (nunca use):
- "barato", "produto" (use "peça"), "não sei", "talvez"
- gírias, excesso de emojis, informalidade exagerada
- frases prolixas tipo "Fico feliz com o seu interesse", "Para que eu possa te direcionar da melhor forma"

**Idioma:** detecte automaticamente o idioma do cliente e responda no mesmo (PT-BR, EN, ES). Se o cliente alternar, alterne junto.

---

## 2. SOBRE A EMPRESA

- **Sede:** 777 Brickell Ave 521, Miami, FL 33131, United States
- **Site:** www.amazonjetaviation.com
- **Email:** commercial@amazonjetaviation.com
- **WhatsApp:** +1 (954) 778-4501
- **Horário comercial:** Seg–Sex 08h–18h (Brasília), Sáb 08h–13h (Brasília)

**Missão:** Conectar operadores aeronáuticos ao mercado global de peças com eficiência, segurança e certificação, eliminando barreiras operacionais e reduzindo o tempo de aeronaves em solo.

**Posicionamento central (NUNCA esqueça):** A Amazon Jet Aviation não vende peças — entrega **segurança, continuidade operacional e confiança**.

**Diferenciais (use quando o cliente perguntar "por que vocês?"):**
- AOG Desk 24/7 — atendimento ininterrupto para emergências
- Parceiro logístico ponta a ponta (aquisição EUA → entrega no hangar)
- Parcelamento de peças importadas (sujeito a análise de cadastro)
- Rede global de fornecedores e distribuidores homologados
- 99% de satisfação declarada
- Trabalhamos apenas com peças certificadas (FAA, ANAC e demais autoridades)

**Fabricantes parceiros:** Cessna, Piper, Beechcraft, Textron, Lycoming, Continental, Pratt & Whitney, Garmin.

---

## 3. PÚBLICO-ALVO

**Atende:** pilotos privados, operadores aeronáuticos, escolas de aviação, MROs/oficinas de manutenção, donos de aeronaves, gestores de manutenção, táxi aéreo.

**NÃO atende (redirecione educadamente):**
- Curiosos sem aeronave
- Solicitações de peças automotivas
- Compradores sem capacidade financeira ou intenção real de compra
- Consultas genéricas sem contexto operacional

**Sinais de curioso (não comprador real):**
- Pergunta "quanto custa um avião?" — quem opera no setor já sabe a faixa
- Não fornece PN mesmo após solicitado
- Pergunta valor da peça sem nenhum dado técnico

Se identificar perfil fora do público-alvo, responda com cordialidade explicando que o foco da empresa é aviação e encerre sem desperdiçar follow-up.

---

## 4. SERVIÇOS

### 4.1 Fornecimento de Peças Aeronáuticas
- Aeronaves: aviação geral e executiva (aviões e helicópteros)
- Condições: NEW, OVERHAULED, SERVICEABLE, EXCHANGE
- Sourcing via rede global de fornecedores homologados

### 4.2 Importação Facilitada USA → Brasil
- Invoice internacional, export compliance, logística internacional, desembaraço aduaneiro, entrega no destino
- Frete e impostos: podem ser incluídos na cotação ou pagos pelo cliente

### 4.3 Parcelamento de Peças
- **Sujeito a análise cadastral e aprovação de crédito**
- Condição inicial após aprovação:
  - Parcela 1: entrada (no ato)
  - Parcela 2: 30 dias
  - Parcela 3: 60 dias
- Mais parcelas conforme score do cliente
- Juros aplicáveis conforme operação

---

## 5. FLUXO DE QUALIFICAÇÃO (CRÍTICO — SIGA À RISCA)

A lógica é simples: **filtrar curiosos rapidamente e encaminhar leads qualificados para a equipe comercial**. Antes da cotação, NÃO peça cadastro completo.

### 5.1 Sequência obrigatória

**Passo 1 — Abertura (apenas no primeiro contato)**
Saudação curta + pergunta de urgência na mesma mensagem:
> "Olá! Aqui é o Jet, da Amazon Jet Aviation. Qual é a urgência para o recebimento da peça?"

⚠️ **NUNCA pergunte "é AOG?" diretamente.** Quem é do meio aeronáutico responde "AOG" sozinho — quem é curioso responde vago. A pergunta aberta é o filtro.

**Passo 2 — Classificar a urgência**
- Se resposta mencionar **"AOG", "aeronave parada", "em solo", "emergência"** → vá direto para o **Fluxo AOG (seção 7)**.
- Caso contrário → trate como **rotina** e siga para o passo 3.

**Passo 3 — Pedir PN + quantidade (barreira de qualificação)**
> "Para agilizar sua cotação, me envie o Part Number da peça e a quantidade."

**Passo 4 — Informar que os dados foram recebidos**
Assim que tiver **PN + quantidade + urgência** confirmados, responda:
> "Recebi os dados. Nosso especialista vai te retornar com a cotação em até 48h úteis. Qualquer urgência adicional, me avisa por aqui."

⚠️ **NUNCA invente valores, NUNCA prometa preço.**

**Passo 5 — Cadastro APENAS após interesse real**
Coleta de dados cadastrais acontece somente quando o lead receber a cotação e disser que quer fechar.

### 5.2 O que NÃO fazer no fluxo
- ❌ Não pergunte modelo da aeronave, matrícula, serial number antes do PN
- ❌ Não pergunte destino de entrega, condição (NEW/OVH/etc) antes da cotação ser aceita
- ❌ Não despeje questionário — uma pergunta por vez
- ❌ Não confirme dados que já foram dados — use-os com fluidez
- ❌ Não agradeça a cada resposta

---

## 6. PRAZOS E COTAÇÃO

- **Resposta da cotação:** 4h a 48h úteis
- **Entrega no Brasil (rotina):** 10 a 20 dias após aprovação e pagamento
- **Entrega AOG:** 5 a 10 dias
- O agente **NUNCA informa preços**. Sempre cotar caso a caso.

**Formas de pagamento aceitas:**
- Wire Transfer (equivalente a TED no Brasil)
- ACH
- Zelle (similar ao PIX)
- Cartão internacional
- Parcelamento (após aprovação de cadastro)

---

## 7. FLUXO AOG (PRIORIDADE MÁXIMA)

Se a resposta de urgência mencionar **"AOG", "aeronave parada", "em solo", "emergência"** ou similar:

**Passo 1 — Reconheça imediatamente:**
> "Entendi, AOG. Vamos priorizar agora."

**Passo 2 — Colete só o essencial (rápido):**
- Part Number
- Quantidade
- Localização atual da aeronave (cidade/estado)

**Passo 3 — Sinalize transferência imediata:**
> "Dados enviados. Nosso especialista do AOG Desk vai te contatar agora. Um momento."

⚠️ Em AOG, **NÃO** pergunte condição da peça, modelo da aeronave, dados cadastrais ou qualquer coisa além do essencial.

---

## 8. ESCALAÇÃO PARA HUMANO

Transfira imediatamente quando:
- Cliente pedir explicitamente
- AOG / emergência (escala 24/7)
- Cotação foi enviada e o lead quer fechar
- Cotação complexa (múltiplos PNs, peças raras)
- Reclamação ou cliente insatisfeito

**Mensagem padrão de transferência:**
> "Vou conectar você com um especialista agora. Um momento."

---

## 9. TÓPICOS PROIBIDOS

- Questões jurídicas ou contratuais
- Valores de contratos específicos não documentados
- Informações confidenciais de outros clientes
- Regulações ITAR / peças de uso militar
- Comparações depreciativas com concorrentes
- **Valores de peças** — nunca invente

Se não souber algo: "Vou verificar com nosso especialista e retorno com a resposta correta."

---

## 10. FAQ — RESPOSTAS PRONTAS

**P: Vendem peças para qualquer aeronave?**
R: Sim. Trabalhamos com toda a aviação geral — peças novas, revisadas, servíveis e exchange. Me envia o PN da peça que precisa e a quantidade que já agilizo.

**P: Como funciona o processo de importação?**
R: Nós cuidamos de tudo. Você nos envia o Part Number, localizamos a peça nos EUA, enviamos cotação e, após aprovação, gerenciamos envio e documentação até a entrega na sua operação.

**P: As peças têm certificação FAA / ANAC?**
R: Sim. Trabalhamos apenas com peças certificadas e de procedência garantida, com toda a documentação exigida.

**P: Vocês fazem parcelamento?**
R: Sim. Oferecemos condições facilitadas de parcelamento. As condições são definidas após análise cadastral.

**P: Qual o prazo de entrega?**
R: Varia conforme peça e destino. Após aprovação da cotação, informamos o prazo exato. Em AOG, priorizamos com o menor tempo possível.

**P: O que é AOG?**
R: AOG (Aircraft on Ground) é aeronave parada em solo por falta de peça. É nossa máxima prioridade — temos AOG Desk 24/7.

**P: Quanto custa essa peça?**
R: Os valores são sempre cotados caso a caso. Me envia o Part Number e a quantidade que agilizo sua cotação.

---

## 11. COMPORTAMENTO GERAL

- **Mensagens curtas.** WhatsApp é bate-pronto. 1 a 3 linhas é o ideal.
- **Uma pergunta por vez.** Nunca despeje questionário.
- **Não confirme dados que já foram dados.** Use-os com fluidez.
- **Não agradeça a cada resposta.**
- **Saudação inteligente:** bom dia (00h–11h59), boa tarde (12h–17h59), boa noite (18h–23h59) — fuso de Brasília.
- **Fora do horário comercial:** informe horário de retorno, colete PN + quantidade + urgência e prometa retorno. Para AOG, quebre essa regra e escale na hora.

A data atual é ${now}.`
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/prompt.ts
git commit -m "feat: add JET system prompt"
```

---

## Task 8: Agent Module

**Files:**
- Create: `lib/agent.ts`
- Create: `tests/agent.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `tests/agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

vi.mock('@/lib/memory', () => ({
  loadHistory: vi.fn(),
  saveMessage: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mocked-model'),
}))

import { runAgent } from '@/lib/agent'
import { generateText } from 'ai'
import { loadHistory, saveMessage } from '@/lib/memory'

const mockGenerateText = generateText as ReturnType<typeof vi.fn>
const mockLoadHistory = loadHistory as ReturnType<typeof vi.fn>
const mockSaveMessage = saveMessage as ReturnType<typeof vi.fn>

describe('runAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('carrega histórico, chama OpenAI e salva resposta', async () => {
    mockLoadHistory.mockResolvedValue([
      { role: 'user', content: 'olá' },
      { role: 'assistant', content: 'Olá! Aqui é o Jet.' },
    ])
    mockGenerateText.mockResolvedValue({ text: 'Me envia o Part Number.' })

    const result = await runAgent('5511999999999@s.whatsapp.net', 'preciso de uma peça')

    expect(mockLoadHistory).toHaveBeenCalledWith('5511999999999@s.whatsapp.net')
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'user', content: 'olá' },
          { role: 'assistant', content: 'Olá! Aqui é o Jet.' },
          { role: 'user', content: 'preciso de uma peça' },
        ]),
      })
    )
    expect(mockSaveMessage).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net', 'user', 'preciso de uma peça'
    )
    expect(mockSaveMessage).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net', 'assistant', 'Me envia o Part Number.'
    )
    expect(result).toBe('Me envia o Part Number.')
  })
})
```

- [ ] **Step 2: Rodar o teste — deve falhar**

```bash
npm test tests/agent.test.ts
```

Esperado: erro `Cannot find module '@/lib/agent'`

- [ ] **Step 3: Implementar lib/agent.ts**

```typescript
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { loadHistory, saveMessage } from '@/lib/memory'
import { getSystemPrompt } from '@/lib/prompt'
import type { MemoryMessage } from '@/lib/types'

export async function runAgent(sessionId: string, userMessage: string): Promise<string> {
  const history: MemoryMessage[] = await loadHistory(sessionId)

  const messages: MemoryMessage[] = [
    ...history,
    { role: 'user', content: userMessage },
  ]

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: getSystemPrompt(),
    messages,
  })

  await saveMessage(sessionId, 'user', userMessage)
  await saveMessage(sessionId, 'assistant', text)

  return text
}
```

- [ ] **Step 4: Rodar o teste — deve passar**

```bash
npm test tests/agent.test.ts
```

Esperado: `1 test passed`

- [ ] **Step 5: Commit**

```bash
git add lib/agent.ts tests/agent.test.ts
git commit -m "feat: add agent module with OpenAI integration"
```

---

## Task 9: Webhook Endpoint

**Files:**
- Create: `app/api/webhook/route.ts`
- Create: `tests/webhook.test.ts`

- [ ] **Step 1: Escrever os testes com falha**

Criar `tests/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/agent', () => ({
  runAgent: vi.fn().mockResolvedValue('Resposta do JET.'),
}))

vi.mock('@/lib/chatwoot', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/webhook/route'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/chatwoot'

const mockRunAgent = runAgent as ReturnType<typeof vi.fn>
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validPayload = {
  body: {
    id: 13,
    messages: [{
      id: 1,
      content: 'preciso de uma peça',
      message_type: 0,
      sender_type: 'Contact',
      sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' },
    }],
    meta: {
      sender: { identifier: '5511999999999@s.whatsapp.net', name: 'João' },
    },
    event: 'automation_event.message_created',
  },
}

describe('POST /api/webhook', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ignora mensagens outgoing (message_type === 1) sem chamar o agente', async () => {
    const payload = {
      ...validPayload,
      body: {
        ...validPayload.body,
        messages: [{ ...validPayload.body.messages[0], message_type: 1 }],
      },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('ignora mensagens com content null', async () => {
    const payload = {
      ...validPayload,
      body: {
        ...validPayload.body,
        messages: [{ ...validPayload.body.messages[0], content: null }],
      },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('processa mensagem válida e envia resposta via Chatwoot', async () => {
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(200)
    expect(mockRunAgent).toHaveBeenCalledWith(
      '5511999999999@s.whatsapp.net',
      'preciso de uma peça'
    )
    expect(mockSendMessage).toHaveBeenCalledWith(13, 'Resposta do JET.')
  })
})
```

- [ ] **Step 2: Rodar os testes — devem falhar**

```bash
npm test tests/webhook.test.ts
```

Esperado: erro `Cannot find module '@/app/api/webhook/route'`

- [ ] **Step 3: Criar diretório e implementar o endpoint**

```bash
mkdir -p app/api/webhook
```

Criar `app/api/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/agent'
import { sendMessage } from '@/lib/chatwoot'
import type { ChatwootWebhookPayload } from '@/lib/types'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload: ChatwootWebhookPayload = await req.json()

  const message = payload.body?.messages?.[0]
  const conversationId = payload.body?.id
  const sessionId = payload.body?.meta?.sender?.identifier

  if (!message || message.message_type === 1 || !message.content) {
    return NextResponse.json({ ok: true })
  }

  const reply = await runAgent(sessionId, message.content)
  await sendMessage(conversationId, reply)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Rodar os testes — devem passar**

```bash
npm test tests/webhook.test.ts
```

Esperado: `3 tests passed`

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

Esperado: todos os testes passando.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhook/route.ts tests/webhook.test.ts
git commit -m "feat: add webhook endpoint with message filtering"
```

---

## Task 10: Limpar arquivos padrão do Next.js

**Files:**
- Modify: `app/page.tsx`
- Delete ou simplificar: `app/globals.css`, `app/layout.tsx`

O create-next-app gera uma página home com conteúdo de exemplo. Como este projeto é só uma API, simplificar.

- [ ] **Step 1: Simplificar app/page.tsx**

Substituir o conteúdo de `app/page.tsx` por:

```typescript
export default function Home() {
  return <main><p>Amazon Jet Aviation Agent API</p></main>
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "chore: simplify home page"
```

---

## Task 11: Deploy na Vercel

- [ ] **Step 1: Instalar Vercel CLI**

```bash
npm install -g vercel
```

- [ ] **Step 2: Login na Vercel**

```bash
vercel login
```

Seguir o fluxo de autenticação no browser.

- [ ] **Step 3: Fazer deploy inicial**

No diretório do projeto:

```bash
vercel
```

Responder as perguntas:
- "Set up and deploy?" → Y
- "Which scope?" → selecionar sua conta
- "Link to existing project?" → N
- "Project name?" → `amazon-jet-aviation-agent`
- "Directory?" → `./`
- "Override settings?" → N

Ao final, a Vercel retorna a URL de preview (ex: `https://amazon-jet-aviation-agent-xxx.vercel.app`).

- [ ] **Step 4: Adicionar variáveis de ambiente na Vercel**

```bash
vercel env add OPENAI_API_KEY
# colar a chave quando solicitado, selecionar: Production, Preview, Development

vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
vercel env add CHATWOOT_BASE_URL
vercel env add CHATWOOT_USER_TOKEN
vercel env add CHATWOOT_ACCOUNT_ID
```

- [ ] **Step 5: Deploy para produção**

```bash
vercel --prod
```

Ao final, retorna a URL de produção (ex: `https://amazon-jet-aviation-agent.vercel.app`).

- [ ] **Step 6: Testar o endpoint com curl**

```bash
curl -X POST https://amazon-jet-aviation-agent.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "id": 13,
      "messages": [{
        "id": 1,
        "content": "olá",
        "message_type": 0,
        "sender_type": "Contact",
        "sender": {"identifier": "5511999999999@s.whatsapp.net", "name": "Teste"}
      }],
      "meta": {
        "sender": {"identifier": "5511999999999@s.whatsapp.net", "name": "Teste"}
      },
      "event": "automation_event.message_created"
    }
  }'
```

Esperado: `{"ok":true}` e mensagem aparecendo no Chatwoot.

- [ ] **Step 7: Atualizar URL do webhook no Chatwoot**

No Chatwoot em `Settings > Inboxes > Amazon Jet Aviation - WPP > Configurações`, atualizar o campo **URL do Webhook** de `https://leaderaperformance.conector.top/webhook/from-chatwoot?...` para:

```
https://amazon-jet-aviation-agent.vercel.app/api/webhook
```

Clicar em **Atualizar**.

- [ ] **Step 8: Teste end-to-end**

Enviar uma mensagem no WhatsApp conectado à inbox e verificar se o JET responde no Chatwoot.

---

## Self-Review

### Cobertura do Spec

| Requisito do Spec | Task |
|------------------|------|
| Filtrar message_type === 1 | Task 9 |
| Filtrar content null | Task 9 |
| Carregar histórico Supabase (25 msgs) | Task 5 |
| System prompt JET completo | Task 7 |
| gpt-4o-mini | Task 8 |
| Salvar histórico no Supabase | Task 5 |
| Enviar resposta via Chatwoot API | Task 6 |
| Deploy na Vercel | Task 11 |
| Variáveis de ambiente | Task 1 |
| Migração da tabela Supabase | Task 4 |

### Consistência de tipos

- `MemoryMessage` definido em Task 2, usado em Task 5 e Task 8 ✓
- `ChatwootWebhookPayload` definido em Task 2, usado em Task 9 ✓
- `loadHistory` retorna `MemoryMessage[]`, consumido em Task 8 ✓
- `saveMessage(sessionId, role, content)` — assinatura consistente em Task 5 e Task 8 ✓
- `sendMessage(conversationId, content)` — assinatura consistente em Task 6 e Task 9 ✓
- `runAgent(sessionId, userMessage)` — assinatura consistente em Task 8 e Task 9 ✓
