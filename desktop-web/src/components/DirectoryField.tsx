import { controller } from '../api'
import type { StateView } from '../api'
import { refresh, run } from '../store'
import type { BusyKey } from '../store'

interface Props {
  view: StateView | null
  busy: BusyKey | null
}

export function DirectoryField({ view, busy }: Props) {
  // 运行中直接把「选择」收起来：共享目录在运行中改动同样要重建服务，
  // 留一个可点的按钮只会让人以为随时能换。
  const locked = view?.running ?? false

  const pick = () => {
    void run('directory', async () => {
      const dir = await controller.pickDirectory()
      if (dir) await refresh()
    })
  }

  return (
    <section className="field">
      <label htmlFor="directory">共享目录</label>
      <div className={locked ? 'combo locked' : 'combo'}>
        <input id="directory" type="text" readOnly value={view?.directory ?? ''} />
        {locked ? null : (
          <button
            id="pick"
            className="combo-btn"
            type="button"
            disabled={busy !== null}
            onClick={pick}
          >
            选择
          </button>
        )}
      </div>
    </section>
  )
}
