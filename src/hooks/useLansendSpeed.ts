import { useCallback, useState } from 'react'

import { downloadSpeedTest, pingTest, uploadSpeedTest } from '../api'
import type { SpeedTestResult } from '../types'
import { formatDuration, formatSpeed } from '../utils/format'

export function useLansendSpeed() {
  const [isSpeedTestVisible, setIsSpeedTestVisible] = useState(false)
  const [speedResult, setSpeedResult] = useState<SpeedTestResult>({
    ping: 0,
    download: 0,
    upload: 0,
    status: 'idle',
  })
  const [currentProgress, setCurrentProgress] = useState(0)

  const startSpeedTest = useCallback(async () => {
    setIsSpeedTestVisible(true)
    setSpeedResult({
      ping: 0,
      download: 0,
      upload: 0,
      status: 'pinging',
      error: undefined,
    })
    setCurrentProgress(0)

    try {
      const pings: number[] = []
      for (let index = 0; index < 3; index++) {
        pings.push(await pingTest())
      }

      setSpeedResult((prev) => ({
        ...prev,
        ping: Math.round(pings.reduce((sum, ping) => sum + ping, 0) / pings.length),
        status: 'downloading',
      }))
      setCurrentProgress(0)

      const download = await downloadSpeedTest(50, (progress, instantSpeed) => {
        setCurrentProgress(progress)
        setSpeedResult((prev) => ({
          ...prev,
          download: instantSpeed,
        }))
      })

      setSpeedResult((prev) => ({
        ...prev,
        download,
        status: 'uploading',
      }))
      setCurrentProgress(0)

      const upload = await uploadSpeedTest(30, (progress, instantSpeed) => {
        setCurrentProgress(progress)
        setSpeedResult((prev) => ({
          ...prev,
          upload: instantSpeed,
        }))
      })

      setSpeedResult((prev) => ({
        ...prev,
        upload,
        status: 'completed',
      }))
    } catch (error) {
      console.error('Speed test error:', error)
      setSpeedResult((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : '测速失败',
      }))
    }
  }, [])

  const closeSpeedTest = useCallback(() => {
    setIsSpeedTestVisible(false)
  }, [])

  return {
    isSpeedTestVisible,
    speedResult,
    currentProgress,
    startSpeedTest,
    closeSpeedTest,
    formatSpeed,
    formatDuration,
  }
}
