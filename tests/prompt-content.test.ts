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
  it('contatos dentro do documento não são o cliente', () => {
    expect(agentSrc).toContain('CONTATOS DENTRO DO DOCUMENTO NÃO SÃO O CLIENTE')
    expect(agentSrc).toContain('empresa que EMITIU o documento')
  })
})

describe('urgência: nunca sugerir AOG (cliente fala primeiro)', () => {
  it('não oferece a escolha "AOG ou rotina" como PERGUNTA ao cliente', () => {
    // A frase só pode aparecer dentro da PROIBIÇÃO ("Não escreva ..."), nunca como
    // template de pergunta ("→ AGORA pergunte: ...", "• Urgência (AOG ou rotina)?").
    expect(agentSrc).not.toContain('Urgência (AOG ou rotina)?')
    expect(agentSrc).not.toMatch(/pergunte[^\n]{0,40}é AOG ou rotina\?/)
    expect(agentSrc).not.toMatch(/Última coisa — é AOG/)
  })
  it('pergunta a urgência de forma ABERTA', () => {
    expect(agentSrc).toContain('qual a urgência para o recebimento da peça?')
    expect(agentSrc).toContain('NUNCA OFEREÇA AS OPÇÕES "AOG OU ROTINA" AO CLIENTE')
  })
  it('só classifica AOG se o cliente falar espontaneamente; pressa = rotina', () => {
    expect(agentSrc).toContain('Só classifique como AOG se o PRÓPRIO CLIENTE disser espontaneamente')
    expect(agentSrc).toContain('Pressa NÃO é AOG')
  })
})

describe('confirmação de cotação: padrão da empresa + listagem de PNs', () => {
  it('manda usar a resposta_pronta verbatim', () => {
    expect(agentSrc).toContain('resposta_pronta')
    expect(agentSrc).toContain('Responda EXATAMENTE esse texto')
  })
  it('proíbe resumir com "Total de itens" em vez de listar', () => {
    expect(agentSrc).toContain('Total de itens')
    expect(agentSrc).toContain('TODOS os PNs têm que aparecer listados')
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
