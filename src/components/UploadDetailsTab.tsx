import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChevronDown, ChevronRight, FileText, X } from 'lucide-react'

import { useUploadContext } from '../contexts/UploadContext'
import { useUploadTaskGroups, type UploadTaskGroup } from '../hooks/useUploadTaskGroups'

function isGroupActive(group: UploadTaskGroup) {
  return group.tasks.some((t) => t.status === 'uploading')
}

function formatCompletedAt(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

export const UploadDetailsTab = memo(function UploadDetailsTab() {
  const { uploadTasks, cancelTask, clearTasksByPath } = useUploadContext()

  const { groupedUploads } = useUploadTaskGroups(
    () => uploadTasks,
    () => undefined,
  )

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const manualCollapsedPathsRef = useRef<Set<string>>(new Set())
  const lastActivePathsRef = useRef<Set<string>>(new Set())

  const sortedGroups = useMemo(() => {
    const groups = groupedUploads.slice()
    return groups.sort((a, b) => {
      const aActive = isGroupActive(a)
      const bActive = isGroupActive(b)
      if (aActive !== bActive) return aActive ? -1 : 1
      const aPath = a.path || '/'
      const bPath = b.path || '/'
      return aPath.localeCompare(bPath, 'zh-Hans-CN')
    })
  }, [groupedUploads])

  const activePathsKey = useMemo(() => {
    const paths: string[] = []
    sortedGroups.forEach((group) => {
      if (isGroupActive(group)) {
        paths.push(group.path || '/')
      }
    })
    return paths.sort().join(',')
  }, [sortedGroups])

  useEffect(() => {
    const currentActive = new Set(activePathsKey.split(',').filter(Boolean))
    const prevActive = lastActivePathsRef.current
    const newActive = new Set<string>()
    const newlyInactive = new Set<string>()

    currentActive.forEach((p) => {
      newActive.add(p)
      if (!prevActive.has(p) && !manualCollapsedPathsRef.current.has(p)) {
        queueMicrotask(() => {
          setExpandedPaths((prev) => new Set(prev).add(p))
        })
      }
    })

    prevActive.forEach((p) => {
      if (!currentActive.has(p)) {
        newlyInactive.add(p)
        manualCollapsedPathsRef.current.delete(p)
        queueMicrotask(() => {
          setExpandedPaths((prev) => {
            const next = new Set(prev)
            next.delete(p)
            return next
          })
        })
      }
    })

    lastActivePathsRef.current = newActive
  }, [activePathsKey])

  const toggleGroup = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
        if (lastActivePathsRef.current.has(path)) {
          manualCollapsedPathsRef.current.add(path)
        }
      } else {
        next.add(path)
        manualCollapsedPathsRef.current.delete(path)
      }
      return next
    })
  }, [])

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-4">
        {groupedUploads.length === 0 && (
          <div className="text-center text-[#999] py-8">暂无上传任务</div>
        )}
        {groupedUploads.length > 0 && (
          <div className="flex flex-col gap-4">
            {sortedGroups.map((group) => {
              const groupPath = group.path || '/'
              const expanded = expandedPaths.has(groupPath)
              const active = isGroupActive(group)
              return (
                <div
                  key={group.path}
                  className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 bg-[#f8fafc] border-b border-[#e5e7eb] flex items-center justify-between gap-3 text-left transition-colors hover:bg-[#f1f5f9]"
                    onClick={() => toggleGroup(groupPath)}
                    aria-expanded={expanded}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="flex-none text-[#64748b]">
                        {expanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[13px] text-[#1f2937] truncate" title={groupPath}>
                          {groupPath}
                        </div>
                        <div className="text-[12px] text-[#94a3b8] mt-0.5 truncate">
                          {group.statusText}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-none">
                      <span className="text-[12px] text-[#64748b] font-medium">
                        {group.tasks.filter((t) => t.status === 'completed').length} / {group.tasks.length}
                      </span>
                      <span className="text-[12px] text-[#1f2937] font-semibold">
                        {Math.round(group.totalProgress)}%
                      </span>
                      <button
                        type="button"
                        className="p-1 text-[#94a3b8] hover:text-[#ef4444] active:text-[#ef4444] active:bg-[#fee2e2] rounded-md transition-all touch-manipulation cursor-pointer border-none bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearTasksByPath(groupPath)
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </button>

                  <div className="h-1 bg-[#eef2ff]">
                    <div
                      className={`h-full transition-[width] duration-300 ${
                        active
                          ? 'bg-linear-to-r from-[#3b82f6] to-[#22c55e]'
                          : 'bg-linear-to-r from-[#22c55e] to-[#16a34a]'
                      }`}
                      style={{ width: `${Math.round(group.totalProgress)}%` }}
                    />
                  </div>

                  <div
                    className={`grid transition-all duration-300 ${
                      expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden bg-white">
                      {group.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="px-4 py-3 border-b border-[#f1f5f9] last:border-0 flex flex-col gap-2 hover:bg-[#f8fafc] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="w-4 h-4 text-[#94a3b8] flex-none" />
                              <span className="text-[13px] text-[#334155] truncate flex-1" title={task.file.name}>
                                {task.file.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-none">
                              {task.status === 'completed' && task.completedAt && (
                                <span className="text-[11px] text-[#94a3b8] whitespace-nowrap">
                                  {formatCompletedAt(task.completedAt)}
                                </span>
                              )}
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                  task.status === 'error'
                                    ? 'bg-[#fee2e2] text-[#b91c1c]'
                                    : task.status === 'completed'
                                      ? 'bg-[#dcfce7] text-[#15803d]'
                                      : task.status === 'uploading'
                                        ? 'bg-[#dbeafe] text-[#1d4ed8]'
                                        : 'bg-[#e2e8f0] text-[#64748b]'
                                }`}
                              >
                                {task.status === 'uploading'
                                  ? `${Math.round(task.progress)}%`
                                  : task.status === 'pending'
                                    ? '等待'
                                    : task.status === 'error'
                                      ? '失败'
                                      : '已完成'}
                              </span>
                              {task.status !== 'completed' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    cancelTask(task.id)
                                  }}
                                  className="p-1 text-[#94a3b8] hover:text-[#ef4444] active:text-[#ef4444] active:bg-[#fee2e2] rounded-md transition-all touch-manipulation cursor-pointer border-none bg-transparent"
                                  title="取消上传"
                                  type="button"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})
