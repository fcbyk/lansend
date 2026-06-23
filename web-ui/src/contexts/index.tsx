import type { ReactNode } from 'react'
import { DirectoryProvider } from './DirectoryContext'
import { UploadProvider } from './UploadContext'
import { PreviewProvider } from './PreviewContext'
import { SelectionProvider } from './SelectionContext'
import { SpeedProvider } from './SpeedContext'

export { useDirectoryContext } from './DirectoryContext'
export { useUploadContext } from './UploadContext'
export { usePreviewContext } from './PreviewContext'
export { useSelectionContext } from './SelectionContext'
export { useSpeedContext } from './SpeedContext'

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <DirectoryProvider>
      <UploadProvider>
        <PreviewProvider>
          <SelectionProvider>
            <SpeedProvider>
              {children}
            </SpeedProvider>
          </SelectionProvider>
        </PreviewProvider>
      </UploadProvider>
    </DirectoryProvider>
  )
}
