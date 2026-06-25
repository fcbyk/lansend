import fs from 'node:fs'
import path from 'node:path'
import type { LansendConfig } from '../utils/config.js'

export interface DirectoryItem {
  name: string
  path: string
  is_dir: boolean
  children?: DirectoryItem[]
}

export interface PathPart {
  name: string
  path: string
}

export interface DirectoryListing {
  share_name: string
  relative_path: string
  path_parts: PathPart[]
  items: DirectoryItem[]
  require_password: boolean
}

export interface FileContent {
  content?: string
  is_image?: boolean
  is_video?: boolean
  is_binary?: boolean
  path: string
  name: string
  error?: string
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif',
])

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.ogg', '.mov', '.mkv', '.avi', '.m4v',
])

export class FileShareService {
  constructor(public config: LansendConfig) {}

  static safeFilename(filename: string): string {
    return filename.replace(/[^\w\s\u4e00-\u9fff\-.]/g, '')
  }

  static isImageFile(filename: string): boolean {
    return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase())
  }

  static isVideoFile(filename: string): boolean {
    return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase())
  }

  static formatSize(numBytes: number | null): string {
    if (numBytes === null) return 'unknown size'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = numBytes
    for (let i = 0; i < units.length; i++) {
      if (size < 1024 || i === units.length - 1) {
        return i === 0 ? `${size} B` : `${size.toFixed(2)} ${units[i]}`
      }
      size /= 1024
    }
    return `${size.toFixed(2)} TB`
  }

  static getPathParts(currentPath: string): PathPart[] {
    const parts: PathPart[] = []
    if (currentPath) {
      let current = ''
      for (const part of currentPath.split('/')) {
        if (part) {
          current = current ? `${current}/${part}` : part
          parts.push({ name: part, path: current })
        }
      }
    }
    return parts
  }

  logUpload(ip: string, fileCount: number, status: string, relPath = '', fileSize: number | null = null): void {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const pathStr = relPath ? `/${relPath}` : '/'
    const sizeStr = FileShareService.formatSize(fileSize)
    const logMsg = ` [${ts}] ${ip} upload ${fileCount} file(s), status: ${status}, path: ${pathStr}, size: ${sizeStr}\n`
    process.stderr.write(logMsg)
  }

  ensureSharedDirectory(): string {
    if (!this.config.sharedDirectory) {
      throw new Error('shared directory not set')
    }
    return this.config.sharedDirectory
  }

  absTargetDir(relPath: string): string {
    const base = this.ensureSharedDirectory()
    const cleaned = (relPath || '').replace(/^\/+|\/+$/g, '')
    const targetDir = path.resolve(base, cleaned)
    const baseAbs = path.resolve(base)
    if (!targetDir.startsWith(baseAbs + path.sep) && targetDir !== baseAbs) {
      throw new Error('invalid path')
    }
    return targetDir
  }

  getFileTree(basePath: string, relativePath = ''): DirectoryItem[] {
    const currentPath = relativePath ? path.join(basePath, relativePath) : basePath
    const items: DirectoryItem[] = []

    if (!fs.existsSync(currentPath) || !fs.statSync(currentPath).isDirectory()) {
      return items
    }

    for (const name of fs.readdirSync(currentPath)) {
      const fullPath = path.join(currentPath, name)
      const itemPath = relativePath ? path.posix.join(relativePath, name) : name
      const isDir = fs.statSync(fullPath).isDirectory()
      const item: DirectoryItem = {
        name,
        path: itemPath.replace(/\\/g, '/'),
        is_dir: isDir,
      }
      if (isDir) {
        item.children = this.getFileTree(basePath, itemPath)
      }
      items.push(item)
    }

    items.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
    return items
  }

  getDirectoryListing(relativePath = ''): DirectoryListing {
    const base = this.ensureSharedDirectory()
    const cleaned = (relativePath || '').replace(/^\/+|\/+$/g, '')
    const currentPath = cleaned ? path.join(base, cleaned) : base

    if (!fs.existsSync(currentPath) || !fs.statSync(currentPath).isDirectory()) {
      throw new Error('Directory not found')
    }

    const items: DirectoryItem[] = []
    for (const name of fs.readdirSync(currentPath)) {
      const fullPath = path.join(currentPath, name)
      const itemPath = cleaned ? path.posix.join(cleaned, name) : name
      items.push({
        name,
        path: itemPath.replace(/\\/g, '/'),
        is_dir: fs.statSync(fullPath).isDirectory(),
      })
    }
    items.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })

    const shareName = path.basename(base) || base.replace(/[\\/]+$/, '') || base
    return {
      share_name: shareName,
      relative_path: cleaned,
      path_parts: FileShareService.getPathParts(cleaned),
      items,
      require_password: !!this.config.uploadPassword,
    }
  }

  resolveFilePath(filename: string): string {
    const base = this.ensureSharedDirectory()
    const normalized = (filename || '').replace(/\//g, path.sep)
    const filePath = path.resolve(base, normalized)
    const baseAbs = path.resolve(base)
    if (!filePath.startsWith(baseAbs + path.sep) && filePath !== baseAbs) {
      throw new Error('Invalid path')
    }
    return filePath
  }

  readFileContent(relativePath: string): FileContent {
    const filePath = this.resolveFilePath(relativePath)

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      throw new Error('File not found')
    }

    const rawName = path.basename(relativePath)
    const lowerName = rawName.toLowerCase()

    if (FileShareService.isImageFile(lowerName)) {
      return { is_image: true, path: relativePath, name: rawName }
    }

    if (FileShareService.isVideoFile(lowerName)) {
      return { is_video: true, path: relativePath, name: rawName }
    }

    const maxPreviewBytes = 2 * 1024 * 1024
    const fileSize = fs.statSync(filePath).size

    if (fileSize > maxPreviewBytes) {
      return { is_binary: true, path: relativePath, name: rawName, error: '文件过大，超过 2MB，建议在浏览器打开' }
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      if (content.length > maxPreviewBytes) {
        return { is_binary: true, path: relativePath, name: rawName, error: '文件过大，超过 2MB，建议在浏览器打开' }
      }
      return { content, path: relativePath, name: rawName }
    } catch {
      return { is_binary: true, path: relativePath, name: rawName, error: '二进制文件无法预览，建议在浏览器打开' }
    }
  }
}