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
