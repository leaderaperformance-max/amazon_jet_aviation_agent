import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A diretiva de tools vive inline no runAgent. Este teste tranca as REGRAS DE NEGÓCIO
// críticas no prompt pra que nenhuma edição futura as remova sem quebrar o build.
const agentSrc = readFileSync(join(process.cwd(), 'lib/agent.ts'), 'utf8')

describe('regra máxima: Part Number obrigatório', () => {
  it('declara o PN como obrigatório e proíbe usar descrição no lugar', () => {
    expect(agentSrc).toContain('O PART NUMBER É OBRIGATÓRIO')
    expect(agentSrc).toContain('Descrição NÃO é Part Number')
  })
  it('pedido de cotação SEM PN não pula pra quantidade/urgência', () => {
    expect(agentSrc).toContain('Se pediu cotação MAS SEM Part Number')
    expect(agentSrc).toContain('PEÇA O PART NUMBER')
  })
  it('proíbe envia_pn sem PN real', () => {
    expect(agentSrc).toContain('sem PART NUMBER real')
  })
  it('o inventário mental marca que descrição não conta como PN', () => {
    expect(agentSrc).toContain('NÃO conta como PN')
  })
})

describe('PDF/documento com PNs: extrair é obrigação (nunca pedir de volta)', () => {
  it('declara a obrigação de extrair PNs de documento/PDF/lista', () => {
    expect(agentSrc).toContain('OBRIGATÓRIO EXTRAIR')
    expect(agentSrc).toContain('extract_part_numbers')
  })
  it('proíbe pedir de volta PNs que já estão no documento', () => {
    expect(agentSrc).toContain('NÃO peça os PNs de volta')
  })
  it('documento com DESCRIÇÃO (não código) não conta como ter o PN', () => {
    expect(agentSrc).toContain('só conta como "ter o PN" se o documento traz o CÓDIGO')
    expect(agentSrc).toContain('Descrição, mesmo com nome de fabricante/modelo')
  })
  it('trata o status faltou_pn pedindo o código de cada descrição', () => {
    expect(agentSrc).toContain("status: 'faltou_pn'")
  })
})

describe('proatividade: nunca deixar cotação de cliente passar', () => {
  it('declara a missão de reunir os 3 dados e nunca ficar passivo', () => {
    expect(agentSrc).toContain('NUNCA DEIXE UMA COTAÇÃO PASSAR')
    expect(agentSrc).toContain('PROIBIDO ficar passivo')
  })
  it('proíbe "aguardo seu retorno" antes do envia_pn', () => {
    expect(agentSrc).toContain('NUNCA encerre passivo com dado faltando')
  })
  it('manda pedir o dado que faltou quando o cliente respondeu só parte', () => {
    expect(agentSrc).toContain('E quantas unidades?')
  })
})

describe('regras de negócio já conquistadas (não podem regredir)', () => {
  it('nunca manda link de planilha pro cliente', () => {
    expect(agentSrc).toContain('NUNCA mande link de planilha')
  })
  it('nunca adiciona a etiqueta orcamento_enviado', () => {
    expect(agentSrc).toContain("NUNCA adicione 'orcamento_enviado'")
  })
})
