# Fase 5 — Mídia (áudio/imagem/PDF) + Validador de Part Number

**Date:** 2026-05-18
**Status:** Aprovado
**Escopo:** Adicionar processamento de áudio (Whisper), imagem (GPT-4o Vision), PDF (pdf-parse) e validador profissional de Part Number aeronáutico via tool do agente.

---

## 1. Objetivo

O bot hoje só responde mensagens de texto. Clientes do WhatsApp mandam áudios, fotos (etiqueta de peça, Form 8130, notas fiscais) e PDFs (specs, invoices). Vamos:

1. **Áudio:** transcrever via Whisper → feed pro agente
2. **Imagem:** analisar via GPT-4o Vision com prompt aeronáutico específico → extrair PNs, identificar tipo de documento
3. **PDF:** extrair texto via pdf-parse → feed pro agente
4. **Part Number:** validar PNs via tool híbrida (regex + GPT-4o) cobrindo padrões MIL-SPEC, NSN, ATA, e fabricantes principais

**Princípio chave:** zero armazenamento de binários. Tudo processado in-memory, só o texto resultante vai pro `memory_chat_amazon_jet`.

---

## 2. Arquitetura

```
Webhook recebe mensagem
    ↓
Tem attachment?
    ├─ Sim → processAttachment() in-memory
    │       ├─ Download via Chatwoot data_url
    │       ├─ Switch por MIME:
    │       │     audio/*  → Whisper API
    │       │     image/*  → GPT-4o Vision
    │       │     application/pdf → pdf-parse
    │       └─ Retorna string formatada
    │
    └─ Combine com message.content (se houver texto + mídia)
    ↓
runAgent(enrichedContent, ...) com tools:
    - add_label, remove_label (já existem)
    - validate_part_number (NOVO)
    ↓
Resposta enviada via QuePasa
```

**Zero persistência de binários.** O Buffer é descartado após processamento. Só o resultado em texto vai pra memória.

---

## 3. Módulo `lib/media/`

### 3.1 `download.ts`

```typescript
export async function downloadAttachment(dataUrl: string): Promise<Buffer>
```

- Faz `fetch(dataUrl)`, retorna `Buffer` do response body
- Chatwoot Active Storage URLs geralmente são públicos (assinados) — sem auth necessária
- Timeout 15s
- Limite 10MB (lança erro acima disso)

### 3.2 `transcribe.ts`

```typescript
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string>
```

- Monta `FormData` com `file` (Blob a partir do buffer), `model: 'whisper-1'`, `language: 'pt'`
- POST `https://api.openai.com/v1/audio/transcriptions` (Whisper API)
- Auth header com a OPENAI_API_KEY carregada via `loadOpenAIConfig()`
- Retorna `text`
- Erro → lança `MediaProcessError`

### 3.3 `vision.ts`

```typescript
export async function analyzeImage(buffer: Buffer, mimeType: string): Promise<string>
```

- Converte buffer pra base64 data URL: `data:${mimeType};base64,${b64}`
- Usa `generateText` do Vercel AI SDK com `openai('gpt-4o')` e `messages: [{ role: 'user', content: [{ type: 'text', text: SYSTEM_PROMPT }, { type: 'image', image: dataUrl }] }]`
- System prompt aeronáutico (ver Seção 4)
- Retorna o texto da análise (até ~500 tokens)

### 3.4 `pdf.ts`

```typescript
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; numPages: number }>
```

- Usa `pdf-parse` library
- Trunca em 8000 caracteres pra não inflar contexto
- Se `text.trim().length < 50` → considera PDF escaneado, retorna erro `PdfScannedError` (caller decide como tratar)

### 3.5 `process.ts` (orquestrador)

```typescript
interface ChatwootAttachment {
  data_url: string
  extension?: string
  content_type?: string
  file_type?: string  // 'audio' | 'image' | 'file'
  file_size?: number
}

export async function processAttachment(att: ChatwootAttachment): Promise<string | null>
```

- Lê `att.content_type` (MIME) e `att.extension`
- Decide rota: audio / image / pdf / unsupported
- Chama download → processador específico
- Retorna string formatada:
  - `[ÁUDIO TRANSCRITO]: ${text}`
  - `[IMAGEM ENVIADA — análise]: ${analysis}`
  - `[DOCUMENTO PDF — ${filename}, ${numPages}pg]: ${text}`
  - `null` se tipo não suportado ou falha (logado mas não throw — bot continua)

---

## 4. Prompts especializados

### 4.1 Prompt da Vision (`lib/media/vision.ts`)

```
Você é um analista visual da Amazon Jet Aviation, especializado em peças
aeronáuticas. Analise a imagem e descreva EXCLUSIVAMENTE o que é relevante
para atendimento de peças:

CATEGORIAS POSSÍVEIS:
1. ETIQUETA/PLAQUETA de peça → extraia: Part Number, Serial Number,
   CAGE code, fabricante (manufacturer), Form 8130 ou EASA Form 1 se visível,
   condição (NEW/OVERHAUL/SERVICEABLE/EXCHANGE), validade
2. FOTO DE PEÇA → identifique: tipo de peça (válvula, atuador, fuselagem, etc.),
   condição visual aparente, dano visível, modelo se identificável
3. NOTA FISCAL / INVOICE → número, fornecedor, data, lista de itens (PN + quantidade)
4. FORM 8130-3 / EASA FORM 1 → autoridade (FAA/EASA/ANAC), PN, S/N, condição,
   estado certificado
5. MANUAL TÉCNICO / IPC PAGE → seção, fig, PN da peça destacada
6. CARTÃO/DOCUMENTO PESSOAL → diga "Imagem não-aeronáutica (documento pessoal)"
7. OUTRA → diga "Imagem não-aeronáutica" e descreva brevemente

REGRAS:
- Português Brasil
- Bullets curtos (•), dados primeiro
- Máximo 8 linhas
- Se ler PN, escreva EXATAMENTE como visto na imagem (preserva hífens, barras)
- Se múltiplos PNs, liste todos
- Não invente dados — se não dá pra ler, diga "ilegível"
```

### 4.2 Prompt do Validador (`lib/part-number.ts`)

```
Você é um especialista em Part Numbers aeronáuticos com conhecimento profundo de:
- MIL-SPEC (AN, MS, NAS, M-series)
- NATO Stock Number (NSN - 13 dígitos com hífens)
- ATA SPEC2000
- Fabricantes: Cessna, Piper, Beechcraft, Embraer, Garmin, Honeywell, Collins,
  Pratt & Whitney, Lycoming, Continental, Textron, Bell, Sikorsky
- Convenções de Form 8130-3 e EASA Form 1

Avalie se o texto a seguir é um Part Number aeronáutico legítimo
ou texto genérico/inválido:

"<candidate>"

Responda APENAS JSON, sem markdown:
{
  "valid": boolean,
  "format": "MIL-SPEC AN" | "MIL-SPEC MS" | "MIL-SPEC NAS" | "NSN" |
            "Garmin" | "Cessna" | "Beechcraft" | "Piper" | "Generic alphanumeric" |
            "Other" | "Invalid",
  "manufacturer": string | null,
  "confidence": "high" | "medium" | "low",
  "normalized": string,
  "reason": string
}

REGRAS:
- valid:true só se plausível como PN real (não texto genérico)
- "preciso de uma peça" / "olá" → invalid
- "MS21266-2N" → valid, high, MIL-SPEC MS
- "ABC123" → valid, medium, Generic alphanumeric
- Aceitar variações de hífen/espaço
- normalized: uppercase, trim, hífens consistentes
```

---

## 5. Validador `lib/part-number.ts`

```typescript
interface ValidationResult {
  valid: boolean
  format: string
  manufacturer: string | null
  confidence: 'high' | 'medium' | 'low'
  normalized: string
  reason: string
}

export async function validatePartNumber(candidate: string): Promise<ValidationResult>
```

**Passo 1 — Normalização:**
```typescript
const normalized = candidate.trim().toUpperCase().replace(/\s+/g, '')
```

**Passo 2 — Regex rápido (free, sync):**

```typescript
const PATTERNS: Array<{ regex: RegExp; format: string; manufacturer: string | null }> = [
  // MIL-SPEC AN: AN3-5A, AN815-6
  { regex: /^AN\d+[A-Z0-9-]*$/, format: 'MIL-SPEC AN', manufacturer: 'AN/MS/NAS' },
  // MIL-SPEC MS: MS21266-2N, MS35338-44
  { regex: /^MS\d+[A-Z0-9-]*$/, format: 'MIL-SPEC MS', manufacturer: 'AN/MS/NAS' },
  // MIL-SPEC NAS: NAS1149-FN416P
  { regex: /^NAS\d+[A-Z0-9-]*$/, format: 'MIL-SPEC NAS', manufacturer: 'AN/MS/NAS' },
  // M-series: M83248/1-260
  { regex: /^M\d{4,}\/\d+-\d+$/, format: 'MIL-SPEC M-series', manufacturer: 'MIL' },
  // NSN: 5306-00-123-4567 (4-2-3-4 dígitos)
  { regex: /^\d{4}-\d{2}-\d{3}-\d{4}$/, format: 'NSN', manufacturer: 'NATO' },
  // Garmin: 010-00696-01
  { regex: /^010-\d{5}-\d{2}$/, format: 'Garmin', manufacturer: 'Garmin' },
  // Cessna: 0950-1234-01, S2056-1
  { regex: /^(S?\d{4}-\d+(-\d+)?)$/, format: 'Cessna', manufacturer: 'Cessna' },
]

for (const p of PATTERNS) {
  if (p.regex.test(normalized)) {
    return {
      valid: true, format: p.format, manufacturer: p.manufacturer,
      confidence: 'high', normalized,
      reason: `Match regex padrão ${p.format}`,
    }
  }
}
```

**Passo 3 — LLM fallback (gpt-4o):**

Se nenhum regex bate E `normalized.length >= 3` E tem pelo menos 1 dígito (caso contrário é prosa pura), manda pro LLM. Senão retorna `valid: false` direto.

```typescript
const hasDigit = /\d/.test(normalized)
if (normalized.length < 3 || !hasDigit) {
  return { valid: false, format: 'Invalid', manufacturer: null, confidence: 'high',
           normalized, reason: 'Texto muito curto ou sem dígitos' }
}

const { text } = await generateText({
  model: openai('gpt-4o'),
  system: PROMPT_VALIDATOR,
  prompt: candidate,
  // forçar JSON
})

return JSON.parse(text)
```

**Cache:** opcional/futuro — guardar em Supabase resultados de validação por hash do `candidate` pra evitar re-querying LLM.

---

## 6. Mudanças no webhook

`app/api/webhook/route.ts` ganha duas adições:

### 6.1 Processamento de attachments

Antes de chamar `runAgent`:

```typescript
const rawAttachments = message.attachments ?? []
let enrichedContent = message.content ?? ''

for (const att of rawAttachments) {
  try {
    const processed = await processAttachment(att)
    if (processed) {
      enrichedContent = enrichedContent
        ? `${enrichedContent}\n\n${processed}`
        : processed
    }
  } catch (err) {
    console.warn('[webhook] attachment processing error:', err)
  }
}

if (!enrichedContent) {
  console.warn('[webhook] SKIP: no usable content (text or attachment)')
  return NextResponse.json({ ok: true })
}
```

### 6.2 Nova tool `validate_part_number`

Adicionada ao objeto `tools` passado pro `runAgent`:

```typescript
import { validatePartNumber } from '@/lib/part-number'

const tools = {
  add_label: tool({...}),
  remove_label: tool({...}),
  validate_part_number: tool({
    description: 'Valida se o texto fornecido é um Part Number aeronáutico legítimo. ' +
                 'Cobre MIL-SPEC (AN/MS/NAS), NSN, ATA, e fabricantes principais ' +
                 '(Cessna, Garmin, Beechcraft, Piper, etc.). Retorna formato, ' +
                 'confidence e PN normalizado.',
    inputSchema: z.object({
      candidate: z.string().describe('O texto que o cliente forneceu, possível PN'),
    }),
    execute: async ({ candidate }) => {
      const result = await validatePartNumber(candidate)
      console.log(`[validate_pn] "${candidate}" → ${result.valid} (${result.format})`)
      return result
    },
  }),
}
```

---

## 7. Atualizações no system prompt do JET

Adicionar **Seção 13** ao `DEFAULT_JET_PROMPT`:

```
## 13. VALIDAÇÃO DE PART NUMBER (obrigatório)

Quando o cliente fornecer o que parece ser um Part Number, OBRIGATORIAMENTE
chame `validate_part_number` com o texto recebido ANTES de prosseguir.

- Se `valid: true` (qualquer confidence) → siga o fluxo
  (use `add_label('aguardando_pn')` se ainda não tem, depois pode
   adicionar `pendente_orcamento`)
- Se `valid: false` → responda educadamente pedindo o PN real:
  "Esse não parece o Part Number da peça. Ele costuma vir na etiqueta
  (ex: MS21266-2N, 010-00696-01). Pode confirmar?"

Use o `normalized` retornado pela tool nas suas mensagens (formato limpo).
Se o cliente mandou áudio/imagem/PDF, o texto já vem prefixado com
[ÁUDIO TRANSCRITO]:, [IMAGEM ENVIADA — análise]: ou [DOCUMENTO PDF]:.
Trate esses prefixos com naturalidade — se a imagem revelar um PN,
extraia esse PN e chame `validate_part_number`.
```

---

## 8. Estrutura de arquivos

### Novos

```
lib/media/
├── download.ts
├── transcribe.ts
├── vision.ts
├── pdf.ts
└── process.ts

lib/part-number.ts

tests/
├── part-number.test.ts
└── media-process.test.ts
```

### Modificados

```
lib/agent.ts                 ← (apenas tipo, sem mudança lógica)
lib/prompt.ts                ← adiciona seção 13
app/api/webhook/route.ts     ← processAttachment + validate_part_number tool
tests/webhook.test.ts        ← cenário com attachment (mock)
tests/agent.test.ts          ← mock da nova tool
```

### Dependências

```bash
npm install pdf-parse
npm install -D @types/pdf-parse
```

---

## 9. Tratamento de erros (filosofia)

- **Erro de download (rede, 404, timeout):** log warning, ignora attachment, segue com texto se houver
- **Erro de transcrição/vision/pdf:** log warning, retorna mensagem fallback ao cliente: "Recebi seu áudio/imagem/PDF mas não consegui processar — pode tentar mandar de outra forma ou descrever por texto?"
- **PDF escaneado (sem texto):** mensagem amigável "Esse PDF parece escaneado. Pode tirar foto das páginas e mandar como imagem?"
- **Attachment > 10MB:** ignora silenciosamente (WhatsApp já limita, raro)
- **Validador de PN falha (erro de rede LLM):** retorna `valid: false, confidence: 'low'` — bot pode pedir confirmação humana

---

## 10. Critérios de aceitação

1. Cliente manda áudio "preciso de uma peça MS21266 dois N AOG" → bot transcreve, identifica PN, valida, segue fluxo AOG.
2. Cliente manda foto de etiqueta com PN → bot extrai PN da imagem, valida, segue fluxo.
3. Cliente manda foto não-aeronáutica → bot responde educadamente que não consegue ajudar.
4. Cliente manda PDF de spec/invoice → bot extrai texto, identifica PNs se houver.
5. Cliente manda "uma peça qualquer" como PN → bot rejeita via `validate_part_number(valid:false)`, pede o PN real.
6. Cliente manda `MS21266-2N` → regex matcha, valida `high confidence`, segue fluxo.
7. Cliente manda PN obscuro tipo `BCFA1-100-1` (Honeywell) → LLM valida `medium confidence`, segue fluxo.
8. Todos os 44 testes existentes continuam passando + ~8 novos.
9. Build limpo, deploy OK.

---

## 11. Fora do escopo

- **OCR pra PDFs escaneados** (necessita poppler/canvas em serverless — complexo, fica pra fase futura)
- **Validação contra catálogo real** (Boeing IPC, Cessna Service Manual — todos pagos)
- **Vídeo** (não comum no fluxo de atendimento)
- **Múltiplas imagens em uma mensagem** (processa só a primeira; loga as outras)
- **Análise de áudio que não é fala** (sons de motor, etc.)
- **Cache de validações de PN** (pode ser fase futura se custo virar problema)
- **i18n** (continua em pt-BR)
