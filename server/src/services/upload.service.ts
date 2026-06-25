import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { FileShareService } from './fileShare.service.js'
import type { LansendConfig } from '../utils/config.js'

interface UploadMeta {
  upload_id: string
  filename: string
  size: number
  rel_path: string
  target_dir: string
  final_path: string
  chunk_size: number
  total_chunks: number
  renamed: boolean
  created_at: string
}

export class UploadService {
  public fileService: FileShareService
  public config: LansendConfig

  constructor(fileService: FileShareService) {
    this.fileService = fileService
    this.config = fileService.config
  }

  verifyPassword(password: string | null): string | null {
    if (!this.config.uploadPassword) return null
    if (!password) return 'upload password required'
    if (password !== this.config.uploadPassword) return 'wrong password'
    return null
  }

  ensureTmpDir(): string {
    const base = this.fileService.ensureSharedDirectory()
    const tmpDir = path.join(base, '.lansend_upload_tmp')
    fs.mkdirSync(tmpDir, { recursive: true })
    return tmpDir
  }

  static safeUploadId(uploadId: string): string {
    return (uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '')
  }

  initUpload(
    ip: string,
    filenameRaw: string,
    size: number | null,
    relPath: string,
    chunkSize: number,
    totalChunks: number | null,
  ) {
    if (!filenameRaw) throw new Error('filename is required')
    if (size === null || size < 0) throw new Error('size is required')
    if (totalChunks === null || totalChunks <= 0) throw new Error('total_chunks is required')
    if (chunkSize <= 0) throw new Error('invalid chunk_size')

    let targetDir: string
    try {
      targetDir = this.fileService.absTargetDir(relPath)
    } catch (e) {
      this.fileService.logUpload(ip, 0, `failed (${e instanceof Error ? e.message : 'invalid path'})`, relPath)
      throw e
    }

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      this.fileService.logUpload(ip, 0, `failed (target directory missing: ${relPath || 'root'})`, relPath, size)
      throw new Error('target directory not found')
    }

    const filename = FileShareService.safeFilename(filenameRaw) || 'untitled'
    const { finalPath, filename: resolvedFilename, renamed } = this.buildTargetPath(targetDir, filename)

    const uploadId = `${Date.now()}_${process.pid}_${crypto.randomBytes(6).toString('hex')}`
    const uploadDir = path.join(this.ensureTmpDir(), uploadId)
    fs.mkdirSync(uploadDir, { recursive: true })

    const meta: UploadMeta = {
      upload_id: uploadId,
      filename: resolvedFilename,
      size,
      rel_path: relPath,
      target_dir: targetDir,
      final_path: finalPath,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      renamed,
      created_at: new Date().toISOString(),
    }
    const metaPath = path.join(uploadDir, 'meta.json')
    fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8', (err) => {
      if (err) {
        process.stderr.write(`Failed to write upload meta: ${err.message}\n`)
      }
    })

    return {
      upload_id: uploadId,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      filename: resolvedFilename,
      renamed,
    }
  }

  private buildTargetPath(targetDir: string, filename: string): { finalPath: string; filename: string; renamed: boolean } {
    let targetPath = path.join(targetDir, filename)
    let renamed = false
    if (fs.existsSync(targetPath)) {
      const ext = path.extname(filename)
      const name = path.basename(filename, ext)
      let counter = 1
      while (fs.existsSync(targetPath)) {
        filename = `${name}_${counter}${ext}`
        targetPath = path.join(targetDir, filename)
        counter++
      }
      renamed = true
    }
    return { finalPath: targetPath, filename, renamed }
  }

  private chunkPaths(uploadId: string): { uploadDir: string; metaPath: string } {
    const uploadDir = path.join(this.ensureTmpDir(), uploadId)
    const metaPath = path.join(uploadDir, 'meta.json')
    return { uploadDir, metaPath }
  }

  saveChunk(uploadId: string, index: number, stream: ReadableStream<Uint8Array>, ip: string): Promise<void> {
    const { uploadDir, metaPath } = this.chunkPaths(uploadId)
    if (!fs.existsSync(metaPath)) {
      throw new Error('upload not found')
    }

    const chunkPath = path.join(uploadDir, `chunk_${String(index).padStart(8, '0')}.part`)
    const writeStream = fs.createWriteStream(chunkPath)

    const reader = stream.getReader()
    const pump = async (): Promise<void> => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writeStream.write(Buffer.from(value))
      }
      writeStream.end()
    }

    return pump().catch((e) => {
      this.fileService.logUpload(ip, 1, `failed (chunk save failed: ${e})`)
      throw new Error('failed to save chunk')
    })
  }

  async completeUpload(uploadId: string, ip: string): Promise<{ filename: string; renamed: boolean }> {
    const { uploadDir, metaPath } = this.chunkPaths(uploadId)
    if (!fs.existsSync(metaPath)) {
      throw new Error('upload not found')
    }

    const meta: UploadMeta = await fs.promises.readFile(metaPath, 'utf-8').then(JSON.parse)
    const totalChunks = meta.total_chunks
    const finalPath = meta.final_path
    const filename = meta.filename
    const relPath = meta.rel_path || ''
    const size = meta.size || 0
    const renamed = meta.renamed

    const missing: number[] = []
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(uploadDir, `chunk_${String(i).padStart(8, '0')}.part`)
      if (!fs.existsSync(chunkPath)) {
        missing.push(i)
        if (missing.length > 20) break
      }
    }
    if (missing.length > 0) {
      throw new Error(`missing chunks: ${missing.slice(0, 20).join(', ')}`)
    }

    try {
      await fs.promises.mkdir(path.dirname(finalPath), { recursive: true })
      await this.mergeChunksWithStreams(uploadDir, totalChunks, finalPath)
    } catch (e) {
      this.fileService.logUpload(ip, 1, `failed (merge failed: ${e})`, relPath, size)
      throw new Error('failed to merge file')
    }

    this.abortUpload(uploadId)
    this.fileService.logUpload(ip, 1, `success (${filename})`, relPath, size)
    return { filename, renamed }
  }

  private mergeChunksWithStreams(uploadDir: string, totalChunks: number, finalPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const outStream = fs.createWriteStream(finalPath)

      let currentIndex = 0

      const processNextChunk = () => {
        if (currentIndex >= totalChunks) {
          outStream.end()
          return
        }

        const chunkPath = path.join(uploadDir, `chunk_${String(currentIndex).padStart(8, '0')}.part`)
        const inStream = fs.createReadStream(chunkPath)

        inStream.on('data', (chunk) => {
          if (!outStream.write(chunk)) {
            inStream.pause()
            outStream.once('drain', () => {
              inStream.resume()
            })
          }
        })

        inStream.on('end', () => {
          currentIndex++
          processNextChunk()
        })

        inStream.on('error', (err) => {
          outStream.destroy(err)
          reject(err)
        })
      }

      outStream.on('finish', () => {
        resolve()
      })

      outStream.on('error', (err) => {
        reject(err)
      })

      processNextChunk()
    })
  }

  abortUpload(uploadId: string): void {
    const { uploadDir } = this.chunkPaths(uploadId)
    if (!fs.existsSync(uploadDir)) return
    fs.rmSync(uploadDir, { recursive: true, force: true })
  }
}