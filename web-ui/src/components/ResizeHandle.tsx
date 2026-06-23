import { memo, useRef, type RefObject } from 'react'

interface ResizeHandleProps {
  mainContainerRef: RefObject<HTMLDivElement | null>
  fileContainerWidth: number
  onResize: (newFileWidth: number) => void
}

export const ResizeHandle = memo(function ResizeHandle({ mainContainerRef, fileContainerWidth, onResize }: ResizeHandleProps) {
  const isResizingRef = useRef(false)
  const resizeStartXRef = useRef(0)
  const resizeStartFileWidthRef = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizingRef.current = true
    resizeStartXRef.current = e.clientX
    resizeStartFileWidthRef.current = fileContainerWidth
    e.preventDefault()

    const handleMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return
      const container = mainContainerRef.current
      if (!container) return
      const deltaX = ev.clientX - resizeStartXRef.current
      const containerRect = container.getBoundingClientRect()
      const newFileWidth = Math.max(
        200,
        Math.min(containerRect.width - 304, resizeStartFileWidthRef.current + deltaX),
      )
      onResize(newFileWidth)
      ev.preventDefault()
    }

    const handleUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    isResizingRef.current = true
    const touch = e.touches[0]
    resizeStartXRef.current = touch.clientX
    resizeStartFileWidthRef.current = fileContainerWidth
    e.preventDefault()

    const handleTouchMove = (ev: TouchEvent) => {
      if (!isResizingRef.current) return
      const container = mainContainerRef.current
      if (!container) return
      const deltaX = ev.touches[0].clientX - resizeStartXRef.current
      const containerRect = container.getBoundingClientRect()
      const newFileWidth = Math.max(
        200,
        Math.min(containerRect.width - 304, resizeStartFileWidthRef.current + deltaX),
      )
      onResize(newFileWidth)
      ev.preventDefault()
    }

    const handleTouchEnd = () => {
      isResizingRef.current = false
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }

    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', handleTouchEnd)
  }

  return (
    <div
      className="hidden md:block w-1 bg-[#e4e7ed] cursor-col-resize flex-none relative transition-colors duration-200 z-10 hover:bg-[#409eff]"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  )
})
