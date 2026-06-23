import { memo } from 'react'

import { useDirectoryContext } from '../contexts/DirectoryContext'
import { useSelectionContext } from '../contexts/SelectionContext'

export const SelectionBar = memo(function SelectionBar() {
  const { items } = useDirectoryContext()
  const { selectedPaths, isSelected, handleDownloadSelected, handleDownloadSelectedFiles, clearSelection } = useSelectionContext()

  const selectedCount = selectedPaths.length
  const selectedFileCount = items.filter((item) => !item.is_dir && isSelected(item.path)).length

  return (
    <div className="absolute bottom-3 left-3 right-3 z-30">
      <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 flex-nowrap overflow-x-auto">
        <div className="text-sm text-[#374151] flex-1 min-w-18 truncate">
          已选 {selectedCount} 项
        </div>
        <button
          className="px-2 md:px-3 py-1.5 bg-[#409eff] text-white text-xs md:text-sm font-medium rounded-md hover:bg-[#66b1ff] active:bg-[#3a8ee6] transition-colors touch-manipulation whitespace-nowrap"
          onClick={handleDownloadSelected}
          type="button"
        >
          <span className="hidden md:inline">下载压缩包</span>
          <span className="md:hidden">压缩下载</span>
        </button>
        <button
          className="px-2 md:px-3 py-1.5 bg-white text-[#409eff] border border-[#93c5fd] text-xs md:text-sm font-medium rounded-md hover:bg-[#eff6ff] active:bg-[#dbeafe] transition-colors touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          disabled={selectedFileCount === 0}
          onClick={() => handleDownloadSelectedFiles(items)}
          type="button"
        >
          <span className="hidden md:inline">单文件下载</span>
          <span className="md:hidden">单文件下载</span>
        </button>
        <button
          className="px-2 md:px-3 py-1.5 bg-[#f3f4f6] text-[#374151] text-xs md:text-sm font-medium rounded-md hover:bg-[#e5e7eb] active:bg-[#e5e7eb] transition-colors touch-manipulation whitespace-nowrap"
          onClick={clearSelection}
          type="button"
        >
          <span className="hidden md:inline">取消选择</span>
          <span className="md:hidden">取消</span>
        </button>
      </div>
    </div>
  )
})
