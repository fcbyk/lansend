import { createContext, useContext, type ReactNode } from 'react'
import { useLansendSpeed } from '../hooks/useLansendSpeed'

const SpeedContext = createContext<ReturnType<typeof useLansendSpeed> | null>(null)

export function SpeedProvider({ children }: { children: ReactNode }) {
  const value = useLansendSpeed()
  return <SpeedContext.Provider value={value}>{children}</SpeedContext.Provider>
}

export function useSpeedContext() {
  const ctx = useContext(SpeedContext)
  if (!ctx) throw new Error('useSpeedContext must be used within SpeedProvider')
  return ctx
}
