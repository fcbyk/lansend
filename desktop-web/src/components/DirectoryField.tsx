import { controller } from '../api'
import type { StateView } from '../api'
import { refresh, run } from '../store'
import type { BusyKey } from '../store'

interface Props {
  view: StateView | null
  busy: BusyKey | null
}

export function DirectoryField({ view, busy }: Props) {
  const pick = () => {
    void run('directory', async () => {
      const dir = await controller.pickDirectory()
      if (dir) await refresh()
    })
  }

  return (
    <section className="field">
      <label htmlFor="directory">共享目录</label>
      <div className="combo">
        <input id="directory" type="text" readOnly value={view?.directory ?? ''} />
        <button
          id="pick"
          className="combo-btn"
          type="button"
          disabled={busy === 'directory'}
          onClick={pick}
        >
          选择
        </button>
      </div>
    </section>
  )
}
