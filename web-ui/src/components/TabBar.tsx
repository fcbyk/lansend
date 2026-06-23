import { memo } from 'react'
import type { LansendActiveTab, PreviewFile } from '../types'

interface TabBarProps {
  activeTab: LansendActiveTab
  setActiveTab: (tab: LansendActiveTab) => void
  chatEnabled: boolean
  showUploadDetailsTab: boolean
  previewFile: PreviewFile | null
  onCloseUploadDetails: () => void
  onClosePreview: () => void
  onStartSpeedTest: () => void
}

export const TabBar = memo(function TabBar({
  activeTab,
  setActiveTab,
  chatEnabled,
  showUploadDetailsTab,
  previewFile,
  onCloseUploadDetails,
  onClosePreview,
  onStartSpeedTest,
}: TabBarProps) {
  return (
    <div className="flex border-b border-[#e4e7ed] bg-white shrink-0 items-stretch overflow-x-auto overflow-y-hidden z-10">
      {/* Mobile: directory tab */}
      <div
        className={`px-5 py-3 cursor-pointer text-[#606266] text-sm border-b-2 transition-all duration-300 select-none relative flex-none hover:text-[#409eff] block md:hidden ${
          activeTab === 'directory'
            ? 'text-[#409eff] border-b-[#409eff] font-medium'
            : 'border-b-transparent'
        }`}
        onClick={() => setActiveTab('directory')}
      >
        文件夹
      </div>

      {/* Chat tab */}
      {chatEnabled && (
        <div
          className={`px-5 py-3 cursor-pointer text-[#606266] text-sm border-b-2 transition-all duration-300 select-none relative flex-none hover:text-[#409eff] ${
            activeTab === 'chat'
              ? 'text-[#409eff] border-b-[#409eff] font-medium'
              : 'border-b-transparent'
          }`}
          onClick={() => setActiveTab('chat')}
        >
          聊天
        </div>
      )}

      {/* Upload details tab */}
      {showUploadDetailsTab && (
        <div
          className={`px-5 py-3 cursor-pointer text-[#606266] text-sm border-b-2 transition-all duration-300 select-none relative flex-none hover:text-[#409eff] inline-flex items-center gap-2 max-w-55 ${
            activeTab === 'upload-details'
              ? 'text-[#409eff] border-b-[#409eff] font-medium'
              : 'border-b-transparent'
          }`}
          onClick={() => setActiveTab('upload-details')}
        >
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">上传详细</span>
          <button
            className="border-none bg-transparent text-[#909399] cursor-pointer p-0 w-4.5 h-4.5 leading-4.5 rounded flex items-center justify-center hover:bg-[#f0f0f0] hover:text-[#333]"
            onClick={(e) => {
              e.stopPropagation()
              onCloseUploadDetails()
            }}
            aria-label="关闭"
            type="button"
          >
            ×
          </button>
        </div>
      )}

      {/* Preview tab */}
      {previewFile && (
        <div
          className={`px-5 py-3 cursor-pointer text-[#606266] text-sm border-b-2 transition-all duration-300 select-none relative flex-none hover:text-[#409eff] inline-flex items-center gap-2 max-w-55 ${
            activeTab === 'preview'
              ? 'text-[#409eff] border-b-[#409eff] font-medium'
              : 'border-b-transparent'
          }`}
          onClick={() => setActiveTab('preview')}
          title={previewFile.name}
        >
          <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-42.5">
            {previewFile.name}
          </span>
          <button
            className="border-none bg-transparent text-[#909399] cursor-pointer p-0 w-4.5 h-4.5 leading-4.5 rounded flex items-center justify-center hover:bg-[#f0f0f0] hover:text-[#333]"
            onClick={(e) => {
              e.stopPropagation()
              onClosePreview()
            }}
            aria-label="关闭"
            type="button"
          >
            ×
          </button>
        </div>
      )}

      {/* Speed test button */}
      <div
        className="ml-auto flex items-center gap-1 text-[#666] text-[13px] cursor-pointer px-5 py-3 md:px-3 border-l border-[#eee] hover:text-[#007bff] hover:bg-[#f8f9fa]"
        onClick={onStartSpeedTest}
        title="局域网测速"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="select-none hidden md:inline">测速</span>
      </div>
    </div>
  )
})
