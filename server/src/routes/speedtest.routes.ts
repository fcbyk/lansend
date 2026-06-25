import type { Hono } from 'hono'
import { success } from '../utils/response.js'

function tryInt(v: string | undefined | null): number | null {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

export function registerRoutes(app: Hono) {
  app.get('/api/speedtest/download', (c) => {
    let sizeMb = tryInt(c.req.query('size')) || 50
    if (sizeMb > 500) sizeMb = 500
    const sizeBytes = sizeMb * 1024 * 1024
    const chunkSize = 1024 * 1024

    let remaining = sizeBytes
    const readable = new ReadableStream({
      pull(controller) {
        if (remaining <= 0) {
          controller.close()
          return
        }
        const toRead = Math.min(chunkSize, remaining)
        controller.enqueue(new Uint8Array(toRead))
        remaining -= toRead
      },
    })

    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(sizeBytes),
      'Content-Disposition': 'attachment; filename=speedtest.bin',
    })

    return new Response(readable, { headers })
  })

  app.post('/api/speedtest/upload', async (c) => {
    const contentLength = c.req.raw.headers.get('Content-Length')
    if (contentLength) {
      let remaining = parseInt(contentLength, 10)
      const reader = c.req.raw.body?.getReader()
      if (reader) {
        while (remaining > 0) {
          const { done, value } = await reader.read()
          if (done) break
          remaining -= value.length
        }
      }
    } else {
      const reader = c.req.raw.body?.getReader()
      if (reader) {
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }
    }
    return success(c, null, 'upload test complete')
  })
}