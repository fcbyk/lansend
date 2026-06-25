import { memo } from 'react'
import { Check } from 'lucide-react'

import type { DirectoryItem } from '../types'
import { RepoTreeIcon } from './RepoTreeIcon'

interface FileListItemProps {
  item: DirectoryItem
  selectionMode: boolean
  isSelected: boolean
  onClick: (item: DirectoryItem) => void
  onToggleSelect: (item: DirectoryItem) => void
}

export const FileListItem = memo(function FileListItem({
  item,
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
      </div>
    </li>
  )
})
