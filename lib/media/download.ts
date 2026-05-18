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
