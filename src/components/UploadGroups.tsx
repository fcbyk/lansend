import { memo, useMemo } from 'react'

import { Check, Layers } from 'lucide-react'

import { formatFileSize } from '../utils/files'
import { useUploadContext } from '../contexts/UploadContext'

interface GlobalUploadStats {
  totalProgress: number
  remainingSize: number
  remainingTimeText: string
  statusText: string
}

interface UploadGroupsProps {
  onShowDetails?: () => void
}

export const UploadGroups = memo(function UploadGroups({
  onShowDetails,
}: UploadGroupsProps) {
  const { uploadTasks, uploadSpeedBytesPerSec, clearAllTasks, closeCompleteInfo } = useUploadContext()

  const globalUploadStats = useMemo<GlobalUploadStats | null>(() => {
    const tasks = uploadTasks || []
    if (tasks.length === 0) return null

    const totalSize = tasks.reduce((sum, t) => sum + t.total, 0)
    const loadedSize = tasks.reduce((sum, t) => sum + t.loaded, 0)
    const totalProgress = totalSize > 0 ? (loadedSize / totalSize) * 100 : 0

    const activeTasks = tasks.filter((t) => t.status === 'uploading' || t.status === 'pending')

    const totalDirSet = new Set<string>()
    tasks.forEach((t) => {
      const p = t.targetPath || '/'
      if (p !== '/') {
        totalDirSet.add(p)
      }
    })
    const totalDirCount = totalDirSet.size
    const totalFileCount = tasks.length

    const activeDirSet = new Set<string>()
    activeTasks.forEach((t) => {
      const p = t.targetPath || '/'
      if (p !== '/') {
        activeDirSet.add(p)
      }
    })
    const activeDirCount = activeDirSet.size
    const activeFileCount = activeTasks.length

    const statusText = activeTasks.length > 0
      ? `剩余 ${activeDirCount > 0 ? activeDirCount + ' 个目录，' : ''}${activeFileCount} 个文件`
      : `${totalDirCount > 0 ? totalDirCount + ' 个目录，' : ''}${totalFileCount} 个文件已上传完成`

    const remainingSize = tasks
      .filter((t) => t.status !== 'completed')
      .reduce((sum, t) => sum + (t.total - t.loaded), 0)

    let remainingTimeText = ''
    const speed = uploadSpeedBytesPerSec
    if (remainingSize > 0 && speed && speed > 0) {
      const seconds = remainingSize / speed
      if (seconds > 3600) {
        remainingTimeText = `预计还需 ${(seconds / 3600).toFixed(1)} 小时`
      } else if (seconds > 60) {
        remainingTimeText = `预计还需 ${Math.ceil(seconds / 60)} 分钟`
      } else {
        remainingTimeText = `预计还需 ${Math.ceil(seconds)} 秒`
      }
    }

    return {
      totalProgress,
      remainingSize,
      remainingTimeText,
      statusText,
    }
  }, [uploadTasks, uploadSpeedBytesPerSec])

  if (!globalUploadStats) return null

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    clearAllTasks()
    closeCompleteInfo()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`relative border rounded-md overflow-hidden transition-all duration-300 ${
          globalUploadStats.remainingSize === 0
            ? 'bg-[#f0f9eb] border-[#67c23a]/50'
            : 'bg-white border-[#b3e19d]'
        }`}
      >
        {globalUploadStats.remainingSize > 0 && (
          <div
            className="absolute inset-0 bg-[#f0f9eb] transition-[width] duration-500 ease-linear pointer-events-none"
            style={{ width: `${globalUploadStats.totalProgress}%` }}
          />
        )}

        <div className="relative px-2 py-2 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className={`p-1 rounded-md text-white flex-none border border-black/5 ${
                globalUploadStats.remainingSize === 0 ? 'bg-[#67c23a]' : 'bg-[#2ecc71]'
              }`}
            >
              {globalUploadStats.remainingSize === 0 ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <span
                className="text-sm font-bold text-[#2c3e50] truncate"
                title={globalUploadStats.statusText}
              >
                {globalUploadStats.statusText}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none ml-2">
            <div className="flex flex-col items-end leading-none gap-0.5">
              {globalUploadStats.remainingSize > 0 && (
                <>
                  <span className="text-[12px] font-bold text-[#2ecc71]">
                    {Math.round(globalUploadStats.totalProgress)}%
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#909399] font-normal">
                    {globalUploadStats.remainingTimeText && (
                      <span className="whitespace-nowrap">
                        {globalUploadStats.remainingTimeText}
                      </span>
                    )}
                    <span className="whitespace-nowrap">
                      / 剩 {formatFileSize(globalUploadStats.remainingSize)}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 flex-none ml-1 relative z-10">
              {globalUploadStats.remainingSize === 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2 py-1 flex items-center justify-center rounded-md touch-manipulation text-[12px] text-[#ef4444] hover:bg-[#fee2e2] active:bg-[#fee2e2] transition-colors border border-[#fecaca] bg-[#fee2e2]/60 cursor-pointer"
                  title="移除所有已完成记录"
                >
                  关闭
                </button>
              )}
              <button
                type="button"
                className="px-2 py-1 flex items-center justify-center rounded-md touch-manipulation text-[12px] text-[#409eff] hover:bg-[#ecf5ff] active:bg-[#ecf5ff] transition-colors border border-[#d9ecff] bg-[#ecf5ff]/50 cursor-pointer ml-1"
                onClick={() => onShowDetails?.()}
              >
                详细
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
