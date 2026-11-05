import { controller } from '../api'
import type { FeatureName, StateView } from '../api'
import { refresh, run } from '../store'

interface Props {
  view: StateView | null
  busy: boolean
}

const FEATURES: { name: FeatureName; label: string; enabled: (view: StateView) => boolean }[] = [
  { name: 'download', label: '下载', enabled: (view) => view.downloadEnabled },
  { name: 'upload', label: '上传', enabled: (view) => view.uploadEnabled },
  { name: 'chat', label: '聊天', enabled: (view) => view.chatEnabled },
]

export function FeaturePills({ view, busy }: Props) {
  return (
    <section className="field">
      <span className="label">功能</span>
      <div className="pills">
        {FEATURES.map((feature) => (
          <label className="pill" key={feature.name}>
            <input
              type="checkbox"
              checked={view ? feature.enabled(view) : false}
              disabled={busy}
              onChange={(event) => {
                const enabled = event.currentTarget.checked
                void run(async () => {
                  await controller.setFeature(feature.name, enabled)
                  await refresh()
                })
              }}
            />
            <span>{feature.label}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
