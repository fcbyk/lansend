import type { Context } from 'hono'

export function success<T>(c: Context, data: T, message = 'success') {
  return c.json({ code: 200, message, data }, 200)
}

export function error(c: Context, message = 'error', code = 400, data: unknown = null) {
  return c.json({ code, message, data }, code as 200)
}