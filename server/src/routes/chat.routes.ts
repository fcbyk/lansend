import type { Context } from 'hono'
import { success, error } from '../utils/response.js'
import { ChatService } from '../services/chat.service.js'

function getClientIp(c: Context): string {
  const xff = c.req.header('X-Forwarded-For')
  if (xff) {
    return xff.split(',')[0].trim()
  }
  return 'unknown'
}

export function registerRoutes(app: import('hono').Hono, service: ChatService) {
  app.get('/api/chat/messages', (c) => {
    return success(c, {
      messages: service.listMessages(),
      current_ip: getClientIp(c),
    })
  })

  app.post('/api/chat/send', async (c) => {
    const body = await c.req.json()
    if (!body || !('message' in body)) {
      return error(c, 'message is required', 400)
    }

    const messageText = (body.message || '').trimEnd()
    if (!messageText) {
      return error(c, 'message cannot be empty', 400)
    }

    const message = service.sendMessage(getClientIp(c), messageText)
    return success(c, message, 'message sent')
  })
}