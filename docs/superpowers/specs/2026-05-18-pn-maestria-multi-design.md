# Fase 7 — Maestria de Part Number (multi-PN, planilhas, PDFs nativos, validação inteligente)

**Date:** 2026-05-18
**Status:** Aprovado
**Escopo:** Resolver 5 problemas: (1) validador rejeitando PNs reais como "Bose A30"; (2) suporte multi-PN em documentos; (3) OCR/leitura de PDFs nativamente via GPT-4o; (4) parser de XLSX/CSV; (5) JET prompt que não rejeita categorias preemptivamente.

---

## 1. Problemas identificados

| # | Sintoma | Causa raiz |
|---|---|---|
| A | "Bose A30" rejeitado como PN inválido | Validador é restrito demais; só conhece padrões MIL-SPEC/NSN/Garmin/Cessna. Não cobre headsets/produtos consumidor-aviation. |
| B | Bot disse "não vendemos esse PN" | JET prompt ensina a rejeitar cedo. Bot deveria SEMPRE validar via tool antes. |
| C | Planilhas (XLSX/CSV) não processadas | Sem parser; cai em "unsupported attachment" |
| D | PDFs escaneados retornam erro | unpdf não faz OCR; pipeline fallback inexistente |
| E | Documentos com múltiplos PNs | Tool `envia_pn` aceita 1 PN; `validate_part_number` valida 1 candidato. Sem `extract_part_numbers`. |

---

## 2. Arquitetura

### 2.1 Validador renovado

`lib/part-number.ts` ganha:

- **Mais padrões regex** cobrindo produtos consumer-aviation:
  - Bose: `A30`, `A20`, `Bose A20/A30` etc.
  - Lightspeed: `Zulu 3`, `Sierra`, `Tango`
  - David Clark: `H10-13.4`, `H10-30`, `DC PRO-X2`
  - Telex, Sennheiser, Pilot USA — patterns conhecidos
  - **PN genérico de produto**: alfanumérico 2-30 chars com pelo menos 1 dígito

- **LLM-first com prompt expandido**: o prompt explicitamente cobre headsets, GPS portáteis, transponders, radios, instrumentos, etc. E sabe que "Bose A30" é um headset real (PN: 857641-0010).

- **Aceita produto+modelo** como PN válido com confidence='medium' se for marca conhecida + modelo.

### 2.2 Extração multi-PN

Novo tool `extract_part_numbers({ text })`:
- Recebe blob de texto (resultado de PDF/planilha/lista)
- Chama GPT-4o com prompt focado em aviação
- Retorna `Array<{ candidate: string, context: string, quantity?: string }>`

Quando o cliente manda "preciso de: MS21266-2N qty 2, AN3-5A qty 10, NAS1149 qty 5", o agente:
1. Chama `extract_part_numbers` → recebe array
2. Para cada item, chama `validate_part_number`
3. Chama `envia_pn` UMA vez com array de itens

### 2.3 PDF via GPT-4o nativo

GPT-4o aceita PDFs como `file` input direto. Sem precisar OCR pipeline separado.

`lib/media/pdf.ts` refatorado:
1. **Tenta** extração de texto via `unpdf` (rápido, free)
2. Se < 50 chars (escaneado): **fallback** envia PDF binário pro GPT-4o Vision com prompt aeronáutico
3. GPT-4o lê o PDF inteiro (texto + imagens internas) e retorna análise

### 2.4 Planilhas XLSX/CSV

Novo `lib/media/spreadsheet.ts`:
- Usa lib `xlsx` (parser puro JS, funciona em serverless)
- Detecta MIME: `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Extrai todas as células do workbook (todas as sheets)
- Converte pra texto tabular: `PN: MS21266-2N | QTY: 2 | CONDITION: NEW`
- Trunca em 8000 chars
- Retorna pra `processAttachment` com prefixo `[PLANILHA — nome.xlsx]:`

### 2.5 envia_pn multi-item

Nova assinatura:
```typescript
envia_pn({
  items: [
    { part_number: string, quantity: string, notes?: string }
  ],
  urgency: 'AOG' | 'rotina',
  general_notes?: string
})
```

Mensagem ao vendedor com lista quando múltiplos itens:
```
🆕 NOVO LEAD QUALIFICADO

👤 Cliente: João Silva
📱 WhatsApp: +5511999...
⚡ Urgência: AOG 🔴

📋 ITENS (3):
  1. MS21266-2N — Qtd: 2
  2. AN3-5A — Qtd: 10
  3. NAS1149-FN416P — Qtd: 5

📝 Cliente precisa pra hangar SBSP

🔗 Atender: https://chat.../conv/466
```

Tabela `leads`: cria UMA linha por item (assim cada PN aparece individualmente no dashboard /leads).

### 2.6 JET prompt — mudanças no comportamento

- **Nunca dizer "não vendemos esse PN"** sem ter validado via tool
- **Validar SEMPRE** que o cliente fornecer algo que pareça produto aeronáutico
- Se `validate_part_number` retornar `confidence: low` ou `medium`: o bot pode pedir confirmação ao cliente ("Quer dizer um headset Bose A30? Tenho ele aqui — está correto?")
- Aceita **listas** ("preciso de MS21266, AN3-5A e NAS1149") — usa `extract_part_numbers` primeiro
- Quando recebe planilha/PDF: roda `extract_part_numbers` no texto resultante

---

## 3. Tabela leads — schema unchanged

Continua 1 linha por PN. Quando `envia_pn` recebe múltiplos items, cria múltiplas linhas no banco — todas com `sent_to_seller_at` igual e mesma `urgency`.

Nenhuma migration.

---

## 4. Arquivos novos / modificados

### Novos
- `lib/media/spreadsheet.ts` — XLSX/CSV parser
- `tests/media-spreadsheet.test.ts`

### Modificados
- `lib/part-number.ts` — mais regex + prompt LLM expandido + aceita produtos
- `lib/media/pdf.ts` — fallback GPT-4o se unpdf não retornar texto
- `lib/media/process.ts` — roteamento XLSX/CSV
- `lib/prompt.ts` — seções 13/14 reformuladas + nova diretriz "nunca rejeitar sem validar"
- `app/api/webhook/route.ts` — tools `extract_part_numbers` + `envia_pn` (multi-item)
- `tests/part-number.test.ts` — adiciona testes pra Bose, Lightspeed, David Clark
- `tests/webhook.test.ts` — cenário multi-PN

### Dependências
```bash
npm install xlsx
```

---

## 5. Critérios de aceitação

1. Cliente envia "Bose A30" → bot valida (medium confidence, format: "Bose Headset"), aceita, pede quantidade + urgência, envia ao vendedor
2. Cliente envia planilha XLSX com 5 PNs → bot extrai, valida cada um, envia leads em batch
3. Cliente envia PDF escaneado de invoice com PNs → GPT-4o Vision lê, extrai PNs, valida, envia
4. Cliente envia "preciso de MS21266-2N qty 2 e AN3-5A qty 10" → bot processa ambos numa única chamada
5. Bot NUNCA diz "não vendemos esse PN" sem ter chamado `validate_part_number` primeiro
6. Dashboard `/dashboard/leads` mostra cada PN individualmente
7. 84+ testes passando, build limpo, deploy OK

---

## 6. Fora do escopo

- **Quote pricing** (catálogo real) — fica pra integração com sistema do vendedor
- **Reconhecimento de PN em vídeo** — Whatsapp raramente envia vídeo de peça
- **Sugestão automática de PN alternativo** (cross-reference) — exige catálogo proprietário
- **OCR de imagens muito baixa qualidade** — GPT-4o Vision já é state-of-the-art
- **PNs militares ITAR/dual-use** — JET prompt já manda escalar pra humano
