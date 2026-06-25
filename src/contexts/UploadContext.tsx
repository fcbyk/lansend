import { createContext, useContext, type ReactNode } from 'react'
import { useLansendUpload } from '../hooks/useLansendUpload'

const UploadContext = createContext<ReturnType<typeof useLansendUpload> | null>(null)

export function UploadProvider({ children }: { children: ReactNode }) {
  const value = useLansendUpload()
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}

export function useUploadContext() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploadContext must be used within UploadProvider')
  return ctx
}
