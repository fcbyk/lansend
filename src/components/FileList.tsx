import { useCallback } from 'react'

import { AlertCircle, X } from 'lucide-react'

import type { DirectoryItem } from '../types'
import { useDirectoryContext } from '../contexts/DirectoryContext'
import { useUploadContext } from '../contexts/UploadContext'
import { useSelectionContext } from '../contexts/SelectionContext'
import { BreadcrumbNav } from './BreadcrumbNav'
import { FileListItem } from './FileListItem'
import { SelectionBar } from './SelectionBar'
import { UploadGroups } from './UploadGroups'

interface FileListProps {
  unDownload?: boolean
  unUpload?: boolean
  uploadPathHint?: string
  onNavigate: (path: string) => void
  onItemClick: (item: DirectoryItem) => void
  onDragOver: (e: DragEvent) => void
  onDragEnter: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFilesSelected: (files: File[]) => void
  onShowDetails: () => void
}

export function FileList({
  unDownload,
  unUpload,
  uploadPathHint,
  onNavigate,
  onItemClick,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onFilesSelected,
  onShowDetails,
}: FileListProps) {
  const { items, loading, error, requirePassword } = useDirectoryContext()
  const {
    uploadTasks,
    canUpload: isPasswordVerified,
    isDragOver,
    completeInfo,
    showCompleteInfoFlag,
    closeCompleteInfo,
  } = useUploadContext()
  const { selectionMode, selectedPaths, isSelected, toggleItemSelect } = useSelectionContext()

  const canUpload = !requirePassword || isPasswordVerified

  const selectedCount = selectedPaths.length

  const handleDragOverWrapper = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canUpload) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      onDragOver(e.nativeEvent)
    },
    [canUpload, onDragOver],
  )

  const handleDragEnterWrapper = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canUpload) return
      e.preventDefault()
      e.stopPropagation()
      onDragEnter(e.nativeEvent)
    },
    [canUpload, onDragEnter],
  )

  const handleDragLeaveWrapper = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canUpload) return
      e.preventDefault()
      // 注意：这里不调用 stopPropagation()，让 dragleave 事件冒泡到 window
      // 这样 AppContent 中的全局 handleGlobalDragLeave 兜底检测（视口边界检查）才能正常工作
      onDragLeave(e.nativeEvent)
    },
    [canUpload, onDragLeave],
  )

  const handleDropWrapper = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!canUpload) return
      e.preventDefault()
      e.stopPropagation()
      onDrop(e.nativeEvent)
    },
    [canUpload, onDrop],
  )

  return (
    <div
      className="file-list-container flex flex-col flex-1 min-h-0 m-4 md:m-0 relative select-none"
      onDragOver={handleDragOverWrapper}
      onDragEnter={handleDragEnterWrapper}
      onDragLeave={handleDragLeaveWrapper}
      onDrop={handleDropWrapper}
    >
      {/* 拖拽遮罩 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-[#e8f4f8] border-2 border-dashed border-[#3498db] rounded-lg flex items-center justify-center text-center p-5 transition-all duration-300 pointer-events-none">
          <div>
            <div className="text-[48px] text-[#3498db] mb-2.5">📤</div>
            <p className="text-[#3498db] text-lg font-medium mt-2">松开上传</p>
            {uploadPathHint && (
              <p className="text-[#95a5a6] text-[13px] mt-1.5 opacity-80 font-normal">
                {uploadPathHint}
              </p>
            )}
          </div>
        </div>
      )}

      {!isDragOver && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* 顶部固定区域 */}
          <BreadcrumbNav
            unDownload={unDownload}
            unUpload={unUpload}
            onNavigate={onNavigate}
            onFilesSelected={onFilesSelected}
          />

          {/* 完成提示 */}
          {showCompleteInfoFlag && (
            <div className="mb-2 w-full px-3 py-2.5 md:py-2 bg-[#fffbeb] text-[#854d0e] rounded-md text-[13px] md:text-[12px] font-medium leading-relaxed border border-[#f59e0b]/50 flex items-center gap-2 animate-in">
              <div className="flex-none w-4 h-4 bg-[#f59e0b] rounded-full flex items-center justify-center">
                <AlertCircle className="w-3 h-3 text-white" />
              </div>
              <span className="flex-1">{completeInfo}</span>
              <button
                onClick={closeCompleteInfo}
                className="flex-none p-2 md:p-1 hover:bg-[#fef3c7] active:bg-[#fef3c7] rounded-md transition-colors touch-manipulation"
                type="button"
              >
                <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
              </button>
            </div>
          )}

          {/* 上传汇总条 */}
          {uploadTasks && uploadTasks.length > 0 && (
            <UploadGroups
              onShowDetails={onShowDetails}
            />
          )}

          {/* 文件列表 */}
          <ul className="file-list list-none p-0 w-full grow overflow-y-auto overflow-x-hidden min-h-0">
            {loading && (
              <li className="p-5 text-center text-[#999]">加载中...</li>
            )}
            {!loading && error && (
              <li className="p-5 text-center text-[#e74c3c]">{error}</li>
            )}
            {!loading && !error && (!items || items.length === 0) && (
              <li className="p-5 text-center text-[#999]">目录为空</li>
            )}
            {!loading &&
              !error &&
              items.map((item) => (
                <FileListItem
                  key={item.path}
                  item={item}
                  selectionMode={!!selectionMode}
                  isSelected={isSelected(item.path)}
                  onClick={onItemClick}
                  onToggleSelect={toggleItemSelect}
                />
              ))}
          </ul>

          {/* 选择操作栏 */}
          {selectionMode && selectedCount > 0 && (
            <SelectionBar />
          )}
        </div>
      )}
    </div>
  )
}
