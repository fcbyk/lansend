import { useState } from 'react'
import { controller } from '../api'
import type { FeatureName, StateView } from '../api'
import { errorText, refresh, showError } from '../store'
import type { BusyKey } from '../store'
import { PasswordDialog } from './PasswordDialog'
import type { PasswordKind } from './PasswordDialog'

interface Props {
  view: StateView | null
  busy: BusyKey | null
}

const FEATURES: { name: FeatureName; label: string; enabled: (view: StateView) => boolean }[] = [
  { name: 'download', label: '下载', enabled: (view) => view.downloadEnabled },
  { name: 'upload', label: '上传', enabled: (view) => view.uploadEnabled },
  { name: 'chat', label: '聊天', enabled: (view) => view.chatEnabled },
]

/**
 * 功能开关是「本地立即生效 + 后台确认」，刻意不走全局 busy：
 *
 *  1. checked 直接绑后端快照时，点击瞬间 React 会用旧值把 DOM 改回去，
 *     请求回来再翻回来 —— 勾选框自己闪两下；
 *  2. 全局 busy 会让端口、目录按钮、启动按钮一起变灰，状态栏提示也换成
 *     「处理中…」，看起来就像整页重载。
 *
 * 所以先记一份本地值，等快照刷新完成再交还给 view。
 */
export function FeaturePills({ view, busy }: Props) {
  const [pending, setPending] = useState<Partial<Record<FeatureName, boolean>>>({})
  const [dialog, setDialog] = useState<PasswordKind | null>(null)

  const toggle = (name: FeatureName, next: boolean) => {
    if (busy || pending[name] !== undefined) return

    setPending((prev) => ({ ...prev, [name]: next }))

    void (async () => {
      let err: unknown = null

      try {
        await controller.setFeature(name, next)
      } catch (e) {
        err = e
      }

      // 无论成败都拉一次快照：成功时确认新值，失败时回到后端的真值
      try {
        await refresh()
      } catch (e) {
        err ??= e
      }

      if (err) showError(errorText(err))

      setPending((prev) => {
        const rest = { ...prev }
        delete rest[name]
        return rest
      })
    })()
  }

  return (
    <section className="field">
      <span className="label">功能</span>
      <div className="pills">
        {FEATURES.map((feature) => (
          <label className="pill" key={feature.name}>
            <input
              type="checkbox"
              checked={pending[feature.name] ?? (view ? feature.enabled(view) : false)}
              onChange={(event) => toggle(feature.name, event.currentTarget.checked)}
            />
            <span>{feature.label}</span>
          </label>
        ))}

        {/* 前三个 pill 点一下就翻转状态；这两个是入口，所以用 button 而不是 checkbox ——
            否则点下去的瞬间勾选态会先自己翻一次，看起来像已经启用了，实际只是打开了浮窗。
            高亮只反映后端真实状态（已启用且密码非空）。 */}
        <button
          type="button"
          className="pill pill-btn"
          aria-haspopup="dialog"
          onClick={() => setDialog('upload')}
        >
          <span className={view?.passwordSet ? 'on' : ''}>上传密码</span>
        </button>

        <button
          type="button"
          className="pill pill-btn"
          aria-haspopup="dialog"
          onClick={() => setDialog('access')}
        >
          <span className={view?.accessPasswordSet ? 'on' : ''}>访问密码</span>
        </button>
      </div>

      {dialog && <PasswordDialog kind={dialog} onClose={() => setDialog(null)} />}
    </section>
  )
}
