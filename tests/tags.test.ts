import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addLabel, removeLabel, syncLabels } from '@/lib/tags'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const chatwootCfg = {
  baseUrl: 'https://chat.example.com',
  accountId: 1,
  userToken: 'tok',
}

describe('syncLabels', () => {
  it('faz POST com labels completos para o Chatwoot', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    await syncLabels(chatwootCfg, 13, ['novo_lead', 'atendimento_ia'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/api/v1/accounts/1/conversations/13/labels',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_access_token': 'tok',
        },
        body: JSON.stringify({ labels: ['novo_lead', 'atendimento_ia'] }),
      }
    )
  })

  it('não lança quando Chatwoot retorna não-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    await expect(syncLabels(chatwootCfg, 13, ['x'])).resolves.toBeUndefined()
  })
})

describe('addLabel', () => {
  it('adiciona label ao set atual sem duplicar', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const result = await addLabel(chatwootCfg, 13, ['atendimento_ia'], 'novo_lead')
    expect(result).toEqual(['atendimento_ia', 'novo_lead'])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('não chama Chatwoot se label já existe', async () => {
    const result = await addLabel(chatwootCfg, 13, ['novo_lead'], 'novo_lead')
    expect(result).toEqual(['novo_lead'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('removeLabel', () => {
  it('remove label do set atual', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const result = await removeLabel(chatwootCfg, 13, ['novo_lead', 'atendimento_ia'], 'novo_lead')
    expect(result).toEqual(['atendimento_ia'])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('não chama Chatwoot se label não está no set', async () => {
    const result = await removeLabel(chatwootCfg, 13, ['novo_lead'], 'aguardando_pn')
    expect(result).toEqual(['novo_lead'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
