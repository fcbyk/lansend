import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { uploadFile, verifyUploadPassword } from '../api'
import { formatFileSize } from '../utils/files'
import { formatDurationCompact } from '../utils/time'
import type { UploadQueueParams, UploadTask } from '../types'

const PASSWORD_KEY = 'lansendUploadPassword'

// Fallback UUID generator for environments where crypto.randomUUID is not available
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function hasActiveTasks(tasks: UploadTask[]) {
  return tasks.some((task) => task.status === 'uploading' || task.status === 'pending')
}

function sumTaskBytes(tasks: UploadTask[], key: 'loaded' | 'total') {
  return tasks.reduce((sum, task) => sum + task[key], 0)
}

export function useLansendUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const [completeInfo, setCompleteInfo] = useState('')
  const [showCompleteInfoFlag, setShowCompleteInfoFlag] = useState(false)
  const [uploadSpeedBytesPerSec, setUploadSpeedBytesPerSec] = useState(0)

  // renderTick: a counter used to trigger re-renders when task ref is mutated.
  // tasksRef is the single source of truth for the upload task list.
  const [renderTick, forceRender] = useReducer((x: number) => x + 1, 0)
  const tasksRef = useRef<UploadTask[]>([])
  const completeInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const renamedFilesRef = useRef<string[]>([])
  const lastTickAtMsRef = useRef<number | null>(null)
  const lastUploadedTotalBytesRef = useRef(0)
  const processingPromiseRef = useRef<Promise<void> | null>(null)

  const updateUploadTasks = useCallback((updater: (prev: UploadTask[]) => UploadTask[]) => {
    tasksRef.current = updater(tasksRef.current)
    forceRender()
  }, [])

  useEffect(() => {
    return () => {
      if (completeInfoTimerRef.current) {
        clearTimeout(completeInfoTimerRef.current)
      }
    }
  }, [])

  const canUpload = useMemo(() => isPasswordVerified, [isPasswordVerified])

  const showProgress = useMemo(() => hasActiveTasks(tasksRef.current), [renderTick])

  const queueLength = useMemo(
    () => tasksRef.current.filter((task) => task.status === 'pending').length,
    [renderTick],
  )

  const totalBytes = useMemo(() => sumTaskBytes(tasksRef.current, 'total'), [renderTick])
  const uploadedBytes = useMemo(() => sumTaskBytes(tasksRef.current, 'loaded'), [renderTick])

  const overallProgress = useMemo(() => {
    if (totalBytes === 0) return 0
    const progress = (uploadedBytes / totalBytes) * 100
    return Math.min(100, Math.max(0, progress))
  }, [totalBytes, uploadedBytes])

  const uploadHint = useMemo(
    () => (isUploading ? '上传中...可继续拖拽文件添加到队列' : '拖拽文件到此处或点击选择文件'),
    [isUploading],
  )

  const remainingBytes = useMemo(() => Math.max(0, totalBytes - uploadedBytes), [totalBytes, uploadedBytes])

  const etaSeconds = useMemo(() => {
    if (!isUploading || uploadSpeedBytesPerSec <= 0) return null
    return Math.ceil(remainingBytes / uploadSpeedBytesPerSec)
  }, [isUploading, remainingBytes, uploadSpeedBytesPerSec])

  const uploadStatsText = useMemo(() => {
    if (!showProgress) return ''

    const parts: string[] = []
    if (totalBytes > 0) parts.push(`总 ${formatFileSize(totalBytes)}`)
    if (remainingBytes > 0) parts.push(`剩余 ${formatFileSize(remainingBytes)}`)
    if (isUploading && uploadSpeedBytesPerSec > 0) parts.push(`速度 ${formatFileSize(uploadSpeedBytesPerSec)}/s`)
    if (isUploading && etaSeconds != null) parts.push(`预计 ${formatDurationCompact(etaSeconds)}`)
    return parts.join(' · ')
  }, [etaSeconds, isUploading, remainingBytes, showProgress, totalBytes, uploadSpeedBytesPerSec])

  const uploadStatus = useMemo(() => {
    const currentTask = tasksRef.current.find((task) => task.status === 'uploading')
    if (!currentTask) return ''

    const uploadedSize = formatFileSize(currentTask.loaded)
    const totalSize = formatFileSize(currentTask.total)
    return `正在上传: ${currentTask.file.name} (${uploadedSize} / ${totalSize}) - ${Math.round(currentTask.progress)}%`
  }, [renderTick])

  const closeCompleteInfo = useCallback(() => {
    setShowCompleteInfoFlag(false)
    setCompleteInfo('')
    if (completeInfoTimerRef.current) {
      clearTimeout(completeInfoTimerRef.current)
      completeInfoTimerRef.current = null
    }
  }, [])

  const showCompleteInfo = useCallback(
    (renamed: number) => {
      if (completeInfoTimerRef.current) {
        clearTimeout(completeInfoTimerRef.current)
        completeInfoTimerRef.current = null
      }

      setShowCompleteInfoFlag(true)
      setCompleteInfo(renamed > 0 ? `${renamed} 个文件因重名已自动重命名` : '')

      completeInfoTimerRef.current = setTimeout(() => {
        closeCompleteInfo()
      }, 15000)
    },
    [closeCompleteInfo],
  )

  const verifyPassword = useCallback(async (passwordToVerify: string, isAuto = false) => {
    if (!passwordToVerify.trim()) {
      if (!isAuto) setPasswordError('请输入密码')
      return false
    }

    setPasswordError('')

    const result = await verifyUploadPassword(passwordToVerify)
    if (result.success) {
      setIsPasswordVerified(true)
      setPassword(passwordToVerify)
      sessionStorage.setItem(PASSWORD_KEY, passwordToVerify)
      return true
    }

    setPasswordError(result.error || '密码错误，请重试')
    sessionStorage.removeItem(PASSWORD_KEY)
    setIsPasswordVerified(false)
    return false
  }, [])

  const restorePasswordFromSession = useCallback(() => {
    const storedPassword = sessionStorage.getItem(PASSWORD_KEY)
    if (storedPassword) {
      setPassword(storedPassword)
      return storedPassword
    }
    return null
  }, [])

  const resetUploadState = useCallback(() => {
    setIsUploading(false)
    setIsDragOver(false)
    updateUploadTasks(() => [])
    renamedFilesRef.current = []
  }, [updateUploadTasks])

  const enqueueFiles = useCallback(
    (files: File[], targetPath: string) => {
      if (files.length === 0) return

      const newTasks: UploadTask[] = files.map((file) => ({
        id: generateId(),
        file,
        status: 'pending',
        progress: 0,
        loaded: 0,
        total: file.size,
        targetPath,
      }))

      updateUploadTasks((prev) => [...prev, ...newTasks])
    },
    [updateUploadTasks],
  )

  const cancelTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((item) => item.id === taskId)
      if (!task) return

      if (task.status === 'uploading' && task.cancel) {
        task.cancel()
      }

      updateUploadTasks((prev) => {
        const next = prev.filter((item) => item.id !== taskId)
        if (!hasActiveTasks(next)) {
          setIsUploading(false)
        }
        return next
      })
    },
    [updateUploadTasks],
  )

  const clearTasksByPath = useCallback(
    (path: string) => {
      const target = path || '/'

      tasksRef.current.forEach((task) => {
        if ((task.targetPath || '/') === target && task.status === 'uploading' && task.cancel) {
          task.cancel()
        }
      })

      updateUploadTasks((prev) => {
        const next = prev.filter((task) => (task.targetPath || '/') !== target)
        if (!hasActiveTasks(next)) {
          setIsUploading(false)
        }
        return next
      })
    },
    [updateUploadTasks],
  )

  const clearAllTasks = useCallback(() => {
    updateUploadTasks((prev) => {
      const next = prev.filter((task) => task.status === 'uploading' || task.status === 'pending')
      if (!hasActiveTasks(next)) {
        setIsUploading(false)
      }
      return next
    })
  }, [updateUploadTasks])

  const processUploadQueue = useCallback(
    async (params: UploadQueueParams) => {
      if (processingPromiseRef.current) return processingPromiseRef.current

      processingPromiseRef.current = (async () => {
        setShowCompleteInfoFlag(false)
        setIsUploading(true)

        lastTickAtMsRef.current = Date.now()
        lastUploadedTotalBytesRef.current = sumTaskBytes(tasksRef.current, 'loaded')
        setUploadSpeedBytesPerSec(0)

        while (true) {
          const task = tasksRef.current.find((item) => item.status === 'pending')
          if (!task) break

          updateUploadTasks((prev) =>
            prev.map((item) =>
              item.id === task.id
                ? {
                    ...item,
                    status: 'uploading',
                  }
                : item,
            ),
          )

          try {
            const result = await uploadFile(
              task.file,
              task.targetPath,
              params.requirePassword ? params.getPassword() : null,
              (progress, meta) => {
                updateUploadTasks((prev) => {
                  const next = prev.map((item) => {
                    if (item.id !== task.id) return item

                    return {
                      ...item,
                      progress,
                      loaded: meta ? meta.loaded : (item.file.size * progress) / 100,
                      total: meta ? meta.total : item.total,
                    }
                  })

                  const currentNow = Date.now()
                  if (lastTickAtMsRef.current && currentNow - lastTickAtMsRef.current >= 800) {
                    const currentUploaded = sumTaskBytes(next, 'loaded')
                    const deltaBytes = currentUploaded - lastUploadedTotalBytesRef.current
                    const deltaSec = (currentNow - lastTickAtMsRef.current) / 1000

                    if (deltaSec > 0 && deltaBytes >= 0) {
                      const instant = deltaBytes / deltaSec
                      setUploadSpeedBytesPerSec((prevSpeed) => (prevSpeed > 0 ? prevSpeed * 0.7 + instant * 0.3 : instant))
                    }

                    lastTickAtMsRef.current = currentNow
                    lastUploadedTotalBytesRef.current = currentUploaded
                  }

                  return next
                })
              },
              (cancelFn) => {
                updateUploadTasks((prev) =>
                  prev.map((item) =>
                    item.id === task.id
                      ? {
                          ...item,
                          cancel: cancelFn,
                        }
                      : item,
                  ),
                )
              },
            )

            if (!result.success) {
              if (result.error === 'wrong password') {
                setIsPasswordVerified(false)
                setIsUploading(false)
                setPasswordError('密码错误，请重试')
                sessionStorage.removeItem(PASSWORD_KEY)
                params.onWrongPassword?.()
                return
              }

              if (result.error === 'upload password required') {
                setIsPasswordVerified(false)
                setIsUploading(false)
                return
              }

              updateUploadTasks((prev) =>
                prev.map((item) =>
                  item.id === task.id
                    ? {
                        ...item,
                        status: 'error',
                        error: result.error || '上传失败',
                      }
                    : item,
                ),
              )
              continue
            }

            updateUploadTasks((prev) =>
              prev.map((item) =>
                item.id === task.id
                  ? {
                      ...item,
                      status: 'completed',
                      progress: 100,
                      loaded: item.total,
                      completedAt: Date.now(),
                      cancel: undefined,
                    }
                  : item,
              ),
            )

            if (result.data && typeof result.data === 'object') {
              const renamed = result.data.renamed
              const filename = result.data.filename
              if (renamed && typeof filename === 'string') {
                renamedFilesRef.current.push(filename)
              }
            }

            params.onRefresh?.()
          } catch (error) {
            updateUploadTasks((prev) =>
              prev.map((item) =>
                item.id === task.id
                  ? {
                      ...item,
                      status: 'error',
                      error: error instanceof Error ? error.message : '未知错误',
                    }
                  : item,
              ),
            )
          }
        }

        updateUploadTasks((prev) =>
          prev.map((item) =>
            item.status === 'uploading'
              ? {
                  ...item,
                  status: 'completed',
                  progress: 100,
                  loaded: item.total,
                  completedAt: item.completedAt ?? Date.now(),
                  cancel: undefined,
                }
              : item,
          ),
        )

        const renamedCount = renamedFilesRef.current.length

        if (renamedCount > 0) {
          showCompleteInfo(renamedCount)
        } else {
          setShowCompleteInfoFlag(false)
        }

        setIsUploading(false)
        renamedFilesRef.current = []
        setUploadSpeedBytesPerSec(0)
      })().finally(() => {
        processingPromiseRef.current = null
      })

      return processingPromiseRef.current
    },
    [showCompleteInfo, updateUploadTasks],
  )

  return {
    isDragOver,
    setIsDragOver,
    isUploading,
    password,
    setPassword,
    passwordError,
    setPasswordError,
    isPasswordVerified,
    setIsPasswordVerified,
    uploadTasks: tasksRef.current,
    uploadStatsText,
    completeInfo,
    showCompleteInfoFlag,
    canUpload,
    showProgress,
    queueLength,
    overallProgress,
    uploadHint,
    uploadStatus,
    uploadSpeedBytesPerSec,
    verifyPassword,
    restorePasswordFromSession,
    resetUploadState,
    enqueueFiles,
    processUploadQueue,
    cancelTask,
    clearTasksByPath,
    clearAllTasks,
    closeCompleteInfo,
  }
}
