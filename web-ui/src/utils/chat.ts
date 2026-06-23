import type { ChatMessage } from '../types'

export function formatTimeLabel(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    const diffDays = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return `昨天 ${date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    } else if (diffDays < 7) {
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      return `星期${weekdays[date.getDay()]} ${date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    } else {
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  } catch {
    return timestamp
  }
}

export function shouldShowTimeLabel(messages: ChatMessage[], msg: ChatMessage, index: number): boolean {
  if (index === 0) return true

  try {
    const currentTime = new Date(msg.timestamp).getTime()
    const prevTime = new Date(messages[index - 1].timestamp).getTime()
    const diffMinutes = (currentTime - prevTime) / (1000 * 60)
    return diffMinutes > 5
  } catch {
    return false
  }
}

export function getAvatarText(ip: string): string {
  const parts = ip.split('.')
  if (parts.length === 4) {
    const lastPart = parts[3]
    if (lastPart.length >= 2) {
      return lastPart.slice(-2)
    } else {
      return lastPart
    }
  }
  return ip.slice(-2) || '?'
}
