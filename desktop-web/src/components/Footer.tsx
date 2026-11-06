import { useEffect, useRef, useState } from 'react'
import { controller } from '../api'
import type { StateView } from '../api'
import { act, getSnapshot, refresh, run } from '../store'
import type { BusyKey } from '../store'

interface Props {
  view: StateView | null
  busy: BusyKey | null
  error: string
}

export function Footer({ view, busy, error }: Props) {
  const running = view?.running ?? false
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const toggle = () => {
    void run('toggle', async () => {
      const isRunning = getSnapshot().view?.running ?? false
      await (isRunning ? controller.stop() : controller.start())
      await refresh()
    })
  }

  // 时间语义的版本同一天内不变，所以哈希必须一起显示，否则判断不了是哪一次构建。
  // 匿名构建（go run / 没打 tag）拿不到哈希，这时只显示版本，不留一个 "unknown"。
  const version = view?.version ?? ''
  const hash = view?.commitHash && view.commitHash !== 'unknown' ? view.commitHash : ''
  const label = [version, hash].filter(Boolean).join(' · ')

  const copyVersion = () => {
    void act(async () => {
      await controller.copyText(label)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <section className="footer">
      {error ? <p className="error">{error}</p> : null}
      <button
        className={`btn block ${running ? 'danger' : 'primary'}`}
        type="button"
        disabled={busy === 'toggle'}
        onClick={toggle}
      >
        {running ? '停止服务' : '启动服务'}
      </button>
      {label ? (
        <button
          className={copied ? 'version copied' : 'version'}
          type="button"
          title="复制版本信息"
          onClick={copyVersion}
        >
          {copied ? '已复制' : label}
        </button>
      ) : null}
    </section>
  )
}
