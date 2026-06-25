import path from 'node:path'
import fs from 'node:fs'
import { Hono } from 'hono'
import { FileShareService } from './services/fileShare.service.js'
import { UploadService } from './services/upload.service.js'
import { ChatService } from './services/chat.service.js'
import { ChatStore } from './services/chat.service.js'
import { registerRoutes as registerFilesRoutes } from './routes/files.routes.js'
import { registerRoutes as registerUploadRoutes } from './routes/upload.routes.js'
import { registerRoutes as registerChatRoutes } from './routes/chat.routes.js'
import { registerRoutes as registerSpeedtestRoutes } from './routes/speedtest.routes.js'
import { success } from './utils/response.js'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

export function createApp(fileService: FileShareService) {
  const app = new Hono()

  const pkgDir = path.dirname(new URL(import.meta.url).pathname)
  const staticDir = pkgDir
  const entryHtml = 'index.html'

  app.get('/assets/*', (c) => {
    const assetPath = c.req.path.replace(/^\/assets\//, '')
    const filePath = path.join(staticDir, 'assets', assetPath)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return c.notFound()
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const content = fs.readFileSync(filePath)
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    })
    return new Response(content, { headers })
  })

  app.get('/api/config', (c) => {
    return success(c, {
      un_download: fileService.config.unDownload,
      un_upload: fileService.config.unUpload,
      chat_enabled: fileService.config.chatEnabled,
    })
  })

  registerFilesRoutes(app, fileService)

  if (!fileService.config.unUpload) {
    registerUploadRoutes(app, new UploadService(fileService))
  }

  if (fileService.config.chatEnabled) {
    registerChatRoutes(app, new ChatService(new ChatStore()))
  }

  registerSpeedtestRoutes(app)

  app.get('/', (c) => {
    const htmlPath = path.join(staticDir, entryHtml)
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8')
      const headers = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      })
      return new Response(html, { headers })
    }
    return c.notFound()
  })

  app.get('/*', (c) => {
    const htmlPath = path.join(staticDir, entryHtml)
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8')
      const headers = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      })
      return new Response(html, { headers })
    }
    return c.notFound()
  })

  return app
}

export async function startWebServer(port: number, fileService: FileShareService, runServer = true) {
  const app = createApp(fileService)
  if (!runServer) return app

  const { serve } = await import('@hono/node-server')
  return new Promise<void>((resolve) => {
    serve(
      { fetch: app.fetch, port, hostname: '0.0.0.0' },
      () => {
        // Server started
      },
    )
  })
}