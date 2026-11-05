import { controller } from '../api'
import type { StateView } from '../api'
import { getSnapshot, refresh, run } from '../store'
import type { BusyKey } from '../store'

interface Props {
  view: StateView | null
  busy: BusyKey | null
  error: string
}

export function Footer({ view, busy, error }: Props) {
  const running = view?.running ?? false

  const toggle = () => {
    void run('toggle', async () => {
      const isRunning = getSnapshot().view?.running ?? false
      await (isRunning ? controller.stop() : controller.start())
      await refresh()
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
    </section>
  )
}
