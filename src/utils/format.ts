import { formatFileSize } from './files'

/**
 * 格式化网速（字节/秒 → 可读字符串）
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s'
  return `${formatFileSize(bytesPerSec)}/s`
}

/**
 * 格式化剩余时间（秒 → 中文可读时长）
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.round(seconds)}秒`

  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins < 60) return `${mins}分${secs}秒`

  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}小时${remainingMins}分`
}
