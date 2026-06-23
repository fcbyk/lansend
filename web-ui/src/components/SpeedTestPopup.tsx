import { memo } from 'react'
import type { SpeedTestResult } from '../types'

interface SpeedTestPopupProps {
  isVisible: boolean
  speedResult: SpeedTestResult
  currentProgress: number
  onClose: () => void
  onStartTest: () => void
  formatSpeed: (bytes: number) => string
  formatDuration: (seconds: number) => string
}

export const SpeedTestPopup = memo(function SpeedTestPopup({
  isVisible,
  speedResult,
  currentProgress,
  onClose,
  onStartTest,
  formatSpeed,
  formatDuration,
}: SpeedTestPopupProps) {
  if (!isVisible) return null

  return (
    <div className="select-none absolute top-13.75 md:top-15 right-2.5 md:right-5 w-[calc(100%-20px)] md:w-70 max-w-75 md:max-w-none bg-white rounded-xl shadow-2xl border border-[#eee] z-100 flex flex-col overflow-hidden animate-slide-fade">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#eee] flex justify-between items-center bg-[#f8f9fa]">
        <h3 className="m-0 text-[15px] font-semibold text-[#333]">局域网测速</h3>
        <button
          className="border-none bg-none text-xl text-[#999] cursor-pointer leading-none p-1 hover:text-[#666]"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4">
        {/* Ping */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-[#666]">延迟 (Ping):</span>
          <span className="text-sm font-semibold text-[#333] font-mono">{speedResult.ping} ms</span>
        </div>

        {/* Download speed */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span
              className={`text-[13px] ${
                speedResult.status === 'downloading' ? 'text-[#007bff] font-semibold' : 'text-[#666]'
              }`}
            >
              下载速度:
            </span>
            <span className="text-sm font-semibold text-[#333] font-mono">
              {formatSpeed(speedResult.download)}
            </span>
          </div>
          {speedResult.status === 'downloading' && (
            <div className="h-1 bg-[#eee] rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#007bff] transition-[width] duration-200 ease-out"
                style={{ width: currentProgress + '%' }}
              />
            </div>
          )}
        </div>

        {/* Upload speed */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span
              className={`text-[13px] ${
                speedResult.status === 'uploading' ? 'text-[#007bff] font-semibold' : 'text-[#666]'
              }`}
            >
              上传速度:
            </span>
            <span className="text-sm font-semibold text-[#333] font-mono">
              {formatSpeed(speedResult.upload)}
            </span>
          </div>
          {speedResult.status === 'uploading' && (
            <div className="h-1 bg-[#eee] rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#007bff] transition-[width] duration-200 ease-out"
                style={{ width: currentProgress + '%' }}
              />
            </div>
          )}
        </div>

        {/* Error */}
        {speedResult.status === 'error' && (
          <div className="text-[12px] text-[#dc3545] p-2 bg-[#fff5f5] rounded">{speedResult.error}</div>
        )}

        {/* Completed - time estimate */}
        {speedResult.status === 'completed' && (
          <div className="mt-2 p-3 bg-[#f0f7ff] rounded-lg border border-[#d0e7ff]">
            <div className="text-[12px] text-[#666] mb-2">传输 1GB 文件预计耗时：</div>
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[11px] text-[#999]">下载</span>
                <span className="text-sm font-semibold text-[#0056b3]">
                  {formatDuration(1024 * 1024 * 1024 / speedResult.download)}
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[11px] text-[#999]">上传</span>
                <span className="text-sm font-semibold text-[#0056b3]">
                  {formatDuration(1024 * 1024 * 1024 / speedResult.upload)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer button */}
      <div className="p-3 border-t border-[#eee]">
        <button
          className="w-full p-2 bg-[#007bff] text-white border-none rounded-md text-sm cursor-pointer transition-colors duration-200 hover:bg-[#0056b3] disabled:bg-[#ccc] disabled:cursor-not-allowed"
          disabled={
            speedResult.status !== 'completed' &&
            speedResult.status !== 'error' &&
            speedResult.status !== 'idle'
          }
          onClick={onStartTest}
          type="button"
        >
          {speedResult.status === 'completed' || speedResult.status === 'error'
            ? '重新测速'
            : '正在测速...'}
        </button>
      </div>
    </div>
  )
})
