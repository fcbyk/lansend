import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import archiver from 'archiver'
import type { Hono } from 'hono'
import { success, error } from '../utils/response.js'
import { FileShareService } from '../services/fileShare.service.js'

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/x-m4v',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

export function registerRoutes(app: Hono, service: FileShareService) {
  app.get('/api/file/:filename{.*}', (c) => {
    try {
      const filename = c.req.param('filename')
      const data = service.readFileContent(filename)
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

      const fileSize = fs.statSync(filePath).size
      const rangeHeader = c.req.header('Range')
      let start = 0
      let end = fileSize - 1
      const contentType = getMimeType(filePath)
      const isMedia = contentType.startsWith('video/') || contentType.startsWith('audio/')
      const maxMediaChunk = 512 * 1024

      if (rangeHeader || isMedia) {
        const effectiveRange = rangeHeader || 'bytes=0-'
        const match = effectiveRange.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          start = parseInt(match[1], 10)
          end = match[2] ? parseInt(match[2], 10) : fileSize - 1

          if (start >= fileSize || end >= fileSize) {
            return new Response('Requested Range Not Satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${fileSize}` },
            })
          }

          if (isMedia) {
            end = Math.min(end, start + maxMediaChunk - 1)
          }

          const length = end - start + 1
          const headers = new Headers({
            'Content-Type': contentType,
            'Content-Length': String(length),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
          })

          const stream = fs.createReadStream(filePath, { start, end })
          return new Response(stream as any, { status: 206, headers })
        }
      }

      const headers = new Headers({
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })

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

      const fileSize = fs.statSync(filePath).size
      const rawName = path.basename(filePath)
      const safeNameUtf8 = encodeURIComponent(rawName)
      let fallbackName = rawName.replace(/[^\x00-\x7F]/g, '').trim()
      const ext = path.extname(rawName)
      if (!fallbackName || fallbackName === ext) {
        fallbackName = ext ? `download${ext}` : 'download'
      }

      const headers = new Headers({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileSize),
        'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${safeNameUtf8}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })

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

      const base = service.ensureSharedDirectory()
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

      const tempPath = path.join(os.tmpdir(), `lansend_${Date.now()}_${Math.random().toString(36).slice(2)}.zip`)

      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(tempPath)
        const archive = archiver('zip', { zlib: { level: 9 } })
        archive.pipe(output)

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

        output.on('close', resolve)
        output.on('error', reject)
        archive.finalize()
      })

      const fileSize = fs.statSync(tempPath).size
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

      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Length': String(fileSize),
        'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${safeNameUtf8}`,
        'Cache-Control': 'no-cache',
      })

      const stream = fs.createReadStream(tempPath)
      stream.on('close', () => {
        try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
      })

      return new Response(stream as any, { headers })
    } catch (e) {
      return error(c, e instanceof Error ? e.message : 'unknown error', 500)
    }
  })
}