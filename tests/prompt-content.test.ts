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

describe('regras de negócio já conquistadas (não podem regredir)', () => {
  it('nunca manda link de planilha pro cliente', () => {
    expect(agentSrc).toContain('NUNCA mande link de planilha')
  })
  it('nunca adiciona a etiqueta orcamento_enviado', () => {
    expect(agentSrc).toContain("NUNCA adicione 'orcamento_enviado'")
  })
})
