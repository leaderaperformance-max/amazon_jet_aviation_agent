import { loadOpenAIConfig } from '@/lib/inboxes'

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const cfg = await loadOpenAIConfig()

  const form = new FormData()
  const ext = mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('wav') ? 'wav'
    : 'ogg'
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
