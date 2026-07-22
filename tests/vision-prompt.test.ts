import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tranca as regras do prompt de visão: extrair PN de QUALQUER imagem é obrigação,
// e a saída de escape que descartava listas de peças como "não-aeronáutica" não volta.
const visionSrc = readFileSync(join(process.cwd(), 'lib/media/vision.ts'), 'utf8')

describe('prompt de visão: extrair PN é a regra máxima', () => {
  it('declara prioridade máxima de extrair PN/código/lista', () => {
    expect(visionSrc).toContain('PRIORIDADE MÁXIMA')
    expect(visionSrc).toContain('REGRA DE OURO')
    expect(visionSrc).toContain('NUNCA descarte uma imagem que contenha códigos')
  })
  it('cobre documento encaminhado / print / ordem de serviço', () => {
    expect(visionSrc).toContain('DOCUMENTO ENCAMINHADO')
    expect(visionSrc.toUpperCase()).toContain('ORDEM DE SERVIÇO')
  })
  it('removeu a saída de escape antiga "Imagem não-aeronáutica" (OUTRA)', () => {
    // A regra antiga descartava qualquer imagem "OUTRA" como não-aeronáutica.
    expect(visionSrc).not.toContain('diga "Imagem não-aeronáutica" e descreva brevemente')
    expect(visionSrc).not.toMatch(/OUTRA → diga/)
  })
  it('só descarta imagem REALMENTE sem peças (selfie/meme), na dúvida extrai', () => {
    expect(visionSrc).toContain('Na dúvida, EXTRAIA o texto')
  })
})
