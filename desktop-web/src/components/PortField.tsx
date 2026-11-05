import { useEffect, useRef } from 'react'
import { controller } from '../api'
import type { StateView } from '../api'
import { clearError, getSnapshot, refresh, run, showError } from '../store'
import type { BusyKey } from '../store'

interface Props {
  view: StateView | null
  busy: BusyKey | null
}

export function PortField({ view, busy }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const port = view?.port
  // 端口在运行中不可改：改端口等于重建服务，运行到一半改容易让人以为
  // 服务还在旧端口上。要换端口就先停下。
  const locked = (view?.running ?? false) || busy !== null

  // 快照更新时回填输入框，但用户正在编辑就不打断
  useEffect(() => {
    const input = ref.current
    if (!input || port === undefined) return
    if (document.activeElement === input) return
    input.value = String(port)
  }, [port])

  // 用原生 change：只在值被提交（失焦或回车）时触发，与旧实现一致。
  // React 的 onChange 是逐键触发的 input 事件，语义不同，所以不用它。
  useEffect(() => {
    const input = ref.current
    if (!input) return

    const commit = () => {
      const next = Number.parseInt(input.value, 10)
      const snapshot = getSnapshot()
      const current = snapshot.view?.port

      // 运行中（或有动作正在跑，提交会被队列丢掉）时还原输入框，
      // 免得界面上的端口和实际监听端口对不上。
      if (snapshot.busy || snapshot.view?.running) {
        if (current !== undefined) input.value = String(current)
        return
      }

      if (!Number.isInteger(next) || next < 1 || next > 65535) {
        showError('端口必须是 1 - 65535 之间的整数')
        if (current !== undefined) input.value = String(current)
        return
      }
      // 值没变就不必重建服务
      if (next === current) {
        clearError()
        return
      }
      void run('port', async () => {
        await controller.setPort(next)
        await refresh()
      })
    }

    input.addEventListener('change', commit)
    return () => input.removeEventListener('change', commit)
  }, [])

  return (
    <section className="field">
      <label htmlFor="port">端口</label>
      <input
        id="port"
        ref={ref}
        type="number"
        min={1}
        max={65535}
        step={1}
        inputMode="numeric"
        disabled={locked}
        // 回车即提交：失焦会触发 change，避免再点一次别处
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </section>
  )
}
