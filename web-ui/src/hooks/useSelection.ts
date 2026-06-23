import { useState, useCallback, useMemo } from 'react'
import { downloadZip } from '../api'
import type { DirectoryItem } from '../types'

export function useSelection() {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set())

  // 对外暴露为数组，保持 API 兼容
  const selectedPaths = useMemo(() => Array.from(selectedSet), [selectedSet])

  const isSelected = useCallback((path: string) => selectedSet.has(path), [selectedSet])

  const toggleSelectMode = useCallback(() => {
    setSelectionMode((prev) => {
      const next = !prev
      if (!next) setSelectedSet(new Set())
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedSet(new Set())
  }, [])

  const toggleItemSelect = useCallback((item: DirectoryItem) => {
    const path = item.path
    if (!path) return
    setSelectedSet((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleDownloadSelected = useCallback(async () => {
    if (selectedSet.size === 0) return
    try {
      const paths = Array.from(selectedSet)
      const { blob, filename } = await downloadZip(paths)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      clearSelection()
    } catch (e) {
      console.error('download zip failed', e)
    }
  }, [selectedSet, clearSelection])

  const handleDownloadSelectedFiles = useCallback(
    (items: DirectoryItem[]) => {
      const filePaths = items
        .filter((item) => !item.is_dir && selectedSet.has(item.path))
        .map((item) => item.path)
      if (filePaths.length === 0) return
      filePaths.forEach((path) => {
        const link = document.createElement('a')
        link.href = `/api/download/${path}`
        link.download = ''
        document.body.appendChild(link)
        link.click()
        link.remove()
      })
    },
    [selectedSet],
  )

  return {
    selectionMode,
    selectedPaths,
    isSelected,
    toggleSelectMode,
    clearSelection,
    toggleItemSelect,
    handleDownloadSelected,
    handleDownloadSelectedFiles,
  }
}
