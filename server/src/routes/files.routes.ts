import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import archiver from 'archiver'
import mime from 'mime-types'
import type { Hono } from 'hono'
import { success, error } from '../utils/response.js'
import { FileShareService } from '../services/fileShare.service.js'

function getMimeType(filePath: string): string {
  return mime.lookup(filePath) || 'application/octet-stream'
}

function getCacheHeaders(filePath: string): Headers {
  const stat = fs.statSync(filePath)
  const mtime = stat.mtime.toUTCString()
  const size = stat.size
  const etag = `"${crypto.createHash('md5').update(`${mtime}:${size}`).digest('hex')}"`

  const headers = new Headers()
  headers.set('ETag', etag)
  headers.set('Last-Modified', mtime)

  const isImmutable = (fileName: string) => /^index-[a-zA-Z0-9]+\.(js|css)$/.test(fileName)
  if (isImmutable(path.basename(filePath))) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    headers.set('Cache-Control', 'no-cache')
  }

  return headers
}

function checkNotModified(c: any, filePath: string): Response | null {
  const stat = fs.statSync(filePath)
  const mtime = stat.mtime.toUTCString()
  const size = stat.size
  const etag = `"${crypto.createHash('md5').update(`${mtime}:${size}`).digest('hex')}"`

  const ifNoneMatch = c.req.header('If-None-Match')
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304 })
  }

  const ifModifiedSince = c.req.header('If-Modified-Since')
  if (ifModifiedSince && !ifNoneMatch) {
    const ims = new Date(ifModifiedSince).getTime()
    const lm = stat.mtime.getTime()
    if (ims >= lm) {
      return new Response(null, { status: 304 })
    }
  }

  return null
}

interface RangeInfo {
  start: number
  end: number
  size: number
}

function parseRange(rangeHeader: string | undefined, fileSize: number): RangeInfo | null {
  if (!rangeHeader) return null

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
  if (!match) return null

  const rawStart = match[1]
  const rawEnd = match[2]

  let start: number
  let end: number

  if (rawStart === '' && rawEnd !== '') {
    end = fileSize - 1
    start = Math.max(0, fileSize - parseInt(rawEnd, 10))
  } else {
    start = rawStart ? parseInt(rawStart, 10) : 0
    end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1
  }

  if (start >= fileSize || end >= fileSize || start > end) {
    return null
  }

  return { start, end, size: fileSize }
}

export function registerRoutes(app: Hono, service: FileShareService) {
  app.get('/api/file/:filename{.*}', async (c) => {
    try {
      const filename = c.req.param('filename')
      const data = await service.readFileContent(filename)
      return success(c, data)
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === 'Shared directory not specified') return error(c, e.message, 400)
        if (e.message === 'Invalid path' || e.message === 'File not found') return error(c, e.message, 404)
        return error(c, e.message, 500)
      }
      return error(c, 'unknown error', 500)
    }
  })

  app.get('/api/tree', (c) => {
    try {
      const base = service.ensureSharedDirectory()
      const tree = service.getFileTree(base)
      return success(c, { tree })
    } catch (e) {
      if (e instanceof Error && e.message === 'Shared directory not specified') {
        return error(c, e.message, 400)
      }
      return error(c, e instanceof Error ? e.message : 'unknown error', 500)
    }
  })

  app.get('/api/directory', (c) => {
    try {
      const dirPath = c.req.query('path') || ''
      const data = service.getDirectoryListing(dirPath)
      return success(c, data)
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === 'Shared directory not specified') return error(c, e.message, 400)
        if (e.message === 'Directory not found') return error(c, e.message, 404)
        return error(c, e.message, 500)
      }
      return error(c, 'unknown error', 500)
    }
  })

  app.get('/api/preview/:filename{.*}', (c) => {
    try {
      const filename = c.req.param('filename')
      const filePath = service.resolveFilePath(filename)
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return c.notFound()
      }

      const notModified = checkNotModified(c, filePath)
      if (notModified) return notModified

      const fileSize = fs.statSync(filePath).size
      const contentType = getMimeType(filePath)
      const range = parseRange(c.req.header('Range'), fileSize)
      const isMedia = contentType.startsWith('video/') || contentType.startsWith('audio/')
      const maxMediaChunk = 512 * 1024

      if (range) {
        let { start, end } = range

        if (isMedia) {
          end = Math.min(end, start + maxMediaChunk - 1)
        }

        const length = end - start + 1
        const headers = getCacheHeaders(filePath)
        headers.set('Content-Type', contentType)
        headers.set('Content-Length', String(length))
        headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        headers.set('Accept-Ranges', 'bytes')

        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(stream as any, { status: 206, headers })
      }

      if (isMedia) {
        const end = Math.min(fileSize - 1, maxMediaChunk - 1)
        const length = end + 1
        const headers = getCacheHeaders(filePath)
        headers.set('Content-Type', contentType)
        headers.set('Content-Length', String(length))
        headers.set('Content-Range', `bytes 0-${end}/${fileSize}`)
        headers.set('Accept-Ranges', 'bytes')

        const stream = fs.createReadStream(filePath, { start: 0, end })
        return new Response(stream as any, { status: 206, headers })
      }

      const headers = getCacheHeaders(filePath)
      headers.set('Content-Type', contentType)
      headers.set('Content-Length', String(fileSize))
      headers.set('Accept-Ranges', 'bytes')

      return new Response(fs.createReadStream(filePath) as any, { headers })
    } catch {
      return c.notFound()
    }
  })

  app.get('/api/download/:filename{.*}', (c) => {
    try {
      const filename = c.req.param('filename')
      const filePath = service.resolveFilePath(filename)
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return c.notFound()
      }

      const notModified = checkNotModified(c, filePath)
      if (notModified) return notModified

      const fileSize = fs.statSync(filePath).size
      const rawName = path.basename(filePath)
      const safeNameUtf8 = encodeURIComponent(rawName)
      let fallbackName = rawName.replace(/[^\x00-\x7F]/g, '').trim()
      const ext = path.extname(rawName)
      if (!fallbackName || fallbackName === ext) {
        fallbackName = ext ? `download${ext}` : 'download'
      }

      const range = parseRange(c.req.header('Range'), fileSize)

      if (range) {
        const { start, end } = range
        const length = end - start + 1
        const headers = getCacheHeaders(filePath)
        headers.set('Content-Type', 'application/octet-stream')
        headers.set('Content-Length', String(length))
        headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        headers.set('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${safeNameUtf8}`)
        headers.set('Accept-Ranges', 'bytes')

        const stream = fs.createReadStream(filePath, { start, end })
        return new Response(stream as any, { status: 206, headers })
      }

      const headers = getCacheHeaders(filePath)
      headers.set('Content-Type', 'application/octet-stream')
      headers.set('Content-Length', String(fileSize))
      headers.set('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${safeNameUtf8}`)
      headers.set('Accept-Ranges', 'bytes')

      return new Response(fs.createReadStream(filePath) as any, { headers })
    } catch {
      return c.notFound()
    }
  })

  app.post('/api/download-zip', async (c) => {
    try {
      const body = await c.req.json()
      const paths = body.paths
      if (!Array.isArray(paths) || paths.length === 0) {
        return error(c, 'paths required', 400)
      }

      const items: { rel: string; abs: string }[] = []

      for (const raw of paths) {
        if (typeof raw !== 'string' || !raw.trim()) {
          return error(c, 'invalid path', 400)
        }
        const relPath = raw.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/')
        let absPath: string
        try {
          absPath = service.resolveFilePath(relPath)
        } catch {
          return error(c, 'invalid path', 400)
        }
        if (!fs.existsSync(absPath)) {
          return error(c, 'file not found', 404)
        }
        items.push({ rel: relPath, abs: absPath })
      }

      let zipName: string
      if (items.length === 1) {
        const baseName = path.basename(items[0].rel.replace(/\/+$/, '')) || 'download'
        zipName = `${baseName}.zip`
      } else {
        zipName = 'lansend.zip'
      }

      const safeNameUtf8 = encodeURIComponent(zipName)
      let fallbackName = zipName.replace(/[^\x00-\x7F]/g, '').trim()
      const ext = path.extname(zipName)
      if (!fallbackName || fallbackName === ext) {
        fallbackName = ext ? `download${ext}` : 'download.zip'
      }

      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()

      const archive = archiver('zip', { zlib: { level: 9 } })

      archive.on('data', (chunk: Buffer) => {
        writer.write(chunk)
      })

      archive.on('end', () => {
        writer.close()
      })

      archive.on('error', (err) => {
        writer.abort(err)
      })

      const arcnameSet = new Set<string>()
      for (const item of items) {
        if (fs.statSync(item.abs).isDirectory()) {
          archive.directory(item.abs, item.rel)
        } else {
          const arcname = item.rel.replace(/\\/g, '/')
          if (!arcnameSet.has(arcname)) {
            arcnameSet.add(arcname)
            archive.file(item.abs, { name: arcname })
          }
        }
      }
      archive.finalize()

      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${safeNameUtf8}`,
        'Cache-Control': 'no-cache',
      })

      return new Response(readable as any, { headers })
    } catch (e) {
      return error(c, e instanceof Error ? e.message : 'unknown error', 500)
    }
  })
}