import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PreviewFile } from '../types'
import { isVideoFileName } from '../utils/files'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import cpp from 'highlight.js/lib/languages/cpp'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('python', python)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c++', cpp)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('markdown', markdown)

function guessLangByName(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript'
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'typescript'
  if (lower.endsWith('.vue')) return 'xml'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss')) return 'scss'
  if (lower.endsWith('.html') || lower.endsWith('.xml')) return 'xml'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (
    lower.endsWith('.cc') ||
    lower.endsWith('.cpp') ||
    lower.endsWith('.cxx') ||
    lower.endsWith('.hpp') ||
    lower.endsWith('.hxx')
  )
    return 'cpp'
  return ''
}

const MAX_CHARS = 400_000

interface PreviewTabProps {
  previewFile: PreviewFile | null
  previewLoading: boolean
  previewError: string
  videoLoading: boolean
  canGoPrev: boolean
  canGoNext: boolean
  currentImageIndex: number
  totalImages: number
  onVideoLoaded: () => void
  onVideoError: () => void
  onPrevImage: () => void
  onNextImage: () => void
}

export const PreviewTab = memo(function PreviewTab({
  previewFile,
  previewLoading,
  previewError,
  videoLoading,
  canGoPrev,
  canGoNext,
  currentImageIndex,
  totalImages,
  onVideoLoaded,
  onVideoError,
  onPrevImage,
  onNextImage,
}: PreviewTabProps) {
  const videoPlayerRef = useRef<HTMLVideoElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')

  // 派生状态
  const isVideo = useMemo(() => {
    const file = previewFile
    if (!file) return false
    if (typeof file.is_video === 'boolean') return file.is_video
    return isVideoFileName(file.name)
  }, [previewFile])

  const videoSrc = useMemo(() => {
    if (!previewFile) return ''
    return `/api/preview/${encodeURIComponent(previewFile.path)}`
  }, [previewFile])

  const imageSrc = useMemo(() => {
    if (!previewFile) return ''
    return `/api/download/${encodeURIComponent(previewFile.path)}`
  }, [previewFile])

  const openInBrowserHref = useMemo(() => {
    if (!previewFile) return ''
    return `/api/preview/${encodeURIComponent(previewFile.path)}`
  }, [previewFile])

  const shouldShowOpenInBrowser = !!(previewFile && previewError)

  const lineCount = useMemo(() => {
    const file = previewFile
    if (!file?.content) return 0
    const content = file.content.length > MAX_CHARS ? file.content.slice(0, MAX_CHARS) : file.content
    return content.split(/\r\n|\n/).length
  }, [previewFile])

  const highlightedHtml = useMemo(() => {
    const file = previewFile
    if (!file?.content) return ''

    const content = file.content.length > MAX_CHARS ? file.content.slice(0, MAX_CHARS) : file.content
    const lang = guessLangByName(file.name || '')

    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang }).value
      }
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    } catch {
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }
  }, [previewFile])

  // 中止视频下载
  const abortVideoDownload = useCallback(() => {
    const el = videoPlayerRef.current
    if (!el) return
    try {
      el.pause()
      el.removeAttribute('src')
      el.load()
    } catch (err) {
      console.warn('abortVideoDownload failed:', err)
    }
  }, [])

  // 预览文件切换时，中止旧视频下载
  const prevFileRef = useRef(previewFile)
  useEffect(() => {
    const oldFile = prevFileRef.current
    prevFileRef.current = previewFile
    if (oldFile) {
      const wasVideo =
        typeof oldFile.is_video === 'boolean' ? oldFile.is_video : isVideoFileName(oldFile.name)
      if (wasVideo) {
        abortVideoDownload()
      }
    }
  }, [previewFile, abortVideoDownload])

  // 组件卸载时中止视频
  useEffect(() => {
    return () => {
      abortVideoDownload()
    }
  }, [abortVideoDownload])

  // 复制按钮
  const onCopyClick = useCallback(async () => {
    if (!previewFile?.content) return
    try {
      await navigator.clipboard.writeText(previewFile.content)
      setCopyState('success')
    } catch (err) {
      console.error('复制失败:', err)
      setCopyState('error')
    }
    const timer = setTimeout(() => {
      setCopyState('idle')
      clearTimeout(timer)
    }, 2000)
  }, [previewFile])

  const copyStateLabel =
    copyState === 'success' ? 'Copied!' : copyState === 'error' ? 'Copy failed' : 'Copy'

  if (!previewFile) return null

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-hidden w-full h-full p-0 min-h-0 flex justify-center items-stretch">
        {previewLoading && <div className="p-10 text-center text-[#999]">加载中...</div>}

        {!previewLoading && previewError && (
          <div className="p-10 text-center text-[#e74c3c]">
            <div className="mb-4">{previewError}</div>
            {shouldShowOpenInBrowser && (
              <a
                href={openInBrowserHref}
                className="bg-[#2ecc71] text-white border-none px-2.5 py-1.25 rounded cursor-pointer no-underline text-[12px] flex-none ml-2.5 hover:bg-[#27ae60]"
                target="_blank"
                rel="noopener noreferrer"
              >
                在浏览器打开
              </a>
            )}
          </div>
        )}

        {!previewLoading && !previewError && isVideo && (
          <div className="flex flex-col justify-center items-center gap-3 min-h-50 max-w-full max-h-full relative">
            {videoLoading && (
              <div className="flex flex-col items-center justify-center min-h-60 p-8">
                <div className="w-10 h-10 border-4 border-[#e5e7eb] border-t-[#3b82f6] rounded-full animate-spin mb-4" />
                <div className="text-[#6b7280] text-[0.9rem]">视频加载中，请稍候...</div>
              </div>
            )}
            <video
              ref={videoPlayerRef}
              className={`max-w-full max-h-full object-contain rounded ${videoLoading ? 'hidden' : ''}`}
              src={videoSrc}
              controls
              preload="metadata"
              playsInline
              onLoadedData={onVideoLoaded}
              onError={onVideoError}
            />
          </div>
        )}

        {!previewLoading && !previewError && !isVideo && previewFile.is_image && (
          <div className="relative flex justify-center items-center min-h-50 w-full h-full">
            {canGoPrev && (
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white border-none w-10 h-10 rounded-full cursor-pointer flex items-center justify-center transition-all duration-200"
                onClick={onPrevImage}
                title="上一张"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <img className="max-w-full max-h-full object-contain" src={imageSrc} alt={previewFile.name} />

            {canGoNext && (
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white border-none w-10 h-10 rounded-full cursor-pointer flex items-center justify-center transition-all duration-200"
                onClick={onNextImage}
                title="下一张"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {totalImages > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                {currentImageIndex + 1} / {totalImages}
              </div>
            )}
          </div>
        )}

        {!previewLoading && !previewError && !isVideo && previewFile.is_binary && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <p className="mb-5 text-[#666]">无法预览二进制文件</p>
            <a
              href={`/api/preview/${encodeURIComponent(previewFile.path)}`}
              className="bg-[#2ecc71] text-white border-none px-2.5 py-1.25 rounded cursor-pointer no-underline text-[12px] flex-none ml-2.5 hover:bg-[#27ae60]"
              target="_blank"
              rel="noopener noreferrer"
            >
              在浏览器打开
            </a>
          </div>
        )}

        {!previewLoading && !previewError && !isVideo && !previewFile.is_image && !previewFile.is_binary && (
          <div className="flex-1 min-h-0 w-full h-full relative group">
            <button
              type="button"
              className="select-none absolute top-3.75 right-6.25 z-3 appearance-none border border-[rgba(0,0,0,0.12)] bg-[rgba(255,255,255,0.9)] text-[#374151] text-[12px] leading-none px-2.5 py-1.75 rounded-lg cursor-pointer opacity-0 pointer-events-none transition-all duration-150 -translate-y-0.5 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 active:translate-y-0 active:scale-95 hover:border-[rgba(0,0,0,0.18)] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed md:opacity-100 md:pointer-events-auto md:translate-y-0"
              disabled={!previewFile?.content}
              onClick={onCopyClick}
            >
              {copyStateLabel}
            </button>
            <div className="flex items-start w-full h-full min-h-0 overflow-auto touch-pan-x touch-pan-y rounded">
              <div
                className="flex-none px-2 py-0 text-[#9ca3af] bg-[#fafafa] border-r border-[#eee] text-right select-none font-mono text-sm leading-relaxed sticky left-0 z-1"
                aria-hidden="true"
              >
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className="leading-relaxed whitespace-nowrap">
                    {i + 1}
                  </div>
                ))}
              </div>
              <pre className="m-0 py-0 px-2 font-mono text-sm leading-relaxed whitespace-pre word-wrap-normal flex-auto min-w-0 overflow-visible">
                <code
                  className="hljs p-0! font-inherit text-[#333] overflow-x-visible!"
                  // 安全说明：highlightedHtml 由 hljs.highlight() 生成，hljs 会对源码做 HTML 实体转义，
                  // 输出仅包含语法高亮标签，不执行脚本。输入来源为服务端文件内容 API，
                  // 非用户自由输入，XSS 风险可控。
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
