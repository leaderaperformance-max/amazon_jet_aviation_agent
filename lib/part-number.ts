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
  // MIL-SPEC family
  { regex: /^AN\d+[A-Z0-9-]*$/, format: 'MIL-SPEC AN', manufacturer: 'AN/MS/NAS' },
  { regex: /^MS\d+[A-Z0-9-]*$/, format: 'MIL-SPEC MS', manufacturer: 'AN/MS/NAS' },
  { regex: /^NAS\d+[A-Z0-9-]*$/, format: 'MIL-SPEC NAS', manufacturer: 'AN/MS/NAS' },
  { regex: /^M\d{4,}\/\d+-\d+$/, format: 'MIL-SPEC M-series', manufacturer: 'MIL' },

  // NSN
  { regex: /^\d{4}-\d{2}-\d{3}-\d{4}$/, format: 'NSN', manufacturer: 'NATO' },

  // Avionics
  { regex: /^010-\d{5}-\d{2}$/, format: 'Garmin', manufacturer: 'Garmin' },
  { regex: /^GTN-?\d{3,}[A-Z]*$/i, format: 'Garmin Avionics', manufacturer: 'Garmin' },
  { regex: /^GNS-?\d{3,}[A-Z]*$/i, format: 'Garmin Avionics', manufacturer: 'Garmin' },
  { regex: /^G\d{3,4}[A-Z]*$/i, format: 'Garmin Avionics', manufacturer: 'Garmin' },

  // Cessna
  { regex: /^S?\d{4}-\d+(-\d+)?$/, format: 'Cessna', manufacturer: 'Cessna' },

  // Headsets — Bose
  { regex: /^A?A?(20|30|XR)$/, format: 'Bose Headset', manufacturer: 'Bose' },
  { regex: /^BOSE\s?A?(20|30|XR)$/i, format: 'Bose Headset', manufacturer: 'Bose' },
  { regex: /^857641-\d+$/, format: 'Bose Headset', manufacturer: 'Bose' },

  // Headsets — Lightspeed
  { regex: /^(ZULU|SIERRA|TANGO|DELTA)\s?\d*$/i, format: 'Lightspeed Headset', manufacturer: 'Lightspeed' },

  // Headsets — David Clark
  { regex: /^H10-?\d+(\.\d+)?$/i, format: 'David Clark Headset', manufacturer: 'David Clark' },
  { regex: /^DC\s?PRO-?X?\d*$/i, format: 'David Clark Headset', manufacturer: 'David Clark' },

  // Generic alphanumeric product (last resort)
  { regex: /^[A-Z0-9]+[A-Z0-9.\-\/]{2,29}$/, format: 'Generic alphanumeric', manufacturer: null },
]

const VALIDATOR_PROMPT = `Você é um especialista sênior em peças aeronáuticas com conhecimento profundo de:

CATEGORIAS DE PEÇAS QUE A AMAZON JET AVIATION VENDE:
1. PEÇAS DE AERONAVE (estruturais, hidráulicas, elétricas)
2. AVIÔNICOS (GPS, transponders, radios, instrumentos): Garmin, Bendix/King, Avidyne, Aspen, Honeywell, Collins
3. HEADSETS: Bose A20/A30, Lightspeed Zulu/Sierra/Tango/Delta, David Clark H10, Telex, Sennheiser
4. MOTORES E COMPONENTES: Lycoming, Continental, Pratt & Whitney, Rolls-Royce
5. ACESSÓRIOS: ELT, transponders, oxigênio, baterias

PADRÕES DE PART NUMBER:
- MIL-SPEC (AN, MS, NAS, M-series)
- NATO NSN (13 dígitos)
- ATA SPEC2000
- Códigos proprietários (Cessna, Piper, Beechcraft, Embraer, Garmin, Bose)
- Nomes de modelo válidos (ex: "Bose A30", "Garmin GTN 750", "Lightspeed Zulu 3")

Avalie se o texto é um produto aeronáutico legítimo (PN formal OU nome de produto reconhecido).

Texto: "<candidate>"

Responda APENAS JSON, sem markdown:
{
  "valid": boolean,
  "format": string,
  "manufacturer": string|null,
  "confidence": "high"|"medium"|"low",
  "normalized": string,
  "reason": string
}

CRITÉRIOS DE ACEITAÇÃO:
- PNs formais (MS, AN, NAS): valid=true high
- Produtos aviation comerciais (headsets Bose A30, Lightspeed Zulu 3, GPS Garmin GTN750, etc.): valid=true medium
- Modelos abreviados que claramente identificam produto (A30, A20, Zulu 3): valid=true medium
- Marca + modelo aviation: valid=true medium
- Texto genérico ("olá", "preciso", "uma peça"): valid=false
- Algo ambíguo mas com dígitos: valid=true low (deixe humano decidir)

SEMPRE aceite produtos de fabricantes aviation conhecidos como PN válido.

EXEMPLOS:
- "preciso de uma peça" → invalid (texto genérico, sem produto)
- "olá" → invalid
- "Bose A30" → valid, medium, Bose Headset
- "Lightspeed Zulu 3" → valid, medium, Lightspeed Headset
- "MS21266-2N" → valid, high, MIL-SPEC MS
- "GTN 750" → valid, medium, Garmin Avionics
- "headset" sozinho → invalid (falta marca/modelo)
- "ABC123" → valid, low, Generic alphanumeric
- "857641-0010" → valid, high, Bose Headset
- normalized: uppercase, trim, espaços/hífens normalizados

IMPORTANTE: a empresa VENDE quase tudo de aviação geral. Não rejeite por achar que "não é da nossa linha". Aceite qualquer coisa que seja plausivelmente produto aeronáutico/aviônico/headset/instrumento.`

function normalize(candidate: string): string {
  return candidate.trim().toUpperCase().replace(/\s+/g, ' ')
}

export async function validatePartNumber(candidate: string): Promise<ValidationResult> {
  const normalized = normalize(candidate)

  // Step 1: regex (without spaces — fast match)
  const compact = normalized.replace(/\s+/g, '')
  for (const p of PATTERNS) {
    if (p.regex.test(compact) || p.regex.test(normalized)) {
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

  // Step 2: short-circuit only for very obviously bad input
  if (normalized.length < 2) {
    return {
      valid: false, format: 'Invalid', manufacturer: null,
      confidence: 'high', normalized,
      reason: 'Texto muito curto',
    }
  }

  // Step 3: LLM (always for ambiguous; the LLM knows the domain)
  try {
    const cfg = await loadOpenAIConfig()
    const openai = createOpenAI({ apiKey: cfg.apiKey })
    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: VALIDATOR_PROMPT,
      prompt: candidate,
    })

    // Strip code fences if model adds them
    const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(cleaned) as Partial<ValidationResult>
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
      valid: false, format: 'Unknown', manufacturer: null,
      confidence: 'low', normalized,
      reason: 'Falha ao validar via LLM',
    }
  }
}

export interface ExtractedItem {
  candidate: string
  context: string
  quantity?: string
}

const EXTRACT_PROMPT = `Você é um especialista em peças aeronáuticas. Leia o texto e EXTRAIA todos os Part Numbers ou referências de produtos aeronáuticos mencionados.

Considere PN aeronáutico:
- MIL-SPEC (AN, MS, NAS, M-series)
- NSN (4-2-3-4 dígitos)
- Garmin, Cessna, Beechcraft, Piper, Embraer, Honeywell, Collins, P&W, Lycoming
- Headsets aviation (Bose A20/A30, Lightspeed Zulu/Sierra, David Clark H10)
- Modelos comerciais aviation reconhecíveis

Responda APENAS JSON:
{"items": [{"candidate": "MS21266-2N", "context": "linha 3 da planilha", "quantity": "2 unidades"}, ...]}

REGRAS:
- Inclua quantidade SE estiver explicitamente associada (ex: "MS21266-2N qty 2", "qtd 5", coluna "qtd")
- Inclua context curto (qual linha, qual seção)
- Se nenhum PN encontrado: {"items": []}
- NÃO invente PNs que não estão no texto`

export async function extractPartNumbersFromText(text: string): Promise<ExtractedItem[]> {
  if (!text || text.trim().length < 5) return []

  try {
    const cfg = await loadOpenAIConfig()
    const openai = createOpenAI({ apiKey: cfg.apiKey })
    const { text: response } = await generateText({
      model: openai('gpt-4o'),
      system: EXTRACT_PROMPT,
      prompt: text,
    })
    const cleaned = response.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { items?: ExtractedItem[] }
    return parsed.items ?? []
  } catch (err) {
    console.warn('[extract_part_numbers] error:', err)
    return []
  }
}
