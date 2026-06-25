import type {
  ApiResponse,
  ChatMessage,
  ChatMessagesResponse,
  DirectoryData,
  LansendConfig,
  PreviewFile,
  UploadFileResponse,
  VerifyUploadPasswordResponse,
} from './types'
import { sleep } from './utils/time'

/**
 * 获取配置信息
 */
export async function getLansendConfig(): Promise<LansendConfig> {
  const response = await fetch('/api/config')
  const result: ApiResponse<LansendConfig> = await response.json()
  if (!response.ok || result.code !== 200) {
    throw new Error(result.message || 'Failed to load config')
  }
  return result.data
}

/**
 * 获取目录数据
 */
export async function getDirectory(path: string = ''): Promise<DirectoryData> {
  const response = await fetch(`/api/directory?path=${encodeURIComponent(path)}`)
  const result: ApiResponse<DirectoryData> = await response.json()
  if (!response.ok || result.code !== 200) {
    throw new Error(result.message || 'Failed to load directory')
  }
  return result.data
}

export async function downloadZip(paths: string[]): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch('/api/download-zip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paths }),
  })

  const contentType = response.headers.get('Content-Type') || ''
  if (!response.ok || contentType.includes('application/json')) {
    const result: ApiResponse = await response.json().catch(() => ({}))
    throw new Error(result?.message || 'download failed')
  }

  const disposition = response.headers.get('Content-Disposition') || ''
  let filename = 'download.zip'
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
  if (match?.[1]) {
    filename = decodeURIComponent(match[1])
  } else if (match?.[2]) {
    filename = match[2]
  }

  const blob = await response.blob()
  return { blob, filename }
}

/**
 * 验证上传密码
 */
export async function verifyUploadPassword(password: string): Promise<VerifyUploadPasswordResponse> {
  try {
    const response = await fetch('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `password=${encodeURIComponent(password)}`,
    })

    const result: ApiResponse = await response.json()

    if (!response.ok || result.code !== 200) {
      return { success: false, error: result.message || '密码错误，请重试' }
    }

    return { success: true }
  } catch (error) {
    console.error('验证错误:', error)
    return { success: false, error: '验证失败，请重试' }
  }
}

/**
 * 获取文件内容（用于预览）
 */
export async function getFileContent(path: string): Promise<PreviewFile> {
  const response = await fetch(`/api/file/${encodeURIComponent(path)}`)
  const result: ApiResponse<PreviewFile> = await response.json()
  if (!response.ok || result.code !== 200) {
    throw new Error(result.message || 'Failed to load file')
  }
  return result.data
}

/**
 * 上传文件
 */
export function uploadFile(
  file: File,
  path: string,
  password: string | null,
  onProgress: (progress: number, meta?: { loaded: number; total: number }) => void,
  onCancel?: (cancelFn: () => void) => void,
): Promise<UploadFileResponse<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const safeOnProgress = (progress: number, meta?: { loaded: number; total: number }) => {
      try {
        onProgress(progress, meta)
      } catch (error) {
        console.error('upload progress callback failed:', error)
      }
    }

    safeOnProgress(0, { loaded: 0, total: file.size })
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    formData.append('size', file.size.toString())
    if (password) {
      formData.append('password', password)
    }

    const xhr = new XMLHttpRequest()

    if (onCancel) {
      onCancel(() => {
        xhr.abort()
        resolve({ success: false, error: 'cancelled' })
      })
    }

    xhr.upload.addEventListener('progress', (e) => {
      const total = file.size || (e.lengthComputable && e.total > 0 ? e.total : 0)
      const loaded = Math.min(e.loaded, total || e.loaded)
      const progress = total === 0 ? 100 : (loaded / total) * 100
      safeOnProgress(Math.min(99.9, Math.max(0, progress)), { loaded, total })
    })

    xhr.addEventListener('load', () => {
      safeOnProgress(100, { loaded: file.size, total: file.size })
      if (xhr.status === 200) {
        try {
          const result: ApiResponse<Record<string, unknown>> = JSON.parse(xhr.responseText)
          if (result.code !== 200) {
            resolve({ success: false, error: result.message, data: result.data })
          } else {
            resolve({ success: true, data: result.data })
          }
        } catch {
          reject(new Error('解析响应错误'))
        }
      } else {
        reject(new Error(`上传错误: ${xhr.status} ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('上传错误'))
    })

    xhr.open('POST', '/upload')
    xhr.send(formData)
  })
}

/**
 * 备用接口
 * 分片上传文件（避免 4GB 单请求体触发服务端/WSGI 限制）
 */
export async function uploadFileByChunks(
  file: File,
  path: string,
  password: string | null,
  onProgress: (progress: number) => void,
  options?: {
    chunkSize?: number
    concurrency?: number
    retry?: number
    retryDelayMs?: number
  },
): Promise<UploadFileResponse<Record<string, unknown>>> {
  const chunkSize = options?.chunkSize ?? 8 * 1024 * 1024
  const concurrency = Math.max(1, options?.concurrency ?? 3)
  const retry = Math.max(0, options?.retry ?? 2)
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 300)

  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))

  const initForm = new FormData()
  initForm.append('filename', file.name)
  initForm.append('size', file.size.toString())
  initForm.append('path', path)
  initForm.append('chunk_size', chunkSize.toString())
  initForm.append('total_chunks', totalChunks.toString())
  if (password) initForm.append('password', password)

  const initResp = await fetch('/api/upload/init', {
    method: 'POST',
    body: initForm,
    headers: password ? { 'X-Upload-Password': password } : undefined,
  })
  const initResult: ApiResponse<{ upload_id?: string }> = await initResp.json().catch(() => ({
    code: 500,
    message: '',
    data: {},
  }))
  if (!initResp.ok || initResult.code !== 200) {
    return { success: false, error: initResult?.message || 'upload init failed', data: initResult?.data }
  }

  const uploadId = initResult.data?.upload_id
  if (!uploadId) {
    return { success: false, error: 'missing upload_id', data: initResult.data }
  }
  const resolvedUploadId = uploadId

  let uploadedBytes = 0
  const chunkUploaded = new Array(totalChunks).fill(false)

  const report = () => {
    const progress = file.size === 0 ? 100 : (uploadedBytes / file.size) * 100
    onProgress(Math.min(100, Math.max(0, progress)))
  }

  async function putChunk(index: number) {
    const start = index * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const blob = file.slice(start, end)

    let attempt = 0
    while (true) {
      try {
        const resp = await fetch(
          `/api/upload/chunk?upload_id=${encodeURIComponent(resolvedUploadId)}&index=${index}`,
          {
          method: 'POST',
          body: blob,
          headers: {
            'Content-Type': 'application/octet-stream',
            ...(password ? { 'X-Upload-Password': password } : {}),
          },
          },
        )
        const result: ApiResponse = await resp.json().catch(() => ({
          code: 500,
          message: '',
          data: null,
        }))
        if (!resp.ok || result.code !== 200) {
          throw new Error(result?.message || `chunk ${index} failed`)
        }

        if (!chunkUploaded[index]) {
          chunkUploaded[index] = true
          uploadedBytes += end - start
          report()
        }
        return
      } catch (error) {
        if (attempt >= retry) throw error
        attempt++
        await sleep(retryDelayMs)
      }
    }
  }

  let nextIndex = 0
  const workers: Promise<void>[] = []
  for (let worker = 0; worker < concurrency; worker++) {
    workers.push(
      (async () => {
        while (true) {
          const index = nextIndex
          nextIndex++
          if (index >= totalChunks) return
          await putChunk(index)
        }
      })(),
    )
  }

  try {
    report()
    await Promise.all(workers)
  } catch (error) {
    try {
      await fetch('/api/upload/abort', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(password ? { 'X-Upload-Password': password } : {}),
        },
        body: JSON.stringify({ upload_id: resolvedUploadId }),
      })
    } catch {
      // ignore
    }
    return { success: false, error: error instanceof Error ? error.message : 'upload failed' }
  }

  const completeResp = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(password ? { 'X-Upload-Password': password } : {}),
    },
    body: JSON.stringify({ upload_id: resolvedUploadId }),
  })

  const completeResult: ApiResponse<Record<string, unknown>> = await completeResp.json().catch(() => ({
    code: 500,
    message: '',
    data: {},
  }))
  if (!completeResp.ok || completeResult.code !== 200) {
    return { success: false, error: completeResult?.message || 'upload complete failed', data: completeResult?.data }
  }

  return { success: true, data: completeResult.data }
}

/**
 * 获取聊天消息列表
 */
export async function getChatMessages(): Promise<ChatMessagesResponse> {
  const response = await fetch('/api/chat/messages')
  const result: ApiResponse<ChatMessagesResponse> = await response.json()
  if (!response.ok || result.code !== 200) {
    throw new Error(result.message || 'Failed to load chat messages')
  }
  return result.data
}

/** 下载/上传测速单项最长耗时（毫秒） */
export const SPEED_TEST_DURATION_MS = 5000

/**
 * 测速 - Ping
 */
export async function pingTest(): Promise<number> {
  const start = Date.now()
  await fetch('/api/config')
  return Date.now() - start
}

function resolveTimedSpeed(
  bytesLoaded: number,
  startTime: number,
  speeds: number[],
): number {
  const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.001)
  if (speeds.length > 0) {
    return speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length
  }
  return bytesLoaded / elapsedSec
}

/**
 * 测速 - 下载（最多 maxDurationMs，到点 abort；传完提前结束）
 */
export function downloadSpeedTest(
  sizeMb: number = 50,
  onProgress: (progress: number, speed: number) => void,
  maxDurationMs: number = SPEED_TEST_DURATION_MS,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const startTime = Date.now()
    let lastTime = startTime
    let lastLoaded = 0
    let bytesLoaded = 0
    let lastInstantSpeed = 0
    const speeds: number[] = []
    let settled = false
    let timedOut = false

    const reportProgress = (instantSpeed?: number) => {
      if (instantSpeed !== undefined) {
        lastInstantSpeed = instantSpeed
      }
      const elapsed = Date.now() - startTime
      const progress = Math.min(100, (elapsed / maxDurationMs) * 100)
      onProgress(progress, lastInstantSpeed)
    }

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(durationTimer)
      clearInterval(progressTimer)
      reportProgress()
      onProgress(100, lastInstantSpeed)
      resolve(resolveTimedSpeed(bytesLoaded, startTime, speeds))
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      clearTimeout(durationTimer)
      clearInterval(progressTimer)
      xhr.abort()
      reject(new Error(message))
    }

    xhr.open('GET', `/api/speedtest/download?size=${sizeMb}&t=${startTime}`)

    xhr.onprogress = (e) => {
      bytesLoaded = e.loaded
      const now = Date.now()
      const duration = (now - lastTime) / 1000
      if (duration >= 0.2) {
        const chunkLoaded = e.loaded - lastLoaded
        const instantSpeed = chunkLoaded / duration

        if (now - startTime > 500) {
          speeds.push(instantSpeed)
        }

        reportProgress(instantSpeed)
        lastTime = now
        lastLoaded = e.loaded
      }
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4 || settled) return
      if (xhr.status === 200 || timedOut) {
        finish()
        return
      }
      fail(`Download failed with status ${xhr.status}`)
    }

    xhr.onerror = () => {
      if (timedOut || settled) return
      fail('Network error during download test')
    }

    const durationTimer = setTimeout(() => {
      timedOut = true
      xhr.abort()
    }, maxDurationMs)

    const progressTimer = setInterval(() => {
      if (!settled) reportProgress()
    }, 100)

    xhr.send()
  })
}

/**
 * 测速 - 上传（最多 maxDurationMs，到点 abort；传完提前结束）
 */
export function uploadSpeedTest(
  sizeMb: number = 30,
  onProgress: (progress: number, speed: number) => void,
  maxDurationMs: number = SPEED_TEST_DURATION_MS,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const data = new Uint8Array(sizeMb * 1024 * 1024)
    for (let index = 0; index < 1024; index++) data[index] = Math.floor(Math.random() * 256)
    const blob = new Blob([data], { type: 'application/octet-stream' })

    const xhr = new XMLHttpRequest()
    const startTime = Date.now()
    let lastTime = startTime
    let lastLoaded = 0
    let bytesLoaded = 0
    let lastInstantSpeed = 0
    const speeds: number[] = []
    let settled = false
    let timedOut = false

    const reportProgress = (instantSpeed?: number) => {
      if (instantSpeed !== undefined) {
        lastInstantSpeed = instantSpeed
      }
      const elapsed = Date.now() - startTime
      const progress = Math.min(100, (elapsed / maxDurationMs) * 100)
      onProgress(progress, lastInstantSpeed)
    }

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(durationTimer)
      clearInterval(progressTimer)
      reportProgress()
      onProgress(100, lastInstantSpeed)
      resolve(resolveTimedSpeed(bytesLoaded, startTime, speeds))
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      clearTimeout(durationTimer)
      clearInterval(progressTimer)
      xhr.abort()
      reject(new Error(message))
    }

    xhr.open('POST', `/api/speedtest/upload?t=${startTime}`)

    xhr.upload.onprogress = (e) => {
      bytesLoaded = e.loaded
      const now = Date.now()
      const duration = (now - lastTime) / 1000
      if (duration >= 0.2) {
        const chunkLoaded = e.loaded - lastLoaded
        const instantSpeed = chunkLoaded / duration

        if (now - startTime > 500) {
          speeds.push(instantSpeed)
        }

        reportProgress(instantSpeed)
        lastTime = now
        lastLoaded = e.loaded
      }
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4 || settled) return
      if (xhr.status === 200 || timedOut) {
        finish()
        return
      }
      fail(`Upload failed with status ${xhr.status}`)
    }

    xhr.onerror = () => {
      if (timedOut || settled) return
      fail('Network error during upload test')
    }

    const durationTimer = setTimeout(() => {
      timedOut = true
      xhr.abort()
    }, maxDurationMs)

    const progressTimer = setInterval(() => {
      if (!settled) reportProgress()
    }, 100)

    xhr.send(blob)
  })
}

/**
 * 发送聊天消息
 */
export async function sendChatMessage(message: string): Promise<{ success: boolean; message: ChatMessage }> {
  const response = await fetch('/api/chat/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })
  const result: ApiResponse<ChatMessage> = await response.json()
  if (!response.ok || result.code !== 200) {
    throw new Error(result.message || 'Failed to send message')
  }
  return { success: true, message: result.data }
}
