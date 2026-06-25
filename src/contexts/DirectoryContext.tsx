import { createContext, useContext, type ReactNode } from 'react'
import { useLansendDirectory } from '../hooks/useLansendDirectory'

const DirectoryContext = createContext<ReturnType<typeof useLansendDirectory> | null>(null)

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const value = useLansendDirectory()
  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>
}

export function useDirectoryContext() {
  const ctx = useContext(DirectoryContext)
  if (!ctx) throw new Error('useDirectoryContext must be used within DirectoryProvider')
  return ctx
}
