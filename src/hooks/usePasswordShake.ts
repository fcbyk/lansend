import { useEffect, useRef, useState } from 'react'

export function usePasswordShake(
  error: string | undefined,
  isVisible: boolean,
) {
  const [shouldShake, setShouldShake] = useState(false)
  const prevErrorRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!error) {
      prevErrorRef.current = undefined
      return
    }
    if (!isVisible) return

    // Only shake on new errors
    if (error !== prevErrorRef.current) {
      prevErrorRef.current = error
      const timer = window.setTimeout(() => setShouldShake(true), 0)
      return () => window.clearTimeout(timer)
    }
  }, [error, isVisible])

  const onShakeEnd = () => setShouldShake(false)

  return { shouldShake, onShakeEnd }
}
