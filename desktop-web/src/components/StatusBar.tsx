import type { StateView } from '../api'
import type { BusyKey } from '../store'

interface Props {
  view: StateView | null
  busy: BusyKey | null
}

function hintText(view: StateView | null, busy: BusyKey | null) {
  if (!view) return ''
  if (busy) return '处理中…'
  if (view.running) return `本机访问 ${view.localUrl}`
  return '选择目录与端口后，点击「启动服务」'
}

export function StatusBar({ view, busy }: Props) {
  const running = view?.running ?? false

  return (
    <section className="status">
      <span className={running ? 'badge on' : 'badge'}>{view ? (running ? '运行中' : '已停止') : '连接中…'}</span>
      <span className="hint">{hintText(view, busy)}</span>
    </section>
  )
}
