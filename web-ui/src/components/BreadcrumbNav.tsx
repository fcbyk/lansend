import { memo, useCallback, useRef, useState, type KeyboardEvent } from 'react'

import { CheckSquare, Lock, Upload, X } from 'lucide-react'

import { useDirectoryContext } from '../contexts/DirectoryContext'
import { useUploadContext } from '../contexts/UploadContext'
import { useSelectionContext } from '../contexts/SelectionContext'
import { usePasswordShake } from '../hooks/usePasswordShake'

interface BreadcrumbNavProps {
  unDownload?: boolean
  unUpload?: boolean
  onNavigate: (path: string) => void
  onFilesSelected: (files: File[]) => void
}

export const BreadcrumbNav = memo(function BreadcrumbNav({
  unDownload,
  unUpload,
  onNavigate,
  onFilesSelected,
}: BreadcrumbNavProps) {
  const { shareName, pathParts, requirePassword } = useDirectoryContext()
  const { canUpload: isPasswordVerified, password, passwordError, verifyPassword, setPassword } = useUploadContext()
  const { selectionMode, toggleSelectMode } = useSelectionContext()

  const passwordInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPasswordInput, setShowPasswordInput] = useState(false)

  const { shouldShake, onShakeEnd } = usePasswordShake(passwordError, showPasswordInput)

  const canUpload = !requirePassword || isPasswordVerified
  const needsPassword = !!(requirePassword && !canUpload)
  const shouldShowUploadButton = !unUpload
  const shouldShowSelectButton = !unDownload

  const effectiveShowPasswordInput = showPasswordInput && needsPassword

  const handleUploadButtonClick = useCallback(() => {
    if (needsPassword) {
      setShowPasswordInput(true)
      setTimeout(() => passwordInputRef.current?.focus(), 0)
      return
    }
    fileInputRef.current?.click()
  }, [needsPassword])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target
      if (target.files && target.files.length > 0) {
        onFilesSelected(Array.from(target.files))
      }
      target.value = ''
    },
    [onFilesSelected],
  )

  const handlePasswordInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value)
    },
    [setPassword],
  )

  const handleLoginClick = useCallback(() => {
    verifyPassword(password, false)
  }, [verifyPassword, password])

  const handlePasswordKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        verifyPassword(password, false)
      }
    },
    [verifyPassword, password],
  )

  return (
    <div className="flex-none sticky top-0 z-20 bg-white pb-2">
      {/* 面包屑导航 */}
      <div className="mb-2 p-2 bg-[#f8f9fa] rounded-md flex flex-wrap items-center gap-0.5 text-sm leading-relaxed border border-[#eee] relative">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 flex-wrap">
          <div className="flex items-center gap-0.5">
            <span
              onClick={() => onNavigate('')}
              className="text-[#606266] px-1.5 py-0.5 rounded transition-all duration-200 cursor-pointer whitespace-nowrap hover:bg-[#e4e7ed] hover:text-[#409eff] active:bg-[#e4e7ed]"
            >
              {shareName}
            </span>
            {pathParts.length > 0 && (
              <span className="text-[#909399] text-[12px] select-none mx-0.5">/</span>
            )}
          </div>
          {pathParts.map((part, index) => (
            <div key={part.path} className="flex items-center gap-0.5">
              <span
                onClick={() => onNavigate(part.path)}
                className={`text-[#606266] px-1.5 py-0.5 rounded transition-all duration-200 cursor-pointer whitespace-nowrap hover:bg-[#e4e7ed] hover:text-[#409eff] active:bg-[#e4e7ed] ${
                  index === pathParts.length - 1
                    ? 'text-[#303133] font-medium cursor-default hover:bg-transparent hover:text-[#303133]'
                    : ''
                }`}
              >
                {part.name}
              </span>
              {index < pathParts.length - 1 && (
                <span className="text-[#909399] text-[12px] select-none mx-0.5">/</span>
              )}
            </div>
          ))}
        </div>
        {/* 右侧操作按钮 */}
        <div className="flex-none flex items-center ml-1 gap-1">
          {shouldShowSelectButton && (
            <button
              onClick={toggleSelectMode}
              className={`p-2 md:p-1.5 rounded-md hover:bg-[#e4e7ed] active:bg-[#e4e7ed] text-[#606266] transition-colors duration-200 flex items-center gap-1 touch-manipulation ${
                selectionMode ? 'bg-[#e4e7ed] text-[#409eff]' : ''
              }`}
              title="选择"
              type="button"
            >
              <CheckSquare className="w-5 h-5 md:w-4 md:h-4" />
            </button>
          )}
          {shouldShowUploadButton && (
            <button
              onClick={handleUploadButtonClick}
              className="p-2 md:p-1.5 rounded-md hover:bg-[#e4e7ed] active:bg-[#e4e7ed] text-[#606266] transition-colors duration-200 flex items-center gap-1 touch-manipulation"
              title={needsPassword ? '需要密码上传' : '上传文件'}
              type="button"
            >
              {needsPassword ? (
                <Lock className="w-5 h-5 md:w-4 md:h-4 text-[#f39c12]" />
              ) : (
                <Upload className="w-5 h-5 md:w-4 md:h-4" />
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {/* 密码输入 */}
      {effectiveShowPasswordInput && needsPassword && (
        <div className="mb-2 p-3 bg-white border border-[#d1d5db] rounded-lg animate-in">
          <div className="flex items-center justify-between mb-3 md:mb-2">
            <div className="text-[13px] md:text-[12px] font-medium text-[#374151]">
              请输入上传密码
            </div>
            <button
              onClick={() => setShowPasswordInput(false)}
              className="text-[#9ca3af] hover:text-[#6b7280] active:bg-[#f3f4f6] transition-colors p-2 md:p-1 rounded-md touch-manipulation"
              type="button"
            >
              <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              ref={passwordInputRef}
              className={`flex-1 px-3 py-2 md:py-1.5 text-sm rounded-md border border-[#e5e7eb] outline-none bg-white text-[#111827] focus:border-[#409eff] transition-colors ${
                shouldShake ? 'shake' : ''
              }`}
              value={password || ''}
              type="password"
              placeholder="上传密码"
              onChange={handlePasswordInputChange}
              onKeyDown={handlePasswordKeyDown}
              onAnimationEnd={onShakeEnd}
            />
            <button
              className="px-4 py-2 md:px-3 md:py-1.5 bg-[#409eff] text-white text-sm font-medium rounded-md hover:bg-[#66b1ff] active:bg-[#3a8ee6] transition-colors disabled:opacity-50 touch-manipulation"
              onClick={handleLoginClick}
              type="button"
            >
              验证
            </button>
          </div>
          {passwordError && (
            <div className="mt-1 text-[11px] text-[#ef4444] font-medium">{passwordError}</div>
          )}
        </div>
      )}
    </div>
  )
})
