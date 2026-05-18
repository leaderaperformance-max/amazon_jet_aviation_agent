# Fase 5 — Mídia + PN Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar processamento de áudio (Whisper), imagem (GPT-4o Vision), PDF (pdf-parse) e validador profissional de Part Number aeronáutico via tool do agente.

**Architecture:** Novo módulo `lib/media/` com download, transcribe, vision, pdf, process orchestrator. Validador `lib/part-number.ts` híbrido (regex + LLM). Webhook chama `processAttachment` antes do agente. Agente ganha tool `validate_part_number`. Zero armazenamento de binários.

**Tech Stack:** Next.js, TypeScript, OpenAI (Whisper, GPT-4o, GPT-4o-mini), pdf-parse, Vercel AI SDK, Vitest.

---

## File Map

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `lib/media/download.ts` | `downloadAttachment(url): Buffer` | Novo |
| `lib/media/transcribe.ts` | Whisper API → texto | Novo |
| `lib/media/vision.ts` | GPT-4o Vision → análise aeronáutica | Novo |
| `lib/media/pdf.ts` | pdf-parse → texto | Novo |
| `lib/media/process.ts` | Orquestrador (escolhe módulo por MIME) | Novo |
| `lib/part-number.ts` | `validatePartNumber(candidate)` regex + LLM | Novo |
| `lib/prompt.ts` | Seção 13 sobre validate_part_number | Modificar |
| `app/api/webhook/route.ts` | processAttachment + tool validate_part_number | Modificar |
| `tests/part-number.test.ts` | Testes do validador | Novo |
| `tests/media-process.test.ts` | Testes do orquestrador | Novo |
| `tests/webhook.test.ts` | Cenário com attachment | Modificar |
| `tests/agent.test.ts` | Mock da nova tool | Modificar |

---

## Task 1: Instalar pdf-parse

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm install pdf-parse
npm install -D @types/pdf-parse
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
npm test
```

44/44 tests, build clean.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install pdf-parse for PDF text extraction"
```

---

## Task 2: lib/media/download.ts (TDD)

**Files:** `lib/media/download.ts`, `tests/media-download.test.ts`

- [ ] **Step 1: Create `tests/media-download.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadAttachment } from '@/lib/media/download'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('downloadAttachment', () => {
  it('baixa o conteúdo e retorna Buffer', async () => {
    const fake = new Uint8Array([1, 2, 3, 4]).buffer
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fake),
      headers: new Headers({ 'content-length': '4' }),
    })

    const result = await downloadAttachment('https://chat.example.com/file.mp3')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBe(4)
    expect(fetchMock).toHaveBeenCalledWith('https://chat.example.com/file.mp3', expect.any(Object))
  })

  it('lança erro se response não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await expect(downloadAttachment('https://x.com/y')).rejects.toThrow('download failed: 404')
  })

  it('lança erro se arquivo > 10MB', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      headers: new Headers({ 'content-length': String(11 * 1024 * 1024) }),
    })
    await expect(downloadAttachment('https://x.com/big')).rejects.toThrow('file too large')
  })
})
```

- [ ] **Step 2: Run — must fail**

```bash
npm test tests/media-download.test.ts
```

- [ ] **Step 3: Create `lib/media/download.ts`**

```typescript
const MAX_BYTES = 10 * 1024 * 1024 // 10MB

export async function downloadAttachment(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`download failed: ${response.status}`)
    }
    const sizeHeader = response.headers.get('content-length')
    if (sizeHeader && parseInt(sizeHeader, 10) > MAX_BYTES) {
      throw new Error(`file too large: ${sizeHeader} bytes (max ${MAX_BYTES})`)
    }
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BYTES) {
      throw new Error(`file too large after download: ${arrayBuffer.byteLength}`)
    }
    return Buffer.from(arrayBuffer)
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 4: Run — must pass**

```bash
npm test tests/media-download.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/media/download.ts tests/media-download.test.ts
git commit -m "feat: add media download with size limit and timeout"
```

---

## Task 3: lib/media/transcribe.ts (Whisper) (TDD)

**Files:** `lib/media/transcribe.ts`, `tests/media-transcribe.test.ts`

- [ ] **Step 1: Create `tests/media-transcribe.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/inboxes', () => ({
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' }),
}))

import { transcribeAudio } from '@/lib/media/transcribe'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('transcribeAudio', () => {
  it('chama Whisper e retorna o texto', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Boa tarde, preciso de uma peça' }),
    })

    const buffer = Buffer.from([1, 2, 3])
    const result = await transcribeAudio(buffer, 'audio/ogg')

    expect(result).toBe('Boa tarde, preciso de uma peça')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      })
    )
  })

  it('lança erro se Whisper retorna não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') })
    await expect(transcribeAudio(Buffer.from([1]), 'audio/ogg')).rejects.toThrow('transcription failed')
  })
})
```

- [ ] **Step 2: Run — must fail**

```bash
npm test tests/media-transcribe.test.ts
```

- [ ] **Step 3: Create `lib/media/transcribe.ts`**

```typescript
import { loadOpenAIConfig } from '@/lib/inboxes'

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const cfg = await loadOpenAIConfig()

  const form = new FormData()
  const ext = mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('wav') ? 'wav'
    : 'ogg'
  // Wrap buffer in Blob with arrayBuffer view
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  form.append('file', new Blob([arrayBuffer], { type: mimeType }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(`transcription failed: ${response.status} ${errBody}`)
  }

  const data = await response.json() as { text: string }
  return data.text
}
```

- [ ] **Step 4: Run — must pass**

```bash
npm test tests/media-transcribe.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/media/transcribe.ts tests/media-transcribe.test.ts
git commit -m "feat: add Whisper audio transcription with pt language"
```

---

## Task 4: lib/media/vision.ts (GPT-4o) (TDD)

**Files:** `lib/media/vision.ts`, `tests/media-vision.test.ts`

- [ ] **Step 1: Create `tests/media-vision.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))
vi.mock('@/lib/inboxes', () => ({
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' }),
}))

import { analyzeImage } from '@/lib/media/vision'
import { generateText } from 'ai'

const mockGenerate = generateText as ReturnType<typeof vi.fn>

describe('analyzeImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama generateText com modelo gpt-4o e imagem em base64', async () => {
    mockGenerate.mockResolvedValue({ text: '• Etiqueta: PN MS21266-2N\n• Fabricante: AN/MS/NAS' })

    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]) // bytes JPEG válidos
    const result = await analyzeImage(buffer, 'image/jpeg')

    expect(result).toBe('• Etiqueta: PN MS21266-2N\n• Fabricante: AN/MS/NAS')
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mocked-gpt-4o',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'image' }),
            ]),
          }),
        ]),
      })
    )
  })
})
```

- [ ] **Step 2: Run — must fail**

```bash
npm test tests/media-vision.test.ts
```

- [ ] **Step 3: Create `lib/media/vision.ts`**

```typescript
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadOpenAIConfig } from '@/lib/inboxes'

const VISION_PROMPT = `Você é um analista visual da Amazon Jet Aviation, especializado em peças aeronáuticas. Analise a imagem e descreva EXCLUSIVAMENTE o que é relevante para atendimento de peças.

CATEGORIAS:
1. ETIQUETA/PLAQUETA de peça → extraia: Part Number, Serial Number, CAGE code, fabricante, Form 8130 / EASA Form 1 se visível, condição (NEW/OVERHAUL/SERVICEABLE/EXCHANGE)
2. FOTO DE PEÇA → identifique tipo, condição visual, dano visível, modelo
3. NOTA FISCAL / INVOICE → número, fornecedor, data, lista de PNs + quantidades
4. FORM 8130-3 / EASA FORM 1 → autoridade (FAA/EASA/ANAC), PN, S/N, condição
5. MANUAL TÉCNICO / IPC PAGE → seção, fig, PN destacado
6. CARTÃO/DOCUMENTO PESSOAL → diga "Imagem não-aeronáutica (documento pessoal)"
7. OUTRA → diga "Imagem não-aeronáutica" e descreva brevemente

REGRAS:
- Português Brasil
- Bullets curtos (•), dados primeiro
- Máximo 8 linhas
- Preserve EXATAMENTE como visto: hífens, barras
- Se múltiplos PNs, liste todos
- Se ilegível, diga "ilegível"
- Não invente`

export async function analyzeImage(buffer: Buffer, mimeType: string): Promise<string> {
  const cfg = await loadOpenAIConfig()
  const openai = createOpenAI({ apiKey: cfg.apiKey })

  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const { text } = await generateText({
    model: openai('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_PROMPT },
          { type: 'image', image: dataUrl },
        ],
      },
    ],
  })

  return text
}
```

- [ ] **Step 4: Run — must pass**

```bash
npm test tests/media-vision.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/media/vision.ts tests/media-vision.test.ts
git commit -m "feat: add GPT-4o Vision image analysis with aviation prompt"
```

---

## Task 5: lib/media/pdf.ts (TDD)

**Files:** `lib/media/pdf.ts`, `tests/media-pdf.test.ts`

- [ ] **Step 1: Create `tests/media-pdf.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

import { extractPdfText } from '@/lib/media/pdf'
import pdfParse from 'pdf-parse'

const mockPdfParse = pdfParse as unknown as ReturnType<typeof vi.fn>

describe('extractPdfText', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extrai texto de PDF', async () => {
    mockPdfParse.mockResolvedValue({ text: 'Texto do PDF aqui', numpages: 2 })
    const result = await extractPdfText(Buffer.from([0x25, 0x50, 0x44, 0x46]))
    expect(result).toEqual({ text: 'Texto do PDF aqui', numPages: 2 })
  })

  it('trunca texto longo em 8000 caracteres', async () => {
    const longText = 'a'.repeat(10000)
    mockPdfParse.mockResolvedValue({ text: longText, numpages: 1 })
    const result = await extractPdfText(Buffer.from([0x25]))
    expect(result.text.length).toBe(8000)
  })

  it('lança PdfScannedError se texto extraído < 50 chars', async () => {
    mockPdfParse.mockResolvedValue({ text: '  ', numpages: 1 })
    await expect(extractPdfText(Buffer.from([0x25]))).rejects.toThrow('PDF parece escaneado')
  })
})
```

- [ ] **Step 2: Run — must fail**

```bash
npm test tests/media-pdf.test.ts
```

- [ ] **Step 3: Create `lib/media/pdf.ts`**

```typescript
import pdfParse from 'pdf-parse'

const MAX_CHARS = 8000

export interface PdfResult {
  text: string
  numPages: number
}

export async function extractPdfText(buffer: Buffer): Promise<PdfResult> {
  const result = await pdfParse(buffer)
  const text = (result.text ?? '').trim()

  if (text.length < 50) {
    throw new Error('PDF parece escaneado (sem texto extraível)')
  }

  return {
    text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
    numPages: result.numpages ?? 1,
  }
}
```

- [ ] **Step 4: Run — must pass**

```bash
npm test tests/media-pdf.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/media/pdf.ts tests/media-pdf.test.ts
git commit -m "feat: add PDF text extraction with truncation and scanned detection"
```

---

## Task 6: lib/media/process.ts (orquestrador) (TDD)

**Files:** `lib/media/process.ts`, `tests/media-process.test.ts`

- [ ] **Step 1: Create `tests/media-process.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/media/download', () => ({ downloadAttachment: vi.fn() }))
vi.mock('@/lib/media/transcribe', () => ({ transcribeAudio: vi.fn() }))
vi.mock('@/lib/media/vision', () => ({ analyzeImage: vi.fn() }))
vi.mock('@/lib/media/pdf', () => ({ extractPdfText: vi.fn() }))

import { processAttachment } from '@/lib/media/process'
import { downloadAttachment } from '@/lib/media/download'
import { transcribeAudio } from '@/lib/media/transcribe'
import { analyzeImage } from '@/lib/media/vision'
import { extractPdfText } from '@/lib/media/pdf'

const mockDownload = downloadAttachment as ReturnType<typeof vi.fn>
const mockTranscribe = transcribeAudio as ReturnType<typeof vi.fn>
const mockAnalyze = analyzeImage as ReturnType<typeof vi.fn>
const mockExtract = extractPdfText as ReturnType<typeof vi.fn>

describe('processAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownload.mockResolvedValue(Buffer.from([1, 2, 3]))
  })

  it('transcribe áudio e retorna [ÁUDIO TRANSCRITO]:', async () => {
    mockTranscribe.mockResolvedValue('Boa tarde')
    const result = await processAttachment({
      data_url: 'https://x.com/audio.ogg',
      content_type: 'audio/ogg',
      file_type: 'audio',
    })
    expect(result).toBe('[ÁUDIO TRANSCRITO]: Boa tarde')
  })

  it('analyzeImage e retorna [IMAGEM ENVIADA — análise]:', async () => {
    mockAnalyze.mockResolvedValue('• PN MS21266-2N')
    const result = await processAttachment({
      data_url: 'https://x.com/foto.jpg',
      content_type: 'image/jpeg',
      file_type: 'image',
    })
    expect(result).toBe('[IMAGEM ENVIADA — análise]: • PN MS21266-2N')
  })

  it('extractPdfText e retorna [DOCUMENTO PDF]:', async () => {
    mockExtract.mockResolvedValue({ text: 'spec da peça', numPages: 3 })
    const result = await processAttachment({
      data_url: 'https://x.com/doc.pdf',
      content_type: 'application/pdf',
      file_type: 'file',
      extension: 'pdf',
    })
    expect(result).toContain('[DOCUMENTO PDF')
    expect(result).toContain('3pg')
    expect(result).toContain('spec da peça')
  })

  it('retorna null pra tipo não suportado', async () => {
    const result = await processAttachment({
      data_url: 'https://x.com/sheet.xlsx',
      content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_type: 'file',
    })
    expect(result).toBeNull()
  })

  it('retorna null se download falha', async () => {
    mockDownload.mockRejectedValue(new Error('boom'))
    const result = await processAttachment({
      data_url: 'https://x.com/fail.ogg',
      content_type: 'audio/ogg',
      file_type: 'audio',
    })
    expect(result).toBeNull()
  })

  it('retorna fallback amigável se PDF escaneado', async () => {
    mockExtract.mockRejectedValue(new Error('PDF parece escaneado'))
    const result = await processAttachment({
      data_url: 'https://x.com/scan.pdf',
      content_type: 'application/pdf',
      file_type: 'file',
    })
    expect(result).toContain('escaneado')
    expect(result).toContain('foto das páginas')
  })
})
```

- [ ] **Step 2: Run — must fail**

```bash
npm test tests/media-process.test.ts
```

- [ ] **Step 3: Create `lib/media/process.ts`**

```typescript
import { downloadAttachment } from '@/lib/media/download'
import { transcribeAudio } from '@/lib/media/transcribe'
import { analyzeImage } from '@/lib/media/vision'
import { extractPdfText } from '@/lib/media/pdf'

export interface ChatwootAttachment {
  data_url?: string
  extension?: string
  content_type?: string
  file_type?: string  // 'audio' | 'image' | 'file'
  file_size?: number
}

function isAudio(att: ChatwootAttachment): boolean {
  if (att.file_type === 'audio') return true
  if (att.content_type?.startsWith('audio/')) return true
  return false
}

function isImage(att: ChatwootAttachment): boolean {
  if (att.file_type === 'image') return true
  if (att.content_type?.startsWith('image/')) return true
  return false
}

function isPdf(att: ChatwootAttachment): boolean {
  if (att.content_type === 'application/pdf') return true
  if (att.extension?.toLowerCase() === 'pdf') return true
  return false
}

function filename(att: ChatwootAttachment): string {
  if (!att.data_url) return 'arquivo'
  try {
    const url = new URL(att.data_url)
    const last = url.pathname.split('/').filter(Boolean).pop() ?? 'arquivo'
    return decodeURIComponent(last).slice(0, 60)
  } catch {
    return 'arquivo'
  }
}

export async function processAttachment(att: ChatwootAttachment): Promise<string | null> {
  if (!att.data_url) return null

  try {
    if (isAudio(att)) {
      const buf = await downloadAttachment(att.data_url)
      const text = await transcribeAudio(buf, att.content_type ?? 'audio/ogg')
      return `[ÁUDIO TRANSCRITO]: ${text}`
    }

    if (isImage(att)) {
      const buf = await downloadAttachment(att.data_url)
      const analysis = await analyzeImage(buf, att.content_type ?? 'image/jpeg')
      return `[IMAGEM ENVIADA — análise]: ${analysis}`
    }

    if (isPdf(att)) {
      const buf = await downloadAttachment(att.data_url)
      try {
        const { text, numPages } = await extractPdfText(buf)
        return `[DOCUMENTO PDF — ${filename(att)}, ${numPages}pg]: ${text}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('escaneado')) {
          return `[DOCUMENTO PDF — ${filename(att)}]: O PDF parece estar escaneado e não foi possível extrair texto. Por favor, tire foto das páginas e mande como imagem.`
        }
        throw err
      }
    }

    console.warn(`[media] unsupported attachment type: ${att.content_type} / ${att.extension}`)
    return null
  } catch (err) {
    console.warn('[media] processing error:', err)
    return null
  }
}
```

- [ ] **Step 4: Run — must pass (6/6)**

```bash
npm test tests/media-process.test.ts
```

- [ ] **Step 5: Run ALL tests**

```bash
npm test
```

44 (anteriores) + 3 (download) + 2 (transcribe) + 1 (vision) + 3 (pdf) + 6 (process) = 59 total esperado.

- [ ] **Step 6: Commit**

```bash
git add lib/media/process.ts tests/media-process.test.ts
git commit -m "feat: add media orchestrator (audio/image/pdf routing)"
```

---

## Task 7: lib/part-number.ts (TDD)

**Files:** `lib/part-number.ts`, `tests/part-number.test.ts`

- [ ] **Step 1: Create `tests/part-number.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (model: string) => `mocked-${model}`),
}))
vi.mock('@/lib/inboxes', () => ({
  loadOpenAIConfig: vi.fn().mockResolvedValue({ apiKey: 'sk-test', model: 'gpt-4o-mini' }),
}))

import { validatePartNumber } from '@/lib/part-number'
import { generateText } from 'ai'

const mockGenerate = generateText as ReturnType<typeof vi.fn>

describe('validatePartNumber', () => {
  beforeEach(() => vi.clearAllMocks())

  it('regex MIL-SPEC MS retorna valid high confidence', async () => {
    const result = await validatePartNumber('MS21266-2N')
    expect(result.valid).toBe(true)
    expect(result.format).toContain('MIL-SPEC MS')
    expect(result.confidence).toBe('high')
    expect(result.normalized).toBe('MS21266-2N')
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('regex MIL-SPEC AN retorna valid', async () => {
    const result = await validatePartNumber('an3-5a')
    expect(result.valid).toBe(true)
    expect(result.format).toContain('MIL-SPEC AN')
    expect(result.normalized).toBe('AN3-5A')
  })

  it('regex NSN retorna valid', async () => {
    const result = await validatePartNumber('5306-00-123-4567')
    expect(result.valid).toBe(true)
    expect(result.format).toBe('NSN')
  })

  it('regex Garmin retorna valid', async () => {
    const result = await validatePartNumber('010-00696-01')
    expect(result.valid).toBe(true)
    expect(result.format).toBe('Garmin')
  })

  it('texto sem dígitos retorna invalid sem chamar LLM', async () => {
    const result = await validatePartNumber('olá tudo bem')
    expect(result.valid).toBe(false)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('texto muito curto retorna invalid sem chamar LLM', async () => {
    const result = await validatePartNumber('A1')
    expect(result.valid).toBe(false)
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('fallback LLM quando regex não bate', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        valid: true, format: 'Honeywell', manufacturer: 'Honeywell',
        confidence: 'medium', normalized: 'BCFA1-100-1',
        reason: 'Formato compatível Honeywell',
      }),
    })

    const result = await validatePartNumber('bcfa1-100-1')
    expect(result.valid).toBe(true)
    expect(result.format).toBe('Honeywell')
    expect(mockGenerate).toHaveBeenCalledOnce()
  })

  it('LLM retorna invalid pra texto genérico', async () => {
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        valid: false, format: 'Invalid', manufacturer: null,
        confidence: 'high', normalized: 'UMA-PECA-QUALQUER',
        reason: 'Texto genérico sem padrão de PN',
      }),
    })

    const result = await validatePartNumber('uma-peca-qualquer1')
    expect(result.valid).toBe(false)
  })

  it('LLM com JSON malformado retorna invalid low confidence', async () => {
    mockGenerate.mockResolvedValue({ text: 'this is not json' })
    const result = await validatePartNumber('xyz-987')
    expect(result.valid).toBe(false)
    expect(result.confidence).toBe('low')
  })
})
```

- [ ] **Step 2: Run — must fail**

```bash
npm test tests/part-number.test.ts
```

- [ ] **Step 3: Create `lib/part-number.ts`**

```typescript
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { loadOpenAIConfig } from '@/lib/inboxes'

export interface ValidationResult {
  valid: boolean
  format: string
  manufacturer: string | null
  confidence: 'high' | 'medium' | 'low'
  normalized: string
  reason: string
}

interface Pattern {
  regex: RegExp
  format: string
  manufacturer: string | null
}

const PATTERNS: Pattern[] = [
  { regex: /^AN\d+[A-Z0-9-]*$/, format: 'MIL-SPEC AN', manufacturer: 'AN/MS/NAS' },
  { regex: /^MS\d+[A-Z0-9-]*$/, format: 'MIL-SPEC MS', manufacturer: 'AN/MS/NAS' },
  { regex: /^NAS\d+[A-Z0-9-]*$/, format: 'MIL-SPEC NAS', manufacturer: 'AN/MS/NAS' },
  { regex: /^M\d{4,}\/\d+-\d+$/, format: 'MIL-SPEC M-series', manufacturer: 'MIL' },
  { regex: /^\d{4}-\d{2}-\d{3}-\d{4}$/, format: 'NSN', manufacturer: 'NATO' },
  { regex: /^010-\d{5}-\d{2}$/, format: 'Garmin', manufacturer: 'Garmin' },
  { regex: /^S?\d{4}-\d+(-\d+)?$/, format: 'Cessna', manufacturer: 'Cessna' },
]

const VALIDATOR_PROMPT = `Você é um especialista em Part Numbers aeronáuticos com conhecimento profundo de:
- MIL-SPEC (AN, MS, NAS, M-series)
- NATO Stock Number (NSN - 13 dígitos com hífens)
- ATA SPEC2000
- Fabricantes: Cessna, Piper, Beechcraft, Embraer, Garmin, Honeywell, Collins, Pratt & Whitney, Lycoming, Continental, Textron, Bell, Sikorsky
- Convenções de Form 8130-3 e EASA Form 1

Avalie se o texto é um Part Number aeronáutico legítimo ou texto genérico/inválido.

Responda APENAS JSON, sem markdown:
{"valid": boolean, "format": string, "manufacturer": string|null, "confidence": "high"|"medium"|"low", "normalized": string, "reason": string}

REGRAS:
- valid:true só se plausível como PN real
- "preciso de uma peça"/"olá" → invalid
- "MS21266-2N" → valid, high, MIL-SPEC MS
- "ABC123" → valid, medium, Generic
- normalized: uppercase, trim, hífens consistentes`

function normalize(candidate: string): string {
  return candidate.trim().toUpperCase().replace(/\s+/g, '')
}

export async function validatePartNumber(candidate: string): Promise<ValidationResult> {
  const normalized = normalize(candidate)

  // Step 1: regex
  for (const p of PATTERNS) {
    if (p.regex.test(normalized)) {
      return {
        valid: true,
        format: p.format,
        manufacturer: p.manufacturer,
        confidence: 'high',
        normalized,
        reason: `Match regex padrão ${p.format}`,
      }
    }
  }

  // Step 2: short-circuit
  const hasDigit = /\d/.test(normalized)
  if (normalized.length < 3 || !hasDigit) {
    return {
      valid: false,
      format: 'Invalid',
      manufacturer: null,
      confidence: 'high',
      normalized,
      reason: 'Texto muito curto ou sem dígitos',
    }
  }

  // Step 3: LLM
  try {
    const cfg = await loadOpenAIConfig()
    const openai = createOpenAI({ apiKey: cfg.apiKey })
    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: VALIDATOR_PROMPT,
      prompt: candidate,
    })

    const parsed = JSON.parse(text) as Partial<ValidationResult>
    return {
      valid: Boolean(parsed.valid),
      format: parsed.format ?? 'Other',
      manufacturer: parsed.manufacturer ?? null,
      confidence: (parsed.confidence as ValidationResult['confidence']) ?? 'low',
      normalized: parsed.normalized ?? normalized,
      reason: parsed.reason ?? 'LLM validation',
    }
  } catch (err) {
    console.warn('[part-number] LLM validation failed:', err)
    return {
      valid: false,
      format: 'Unknown',
      manufacturer: null,
      confidence: 'low',
      normalized,
      reason: 'Falha ao validar via LLM',
    }
  }
}
```

- [ ] **Step 4: Run — must pass (9/9)**

```bash
npm test tests/part-number.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/part-number.ts tests/part-number.test.ts
git commit -m "feat: add aviation part number validator (regex + LLM)"
```

---

## Task 8: Adicionar seção 13 ao DEFAULT_JET_PROMPT

**Files:** `lib/prompt.ts`

- [ ] **Step 1: Localizar `DEFAULT_JET_PROMPT` em `lib/prompt.ts`**

Encontrar a string final `A data atual é \${CURRENT_DATE}.` e adicionar uma nova seção LOGO ANTES dela.

A seção 12 (sobre ETIQUETAS) já existe. A 13 é nova.

### Step 2: Inserir o bloco da seção 13 logo antes da linha "A data atual é..."

Inserir:

```
\n---\n\n## 13. VALIDAÇÃO DE PART NUMBER (obrigatório)\n\nQuando o cliente fornecer o que parece ser um Part Number, OBRIGATORIAMENTE chame \`validate_part_number\` com o texto recebido ANTES de prosseguir.\n\n- Se \`valid: true\` (qualquer confidence) → siga o fluxo (use add_label('aguardando_pn') se ainda não tem; depois add_label('pendente_orcamento') quando apropriado)\n- Se \`valid: false\` → responda educadamente pedindo o PN real:\n  "Esse não parece o Part Number da peça. Ele costuma vir na etiqueta (ex: MS21266-2N, 010-00696-01). Pode confirmar?"\n\nUse o \`normalized\` retornado pela tool nas suas mensagens (formato limpo).\n\nSe o cliente mandou áudio/imagem/PDF, o texto já vem prefixado com [ÁUDIO TRANSCRITO]:, [IMAGEM ENVIADA — análise]: ou [DOCUMENTO PDF]:. Trate esses prefixos com naturalidade — se a imagem revelar um PN, extraia esse PN e chame \`validate_part_number\`.\n
```

NOTA: pra inserir esse bloco no template literal, escapar os backticks como `\\\`` e os `${}` como `\\${...}`. Atenção redobrada porque o template tem várias coisas escapadas. Abrir o arquivo, ler com cuidado, e inserir literalmente o conteúdo (sem o "\n\n" no final). Depois rodar `npx tsc --noEmit` pra confirmar syntax.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npx tsc --noEmit
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

44 anteriores + novos da fase = ~60 esperado, ainda passando.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts
git commit -m "feat: add JET prompt section 13 on validate_part_number tool usage"
```

---

## Task 9: Refatorar webhook (attachment + tool validate_part_number)

**Files:** `app/api/webhook/route.ts`, `tests/webhook.test.ts`

- [ ] **Step 1: Update `tests/webhook.test.ts`** — adicionar mock e cenário com attachment

Adicionar no topo dos mocks:

```typescript
vi.mock('@/lib/media/process', () => ({
  processAttachment: vi.fn(),
}))
vi.mock('@/lib/part-number', () => ({
  validatePartNumber: vi.fn(),
}))
```

Importar `processAttachment` e adicionar 1 teste novo:

```typescript
import { processAttachment } from '@/lib/media/process'
const mockProcessAttachment = processAttachment as ReturnType<typeof vi.fn>

it('processa attachment e usa o conteúdo enriquecido', async () => {
  mockProcessAttachment.mockResolvedValue('[ÁUDIO TRANSCRITO]: oi preciso de uma peça')

  const payload = {
    ...incomingFromContact,
    messages: [{
      ...incomingFromContact.messages[0],
      content: null,
      attachments: [{
        data_url: 'https://chat.example.com/audio.ogg',
        content_type: 'audio/ogg',
        file_type: 'audio',
      }],
    }],
  }

  const res = await POST(makeRequest(payload))
  expect(res.status).toBe(200)
  expect(mockProcessAttachment).toHaveBeenCalled()
  expect(mockRunAgent).toHaveBeenCalledWith(
    expect.any(String),
    '[ÁUDIO TRANSCRITO]: oi preciso de uma peça',
    expect.any(String),
    expect.any(String),
    expect.any(String),
    expect.any(Object),
    expect.any(Array),
  )
})
```

- [ ] **Step 2: Update `app/api/webhook/route.ts`** — adicionar processAttachment + tool

Localizar onde `message.content` é checado (`if (!message || !message.content)` etc.) e refatorar.

Substituir a parte do skip/content building:

```typescript
  // Before: if (!message || !message.content) return ok()
  // After:
  if (!message) {
    console.warn(`[webhook] SKIP: no message`)
    return NextResponse.json({ ok: true })
  }
```

Logo APÓS o bloco de upsertContact + saveMessage (mas antes da decisão de responder), processar attachments:

```typescript
  // Process attachments (audio, image, pdf) — enriches content
  const attachments = (message as unknown as { attachments?: ChatwootAttachment[] }).attachments ?? []
  let enrichedContent = message.content ?? ''

  for (const att of attachments) {
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

  if (!enrichedContent.trim()) {
    console.warn(`[webhook] SKIP: no usable content (text or attachment)`)
    return NextResponse.json({ ok: true })
  }
```

Trocar todos os usos de `message.content` (após esse bloco) por `enrichedContent`.

E adicionar a nova tool no objeto `tools`:

```typescript
import { processAttachment, type ChatwootAttachment } from '@/lib/media/process'
import { validatePartNumber } from '@/lib/part-number'

// ... dentro do POST, após declarar tools com add_label, remove_label:
const tools = {
  add_label: tool({ /* já existe */ }),
  remove_label: tool({ /* já existe */ }),
  validate_part_number: tool({
    description: 'Valida se o texto é um Part Number aeronáutico legítimo. ' +
                 'Cobre MIL-SPEC (AN/MS/NAS/M-series), NSN, ATA e fabricantes ' +
                 '(Cessna, Garmin, Beechcraft, Piper, Honeywell, etc.). ' +
                 'Retorna formato, fabricante, confidence e PN normalizado.',
    inputSchema: z.object({
      candidate: z.string().describe('O texto fornecido pelo cliente, possível PN'),
    }),
    execute: async ({ candidate }: { candidate: string }) => {
      const result = await validatePartNumber(candidate)
      console.log(`[validate_pn] "${candidate}" → valid=${result.valid} format=${result.format}`)
      return result
    },
  }),
}
```

E quando chama `runAgent`, passar `enrichedContent` em vez de `message.content`:

```typescript
const reply = await runAgent(
  sessionId,
  enrichedContent,
  inbox.system_prompt,
  openai.apiKey,
  openai.model,
  tools,
  labelsState
)
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Todos devem passar.

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/route.ts tests/webhook.test.ts
git commit -m "feat: webhook processes attachments + agent gets validate_part_number tool"
```

---

## Task 10: Atualizar `tests/agent.test.ts` se necessário

**Files:** `tests/agent.test.ts`

- [ ] **Step 1: Conferir se algum teste se quebra**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm test tests/agent.test.ts
```

Se passar, pular pra próxima task. Se falhar, ajustar mocks.

Provavelmente nada quebra porque a assinatura de `runAgent` não mudou. As tools são opacas (`Record<string, unknown>`).

- [ ] **Step 2: Se algum teste quebrou, ajustar e:**

```bash
npm test
git add tests/agent.test.ts
git commit -m "test: align agent tests with new tools"
```

(Step opcional — provavelmente não roda)

---

## Task 11: Build final + Deploy

- [ ] **Step 1: Tudo passa**

```bash
cd /Users/victorhugosantanaalmeida/amazon-jet-aviation-agent
npm test
npm run build
```

Esperado: ~60 testes passando + build limpo.

- [ ] **Step 2: Push**

```bash
git push "https://leaderaperformance-max:<GITHUB_PAT>@github.com/leaderaperformance-max/amazon_jet_aviation_agent.git" main
```

- [ ] **Step 3: Deploy Vercel**

```bash
vercel --prod --yes
```

- [ ] **Step 4: Smoke test**

```bash
curl -s -o /dev/null -w "HTTP %{http_code} /api/webhook\n" -X POST https://amazon-jet-aviation-agent.vercel.app/api/webhook -H "Content-Type: application/json" -d '{}'
```

Esperado: 200.

- [ ] **Step 5: Teste end-to-end (manual)**

No WhatsApp da inbox:
- Mandar áudio "preciso de uma peça MS21266 dois N, AOG" → bot transcreve e responde
- Mandar foto de etiqueta com PN → bot extrai e valida
- Mandar PDF de specs → bot extrai texto
- Mandar "uma peça qualquer" como PN → bot rejeita
- Mandar `MS21266-2N` → bot aceita instantaneamente (regex)

- [ ] **Step 6: Commit final**

```bash
git commit --allow-empty -m "feat: phase 5 (media + PN validator) complete"
git push origin main
```

---

## Self-Review

### Cobertura do spec

| Requisito do spec | Task |
|---|---|
| `lib/media/download.ts` | Task 2 |
| `lib/media/transcribe.ts` (Whisper) | Task 3 |
| `lib/media/vision.ts` (GPT-4o) | Task 4 |
| `lib/media/pdf.ts` (pdf-parse) | Task 5 |
| `lib/media/process.ts` orchestrator | Task 6 |
| `lib/part-number.ts` regex + LLM | Task 7 |
| Seção 13 do prompt JET | Task 8 |
| Webhook com processAttachment + tool | Task 9 |
| Build + deploy | Task 11 |

### Consistência de tipos

- `ChatwootAttachment` definido em Task 6 (`lib/media/process.ts`), reusado em Task 9 ✓
- `ValidationResult` definido em Task 7, retornado pela tool em Task 9 ✓
- `runAgent(...labelsState)` assinatura inalterada — só adicionamos uma tool ✓
- `processAttachment` retorna `string | null`, consumido em Task 9 ✓

### Placeholder scan

Todos os steps têm código completo. Sem TBDs.
