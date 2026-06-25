/**
 * 睡眠函数，结合 async / await 使用
 * @param ms 毫秒数
 * @returns Promise<void> 睡眠后 resolve
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function currentTime(): string {
  return new Date().toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDurationCompact(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
