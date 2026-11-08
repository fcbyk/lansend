import { useCallback, useEffect, useRef, useState } from 'react'

import { FileList } from './components/FileList'
import { ChatTab } from './components/ChatTab'
import { PreviewTab } from './components/PreviewTab'
import { UploadDetailsTab } from './components/UploadDetailsTab'
import { TabBar } from './components/TabBar'
import { ResizeHandle } from './components/ResizeHandle'
import { SpeedTestPopup } from './components/SpeedTestPopup'
import { AccessLogin } from './components/AccessLogin'
import { useDirectoryContext, useUploadContext, usePreviewContext, useSelectionContext, useSpeedContext } from './contexts'
import { useDragAndDrop } from './hooks/useDragAndDrop'
import { useWindowResize } from './hooks/useWindowResize'
import { ACCESS_REQUIRED_EVENT, getLansendConfig } from './api'
import { joinUploadPath } from './utils/files'
import type { FileWithSubdir } from './utils/files'
import type { DirectoryItem, LansendActiveTab } from './types'
import { TAB } from './constants'

export function AppContent() {
  // --- Contexts ---
  const {
    shareName,
    pathParts,
    items,
    requirePassword,
    currentPath,
    loadDirectory,
    restorePathFromSession,
    startPolling,
    stopPolling,
  } = useDirectoryContext()

  const {
    setIsDragOver,
    canUpload: isPasswordVerified,
    password,
    verifyPassword,
    restorePasswordFromSession: restoreUploadPasswordFromSession,
    setIsPasswordVerified,
    enqueueFiles,
    processUploadQueue,
  } = useUploadContext()

  const {
    previewFile,
    previewLoading,
    previewError,
    previewVideoLoading,
    previewFileContent,
    closePreview: originalClosePreview,
    onPreviewVideoLoaded,
    onPreviewVideoError,
    prevImage,
    nextImage,
    canGoPrev,
    canGoNext,
    currentImageIndex,
    imageFiles,
  } = usePreviewContext()

  const {
    clearSelection,
  } = useSelectionContext()

  const {
    isSpeedTestVisible,
    speedResult,
    currentProgress,
    startSpeedTest,
    closeSpeedTest,
    formatSpeed,
    formatDuration,
  } = useSpeedContext()

  // --- Local state ---
  const [activeTab, setActiveTab] = useState<LansendActiveTab>(TAB.EMPTY)
  const [downloadEnabled, setDownloadEnabled] = useState(false)
  const [uploadEnabled, setUploadEnabled] = useState(false)
  const [chatEnabled, setChatEnabled] = useState(false)
  const [showUploadDetailsTab, setShowUploadDetailsTab] = useState(false)
  // 需要访问密码时整页换成登录界面，其余内容一行都不渲染
  const [needsAccess, setNeedsAccess] = useState(false)

  // --- Refs ---
  const mainContainerRef = useRef<HTMLDivElement>(null)

  // --- Computed ---
  const canUpload = uploadEnabled && (!requirePassword || isPasswordVerified)

  const currentUploadPath = (() => {
    if (!shareName) return ''
    const parts = pathParts.map((p) => p.name).join('/')
    return parts ? `/${shareName}/${parts}` : `/${shareName}`
  })()

  const uploadPathHint = currentUploadPath ? `文件将上传到：${currentUploadPath}` : ''

  // --- Password + directory loading ---
  const loadDirectoryWithAuth = useCallback(
    async (path: string = '', silent: boolean = false) => {
      const data = await loadDirectory(path, silent)
      if (data?.require_password) {
        const storedPassword = restoreUploadPasswordFromSession()
        if (storedPassword) {
          await verifyPassword(storedPassword, true)
        }
      } else if (data) {
        setIsPasswordVerified(true)
      }
      // 返回 null 说明这次请求没成功（最常见的是撞上访问密码的 401），
      // 调用方据此决定要不要起轮询 —— 登录页背后轮询没有意义。
      return data
    },
    [loadDirectory, restoreUploadPasswordFromSession, verifyPassword, setIsPasswordVerified],
  )

  // --- Window resize ---
  const handleSwitchFromMobile = useCallback(
    (hasPreview: boolean) => {
      setActiveTab(hasPreview ? TAB.PREVIEW : TAB.EMPTY)
    },
    [],
  )

  const {
    fileContainerWidth,
    setFileContainerWidth,
    tabsContainerWidth,
    setTabsContainerWidth,
    isMobileLayout,
  } = useWindowResize(mainContainerRef, activeTab, previewFile, handleSwitchFromMobile)

  // --- Upload helpers ---
  const groupFilesByTargetPath = useCallback(
    (files: FileWithSubdir[]): Record<string, File[]> => {
      const groups: Record<string, File[]> = {}
      files.forEach((item) => {
        const targetPath = joinUploadPath(currentPath, item.subdir)
        const key = targetPath || ''
        if (!groups[key]) groups[key] = []
        groups[key].push(item.file)
      })
      return groups
    },
    [currentPath],
  )

  const startUploadForGroups = useCallback(
    (groups: Record<string, File[]>) => {
      const entries = Object.entries(groups).filter(([, files]) => files.length > 0)
      if (entries.length === 0) return
      stopPolling()
      entries.forEach(([targetPath, files]) => {
        enqueueFiles(files, targetPath)
      })
      processUploadQueue({
        requirePassword,
        getPassword: () => password,
        onWrongPassword: () => {
          // passwordError is set inside useLansendUpload
        },
        onRefresh: async () => {
          await loadDirectoryWithAuth(currentPath, true)
          startPolling()
        },
      })
    },
    [
      stopPolling, enqueueFiles, processUploadQueue, requirePassword,
      password, loadDirectoryWithAuth, currentPath, startPolling,
    ],
  )

  // --- Drag & Drop ---
  const handleFilesDrop = useCallback(
    (files: FileWithSubdir[]) => {
      const groups = groupFilesByTargetPath(files)
      startUploadForGroups(groups)
    },
    [groupFilesByTargetPath, startUploadForGroups],
  )

  const {
    resetDragState,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  } = useDragAndDrop(canUpload, setIsDragOver, handleFilesDrop)

  const handleFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      const groups: Record<string, File[]> = {}
      groups[currentPath || ''] = files.slice()
      startUploadForGroups(groups)
    },
    [currentPath, startUploadForGroups],
  )

  // --- Global drag prevention ---
  useEffect(() => {
    const resetGlobalDrag = () => {
      resetDragState()
    }
    const isInFileListContainer = (target: EventTarget | null) => {
      return target instanceof Element && !!target.closest('.file-list-container')
    }
    const preventGlobalDragOver = (e: DragEvent) => {
      if (isInFileListContainer(e.target)) return
      resetGlobalDrag()
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none'
      }
    }
    const preventGlobalDrop = (e: DragEvent) => {
      resetGlobalDrag()
      if (!isInFileListContainer(e.target)) {
        e.preventDefault()
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'none'
        }
      }
    }
    const handleGlobalDragLeave = (e: DragEvent) => {
      const leftViewport =
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      if (leftViewport) {
        resetGlobalDrag()
      }
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetDragState()
      }
    }

    window.addEventListener('dragover', preventGlobalDragOver)
    window.addEventListener('dragenter', preventGlobalDragOver)
    window.addEventListener('drop', preventGlobalDrop)
    window.addEventListener('dragend', resetGlobalDrag)
    window.addEventListener('dragleave', handleGlobalDragLeave)
    window.addEventListener('blur', resetGlobalDrag)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('dragover', preventGlobalDragOver)
      window.removeEventListener('dragenter', preventGlobalDragOver)
      window.removeEventListener('drop', preventGlobalDrop)
      window.removeEventListener('dragend', resetGlobalDrag)
      window.removeEventListener('dragleave', handleGlobalDragLeave)
      window.removeEventListener('blur', resetGlobalDrag)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [resetDragState])

  // --- Navigation ---
  const navigateToPath = useCallback(
    (path: string) => {
      loadDirectoryWithAuth(path)
    },
    [loadDirectoryWithAuth],
  )

  const handleItemClick = useCallback(
    async (item: DirectoryItem) => {
      if (item.is_dir) {
        navigateToPath(item.path)
      } else {
        await previewFileContent(item.path, item.name, items)
        setActiveTab(TAB.PREVIEW)
      }
    },
    [navigateToPath, previewFileContent, items],
  )

  const closePreview = useCallback(() => {
    originalClosePreview()
    setActiveTab(isMobileLayout ? TAB.DIRECTORY : TAB.EMPTY)
  }, [originalClosePreview, isMobileLayout])

  const handleShowDetails = useCallback(() => {
    setShowUploadDetailsTab(true)
    setActiveTab(TAB.UPLOAD_DETAILS)
  }, [])

  const closeUploadDetails = useCallback(() => {
    setShowUploadDetailsTab(false)
    if (activeTab === TAB.UPLOAD_DETAILS) {
      setActiveTab(isMobileLayout ? TAB.DIRECTORY : TAB.EMPTY)
    }
  }, [activeTab, isMobileLayout])

  // --- Resize handle callback ---
  const handleResize = useCallback(
    (newFileWidth: number) => {
      const container = mainContainerRef.current
      if (!container) return
      setFileContainerWidth(newFileWidth)
      setTabsContainerWidth(container.getBoundingClientRect().width - newFileWidth - 4)
      sessionStorage.setItem('lansendFileContainerWidth', newFileWidth.toString())
    },
    [setFileContainerWidth, setTabsContainerWidth],
  )

  // --- Config ---
  // Use refs for values that shouldn't trigger config re-fetch
  const isMobileLayoutRef = useRef(isMobileLayout)
  useEffect(() => { isMobileLayoutRef.current = isMobileLayout }, [isMobileLayout])
  const previewFileRef = useRef(previewFile)
  useEffect(() => { previewFileRef.current = previewFile }, [previewFile])

  const loadConfig = useCallback(async () => {
    try {
      const config = await getLansendConfig()
      setDownloadEnabled(config.download_enabled === true)
      setUploadEnabled(config.upload_enabled === true)
      setChatEnabled(config.chat_enabled === true)
      if (config.upload_enabled === true && isMobileLayoutRef.current && !previewFileRef.current) {
        setActiveTab(TAB.DIRECTORY)
      }
    } catch (e) {
      console.error('Failed to fetch config:', e)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  // --- 访问密码 ---
  // 任何请求撞上访问密码都会广播事件（含后台轮询），这里统一把页面切回登录态
  useEffect(() => {
    const onAccessRequired = () => setNeedsAccess(true)
    window.addEventListener(ACCESS_REQUIRED_EVENT, onAccessRequired)
    return () => window.removeEventListener(ACCESS_REQUIRED_EVENT, onAccessRequired)
  }, [])

  useEffect(() => {
    if (needsAccess) stopPolling()
  }, [needsAccess, stopPolling])

  const handleAccessGranted = useCallback(async () => {
    setNeedsAccess(false)
    await loadConfig()
    const data = await loadDirectoryWithAuth(restorePathFromSession())
    if (data) startPolling()
  }, [loadConfig, loadDirectoryWithAuth, restorePathFromSession, startPolling])

  // --- Init ---
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 768px)').matches
    if (mobile) {
      setActiveTab(TAB.DIRECTORY)
    }
    const initialPath = restorePathFromSession()
    void loadDirectoryWithAuth(initialPath).then((data) => {
      // 没拿到数据（例如需要访问密码）就等登录成功后由 handleAccessGranted 起轮询
      if (data) startPolling()
    })
  }, [restorePathFromSession, loadDirectoryWithAuth, startPolling])

  // Stop polling on unmount
  useEffect(() => {
    return () => { stopPolling() }
  }, [stopPolling])

  // Clear selection on path change
  useEffect(() => {
    clearSelection()
  }, [currentPath, clearSelection])

  useEffect(() => {
    if (!downloadEnabled) clearSelection()
  }, [downloadEnabled, clearSelection])

  // --- Render ---
  // 需要访问密码时整页换成登录界面：文件列表、聊天、预览都不该先闪一下再被挡住
  if (needsAccess) {
    return <AccessLogin onSuccess={handleAccessGranted} />
  }

  const fileListProps = {
    downloadEnabled,
    uploadEnabled,
    uploadPathHint,
    onNavigate: navigateToPath,
    onItemClick: handleItemClick,
    onDragOver: handleDragOver,
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onFilesSelected: handleFiles,
    onShowDetails: handleShowDetails,
  }

  return (
    <div
      ref={mainContainerRef}
      className="main-container flex flex-col md:flex-row gap-0 w-full max-w-full m-0 h-dvh max-h-dvh items-stretch relative min-h-0 overflow-hidden"
    >
      {/* Desktop: Left panel - FileList */}
      <div
        className="hidden md:flex flex-none min-w-50 max-w-[calc(100%-320px)] min-h-0 bg-white px-5 py-3.75 rounded-l-lg shadow-md flex-col h-full overflow-visible"
        style={{ width: fileContainerWidth + 'px' }}
      >
        <FileList {...fileListProps} />
      </div>

      {/* Desktop: Resize handle */}
      <ResizeHandle
        mainContainerRef={mainContainerRef}
        fileContainerWidth={fileContainerWidth}
        onResize={handleResize}
      />

      {/* Right panel */}
      <div
        className="flex-auto min-w-0 min-h-0 bg-white rounded-lg md:rounded-l-none md:rounded-r-lg shadow-md flex flex-col h-full overflow-hidden relative"
        style={!isMobileLayout ? { width: tabsContainerWidth + 'px' } : undefined}
      >
        <TabBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          chatEnabled={chatEnabled}
          showUploadDetailsTab={showUploadDetailsTab}
          previewFile={previewFile}
          onCloseUploadDetails={closeUploadDetails}
          onClosePreview={closePreview}
          onStartSpeedTest={startSpeedTest}
        />

        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === TAB.EMPTY && !previewFile && (
            <div className="flex-1 flex items-center justify-center p-3.75 md:p-5">
              <div className="text-center text-[#9ca3af] text-sm leading-relaxed px-4 py-3 border border-dashed border-[#e5e7eb] rounded-[10px] bg-[#fafafa]">
                点击左侧文件进行预览
              </div>
            </div>
          )}

          <div
            className={`${activeTab === TAB.DIRECTORY ? '' : 'hidden'} flex-1 flex flex-col overflow-hidden min-h-0 min-w-0`}
          >
            <FileList {...fileListProps} />
          </div>

          {chatEnabled && (
            <div
              className={`${activeTab === TAB.CHAT ? '' : 'hidden'} flex-1 flex flex-col overflow-hidden min-h-0 min-w-0 overscroll-contain touch-manipulation`}
            >
              <ChatTab />
            </div>
          )}

          <div
            className={`${activeTab === TAB.UPLOAD_DETAILS ? '' : 'hidden'} flex-1 flex flex-col overflow-hidden min-h-0 min-w-0 bg-white`}
          >
            <UploadDetailsTab />
          </div>
        </div>

        {/* Preview overlay */}
        {activeTab === TAB.PREVIEW && previewFile && (
          <div className="absolute inset-0 z-5 bg-white flex flex-col pt-11.25">
            <PreviewTab
              previewFile={previewFile}
              previewLoading={previewLoading}
              previewError={previewError}
              videoLoading={previewVideoLoading}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              currentImageIndex={currentImageIndex}
              totalImages={imageFiles.length}
              onVideoLoaded={onPreviewVideoLoaded}
              onVideoError={onPreviewVideoError}
              onPrevImage={prevImage}
              onNextImage={nextImage}
            />
          </div>
        )}
      </div>

      {/* Speed test popup */}
      <SpeedTestPopup
        isVisible={isSpeedTestVisible}
        speedResult={speedResult}
        currentProgress={currentProgress}
        onClose={closeSpeedTest}
        onStartTest={startSpeedTest}
        formatSpeed={formatSpeed}
        formatDuration={formatDuration}
      />

    </div>
  )
}