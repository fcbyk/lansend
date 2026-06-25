import { createContext, useContext, type ReactNode } from 'react'
import { useSelection } from '../hooks/useSelection'

const SelectionContext = createContext<ReturnType<typeof useSelection> | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const value = useSelection()
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelectionContext() {
  const ctx = useContext(SelectionContext)
  if (!ctx) throw new Error('useSelectionContext must be used within SelectionProvider')
  return ctx
}
