import { useCallback, useRef } from 'react'
import { extractFilesFromDataTransfer } from '../utils/files'
import type { FileWithSubdir } from '../utils/files'

export function useDragAndDrop(
  canUpload: boolean,
  setIsDragOver: (v: boolean) => void,
  onFilesDrop: (files: FileWithSubdir[]) => void,
) {
  const dragCounterRef = useRef(0)
  // 跟踪 isDragOver 的实际值，避免闭包陈旧问题
  const isDragOverRef = useRef(false)

  // 封装 setIsDragOver，同步更新 ref
  const setDragOver = useCallback(
    (v: boolean) => {
      isDragOverRef.current = v
      setIsDragOver(v)
    },
    [setIsDragOver],
  )

  const resetDragState = useCallback(() => {
    dragCounterRef.current = 0
    setDragOver(false)
  }, [setDragOver])

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!canUpload) {
        resetDragState()
        return
      }
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      // 兜底重同步：dragover 在触发但遮罩没显示 → 状态漂移，强制修复
      if (dragCounterRef.current > 0 && !isDragOverRef.current) {
        setDragOver(true)
      }
    },
    [canUpload, resetDragState, setDragOver],
  )

  const handleDragEnter = useCallback(
    () => {
      if (!canUpload) {
        resetDragState()
        return
      }
      dragCounterRef.current++
      // 上限保护：如果计数器异常增大（>10），重置为 1 防止永久卡住
      if (dragCounterRef.current > 10) {
        dragCounterRef.current = 1
      }
      if (dragCounterRef.current === 1) {
        setDragOver(true)
      }
    },
    [canUpload, resetDragState, setDragOver],
  )

  const handleDragLeave = useCallback(
    () => {
      if (!canUpload) {
        resetDragState()
        return
      }
      dragCounterRef.current--
      // 下限保护：防止减到负数
      if (dragCounterRef.current < 0) {
        dragCounterRef.current = 0
      }
      if (dragCounterRef.current <= 0) {
        resetDragState()
      }
    },
    [canUpload, resetDragState],
  )

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      resetDragState()
      if (!canUpload) return
      e.preventDefault()
      if (e.dataTransfer) {
        const extracted = await extractFilesFromDataTransfer(e)
        if (extracted.length === 0) return
        onFilesDrop(extracted)
      }
    },
    [canUpload, resetDragState, onFilesDrop],
  )

  return {
    dragCounterRef,
    resetDragState,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  }
}
