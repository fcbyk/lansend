import { useCallback, useEffect, useRef, useState } from 'react'

import { getDirectory } from '../api'
import type { DirectoryData, DirectoryItem, PathPart } from '../types'

const PATH_KEY = 'lansendCurrentPath'
const POLL_INTERVAL = 5000

export function useLansendDirectory() {
  const [shareName, setShareName] = useState('')
  const [pathParts, setPathParts] = useState<PathPart[]>([])
  const [items, setItems] = useState<DirectoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requirePassword, setRequirePassword] = useState(false)
  const [currentPath, setCurrentPath] = useState('')

  const currentPathRef = useRef(currentPath)
  const pollTimerRef = useRef<number | null>(null)
  const isPollingRef = useRef(false)
  const visibilityHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    currentPathRef.current = currentPath
  }, [currentPath])

  const loadDirectory = useCallback(async (path: string = '', silent: boolean = false): Promise<DirectoryData | null> => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    setCurrentPath(path)

    try {
      const data = await getDirectory(path)
      setRequirePassword(data.require_password)
      setCurrentPath(data.relative_path)
      setShareName(data.share_name)
      setPathParts(data.path_parts || [])
      setItems(data.items || [])

      sessionStorage.setItem(PATH_KEY, data.relative_path || '')

      return data
    } catch (err) {
      console.error('加载目录失败:', err)
      if (!silent) {
        setError('加载失败，请刷新页面重试')
      }
      return null
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  const restorePathFromSession = useCallback(() => {
    const savedPath = sessionStorage.getItem(PATH_KEY)
    return savedPath !== null ? savedPath : ''
  }, [])

  const stopPolling = useCallback(() => {
    isPollingRef.current = false

    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }

    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current)
      visibilityHandlerRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (isPollingRef.current) return
    isPollingRef.current = true

    const poll = async () => {
      if (!document.hidden && currentPathRef.current !== undefined) {
        await loadDirectory(currentPathRef.current, true)
      }

      if (isPollingRef.current && !document.hidden) {
        pollTimerRef.current = window.setTimeout(poll, POLL_INTERVAL)
      }
    }

    const visibilityHandler = () => {
      if (document.hidden) {
        if (pollTimerRef.current !== null) {
          window.clearTimeout(pollTimerRef.current)
          pollTimerRef.current = null
        }
        return
      }

      if (isPollingRef.current && pollTimerRef.current === null) {
        pollTimerRef.current = window.setTimeout(poll, POLL_INTERVAL)
      }
    }

    visibilityHandlerRef.current = visibilityHandler
    document.addEventListener('visibilitychange', visibilityHandler)
    pollTimerRef.current = window.setTimeout(poll, POLL_INTERVAL)
  }, [loadDirectory])

  useEffect(() => stopPolling, [stopPolling])

  return {
    shareName,
    pathParts,
    items,
    loading,
    error,
    requirePassword,
    currentPath,
    loadDirectory,
    restorePathFromSession,
    startPolling,
    stopPolling,
  }
}
