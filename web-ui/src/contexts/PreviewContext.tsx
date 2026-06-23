import { createContext, useContext, type ReactNode } from 'react'
import { useLansendPreview } from '../hooks/useLansendPreview'

const PreviewContext = createContext<ReturnType<typeof useLansendPreview> | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
  const value = useLansendPreview()
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
}

export function usePreviewContext() {
  const ctx = useContext(PreviewContext)
  if (!ctx) throw new Error('usePreviewContext must be used within PreviewProvider')
  return ctx
}
