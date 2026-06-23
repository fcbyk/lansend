import { useState, useEffect, useRef, type RefObject } from 'react'
import type { LansendActiveTab, PreviewFile } from '../types'
import { TAB } from '../constants'

export function useWindowResize(
  mainContainerRef: RefObject<HTMLDivElement | null>,
  activeTab: LansendActiveTab,
  previewFile: PreviewFile | null,
  onSwitchFromMobile?: (hasPreview: boolean) => void,
) {
  const [fileContainerWidth, setFileContainerWidth] = useState(400)
  const [tabsContainerWidth, setTabsContainerWidth] = useState(0)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const isMobileLayoutRef = useRef(false)

  // Internal refs to keep latest values available inside the resize listener
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  const previewFileRef = useRef(previewFile)
  useEffect(() => { previewFileRef.current = previewFile }, [previewFile])

  // Keep onSwitchFromMobile up to date via ref so the effect doesn't need it as a dep
  const onSwitchFromMobileRef = useRef(onSwitchFromMobile)
  useEffect(() => { onSwitchFromMobileRef.current = onSwitchFromMobile }, [onSwitchFromMobile])

  useEffect(() => {
    // Initialize container widths
    const container = mainContainerRef.current
    if (container) {
      const totalWidth = container.offsetWidth
      const savedFileWidth = sessionStorage.getItem('lansendFileContainerWidth')
      let fw: number, tw: number
      if (savedFileWidth) {
        const saved = parseInt(savedFileWidth, 10)
        fw = Math.max(200, Math.min(totalWidth - 304, saved))
        tw = totalWidth - fw - 4
      } else {
        fw = Math.floor(totalWidth * 0.4)
        tw = totalWidth - fw - 4
      }
      queueMicrotask(() => {
        setFileContainerWidth(fw)
        setTabsContainerWidth(tw)
      })
    }

    // Detect mobile layout
    const mobile = window.matchMedia('(max-width: 768px)').matches
    isMobileLayoutRef.current = mobile
    queueMicrotask(() => setIsMobileLayout(mobile))

    const handleResize = () => {
      const c = mainContainerRef.current
      if (c) {
        const totalWidth = c.offsetWidth
        const savedFileWidth = sessionStorage.getItem('lansendFileContainerWidth')
        let fw: number
        if (savedFileWidth) {
          fw = Math.max(200, Math.min(totalWidth - 304, parseInt(savedFileWidth, 10)))
        } else {
          fw = Math.floor(totalWidth * 0.4)
        }
        setFileContainerWidth(fw)
        setTabsContainerWidth(totalWidth - fw - 4)
      }
      const m = window.matchMedia('(max-width: 768px)').matches
      // When switching from mobile to desktop, don't stay on directory tab (would show two file lists)
      if (isMobileLayoutRef.current && !m && activeTabRef.current === TAB.DIRECTORY) {
        onSwitchFromMobileRef.current?.(!!previewFileRef.current)
      }
      isMobileLayoutRef.current = m
      setIsMobileLayout(m)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return {
    fileContainerWidth,
    setFileContainerWidth,
    tabsContainerWidth,
    setTabsContainerWidth,
    isMobileLayout,
    isMobileLayoutRef,
  }
}
