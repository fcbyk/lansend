import path from 'node:path'
import fs from 'node:fs'
import type { Context } from 'hono'
import { success, error } from '../utils/response.js'
import { UploadService } from '../services/upload.service.js'
import { FileShareService } from '../services/fileShare.service.js'

function tryInt(v: string | undefined | null): number | null {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

function getClientIp(c: Context): string {
  const xff = c.req.header('X-Forwarded-For')
  if (xff) {
    return xff.split(',')[0].trim()
  }
  return 'unknown'
}

export function registerRoutes(app: import('hono').Hono, service: UploadService) {
  app.post('/api/upload/init', async (c) => {
    const ip = getClientIp(c)
    const password = c.req.header('X-Upload-Password')
    const verifyErr = service.verifyPassword(password || null)
    if (verifyErr) return error(c, verifyErr, 401)

    const form = await c.req.formData()
    const filenameRaw = (form.get('filename') as string || '').trim()
    const size = tryInt(form.get('size') as string)
    const relPath = ((form.get('path') as string) || '').trim().replace(/^\/+|\/+$/g, '')
    const chunkSize = tryInt(form.get('chunk_size') as string) || 8 * 1024 * 1024
    const totalChunks = tryInt(form.get('total_chunks') as string)

    try {
      const result = service.initUpload(ip, filenameRaw, size || 0, relPath, chunkSize, totalChunks)
      return success(c, result)
    } catch (e) {
      return error(c, e instanceof Error ? e.message : 'unknown error', 400)
    }
  })

  app.post('/api/upload/chunk', async (c) => {
    const ip = getClientIp(c)
    const password = c.req.header('X-Upload-Password')
    const verifyErr = service.verifyPassword(password || null)
    if (verifyErr) return error(c, verifyErr, 401)

    const uploadId = UploadService.safeUploadId(c.req.query('upload_id') || '')
    const index = tryInt(c.req.query('index'))
    if (!uploadId) return error(c, 'upload_id is required', 400)
    if (index === null || index < 0) return error(c, 'index is required', 400)

    const body = c.req.raw.body
    if (!body) return error(c, 'request body is required', 400)
    await service.saveChunk(uploadId, index, body, ip)
    return success(c, null, 'chunk uploaded')
  })

  app.post('/api/upload/complete', async (c) => {
    const ip = getClientIp(c)
    const password = c.req.header('X-Upload-Password')
    const verifyErr = service.verifyPassword(password || null)
    if (verifyErr) return error(c, verifyErr, 401)

    const body = await c.req.json()
    const uploadId = UploadService.safeUploadId(body.upload_id || '')
    if (!uploadId) return error(c, 'upload_id is required', 400)

    try {
      const result = await service.completeUpload(uploadId, ip)
      return success(c, result, 'file uploaded')
    } catch (e) {
      if (e instanceof Error && e.message === 'upload not found') {
        return error(c, e.message, 404)
      }
      return error(c, e instanceof Error ? e.message : 'unknown error', 400)
    }
  })

  app.post('/api/upload/abort', async (c) => {
    const password = c.req.header('X-Upload-Password')
    const verifyErr = service.verifyPassword(password || null)
    if (verifyErr) return error(c, verifyErr, 401)

    const body = await c.req.json()
    const uploadId = UploadService.safeUploadId(body.upload_id || '')
    if (!uploadId) return error(c, 'upload_id is required', 400)

    service.abortUpload(uploadId)
    return success(c, null, 'upload aborted')
  })

  app.post('/upload', async (c) => {
    const ip = getClientIp(c)
    const form = await c.req.formData()
    const relPath = ((form.get('path') as string) || '').trim().replace(/^\/+|\/+$/g, '')
    const sizeHint = tryInt(form.get('size') as string)

    const hasPassword = form.has('password')
    const hasFile = form.has('file')

    if (hasPassword && !hasFile) {
      const formPassword = form.get('password') as string
      const verifyErr = service.verifyPassword(formPassword || null)
      if (verifyErr) return error(c, verifyErr, 401)
      if (!service.config.uploadPassword) return error(c, 'upload password not set', 400)
      return success(c, null, 'password ok')
    }

    try {
      service.fileService.absTargetDir(relPath)
    } catch (e) {
      service.fileService.logUpload(ip, 0, `failed (${e instanceof Error ? e.message : 'invalid path'})`, relPath)
      return error(c, 'shared directory not set', 400)
    }

    const formPassword = form.get('password') as string
    const verifyErr = service.verifyPassword(formPassword || null)
    if (verifyErr) {
      service.fileService.logUpload(ip, 0, 'failed (wrong or missing password)', relPath)
      return error(c, verifyErr, 401)
    }

    const file = form.get('file') as File | null
    if (!file) {
      service.fileService.logUpload(ip, 0, 'failed (no file field)', relPath)
      return error(c, 'missing file', 400)
    }

    if (file.name === '') {
      service.fileService.logUpload(ip, 0, 'failed (no file selected)', relPath)
      return error(c, 'no file selected', 400)
    }

    let fileSize: number | null = file.size || sizeHint
    if (!fileSize) fileSize = null

    try {
      const result = await saveFile(service, file, relPath, fileSize, ip)
      return success(c, result, 'file uploaded')
    } catch (e) {
      return error(c, e instanceof Error ? e.message : 'unknown error', 500)
    }
  })
}

async function saveFile(
  service: UploadService,
  file: File,
  relPath: string,
  fileSize: number | null,
  ip: string,
) {
  const targetDir = service.fileService.absTargetDir(relPath)
  const filename = FileShareService.safeFilename(file.name || '') || 'untitled'

  if (!fs.existsSync(targetDir)) {
    await fs.promises.mkdir(targetDir, { recursive: true })
  } else {
    const stat = fs.statSync(targetDir)
    if (!stat.isDirectory()) {
      service.fileService.logUpload(ip, 0, `failed (target directory missing: ${relPath || 'root'})`, relPath, fileSize)
      throw new Error('target directory not found')
    }
  }

  let finalPath = path.join(targetDir, filename)
  let renamed = false
  if (fs.existsSync(finalPath)) {
    const ext = path.extname(filename)
    const name = path.basename(filename, ext)
    let counter = 1
    while (fs.existsSync(finalPath)) {
      const newFilename = `${name}_${counter}${ext}`
      finalPath = path.join(targetDir, newFilename)
      counter++
    }
    renamed = true
  }

  await streamFileToDisk(file.stream(), finalPath)

  const resolvedFilename = path.basename(finalPath)
  service.fileService.logUpload(ip, 1, `success (${resolvedFilename})`, relPath, fileSize)
  return { filename: resolvedFilename, renamed }
}

async function streamFileToDisk(stream: ReadableStream<Uint8Array>, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath)
    const reader = stream.getReader()

    const pump = async (): Promise<void> => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          writeStream.end()
          break
        }
        if (!writeStream.write(Buffer.from(value))) {
          writeStream.once('drain', () => {})
        }
      }
    }

    writeStream.on('finish', () => {
      resolve()
    })

    writeStream.on('error', (err) => {
      reader.cancel()
      reject(err)
    })

    pump().catch(reject)
  })
}