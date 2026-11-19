import { memo } from 'react'
import { Check } from 'lucide-react'

import type { DirectoryItem } from '../types'
import { RepoTreeIcon } from './RepoTreeIcon'

interface FileListItemProps {
  item: DirectoryItem
  downloadEnabled: boolean
  selectionMode: boolean
  isSelected: boolean
  onClick: (item: DirectoryItem) => void
  onToggleSelect: (item: DirectoryItem) => void
}

export const FileListItem = memo(function FileListItem({
  item,
  downloadEnabled,
  selectionMode,
  isSelected,
  onClick,
  onToggleSelect,
}: FileListItemProps) {
  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect(item)
      return
    }
    onClick(item)
  }

  return (
    <li
      className={`group p-2.5 border-b border-[#eee] flex flex-col w-full hover:bg-[#f8f9fa] transition-all duration-300 relative overflow-hidden cursor-pointer ${
        selectionMode && isSelected ? 'bg-[#eef7ff]' : ''
      }`}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between w-full relative z-1">
        <div className="flex items-center grow min-w-0 overflow-hidden">
          {selectionMode && (
            <span
              className={`mr-2 w-5 h-5 rounded border flex items-center justify-center flex-none ${
                isSelected
                  ? 'bg-[#409eff] border-[#409eff]'
                  : 'bg-white border-[#d1d5db]'
              }`}
            >
              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
            </span>
          )}
          <span className="mr-2.5 flex items-center justify-center flex-none">
            <RepoTreeIcon isDirectory={item.is_dir} />
          </span>
          <span className="flex items-center grow min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <span
              className="no-underline overflow-hidden text-ellipsis whitespace-nowrap text-[#1f2328] group-hover:text-[#0969da]"
            >
              {item.name}
            </span>
          </span>
        </div>
        {downloadEnabled && !item.is_dir && !selectionMode && (
          <a
            href={`/api/download/${encodeURIComponent(item.path)}`}
            download
            onClick={(event) => event.stopPropagation()}
            aria-label="下载"
            title="下载"
            className="ml-2.5 flex-none inline-flex h-6 items-center rounded px-[10px] text-[12px] leading-none text-white no-underline opacity-0 pointer-events-none transition-all duration-200 group-hover:bg-[#2ecc71] group-hover:opacity-100 group-hover:pointer-events-auto group-hover:hover:bg-[#27ae60] pointer-coarse:bg-[#2ecc71] pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto"
          >
            下载
          </a>
        )}
      </div>
    </li>
  )
})
