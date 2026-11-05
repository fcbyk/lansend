import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { controller } from '../api'
import type { StateView } from '../api'
import { act } from '../store'
import { QrPanel } from './QrPanel'

interface Props {
  view: StateView | null
}

/** 可切换的一条地址。key 用「网卡名 + 主机」而不是完整 URL，换端口后选中项才不会丢。 */
interface Option {
  key: string
  iface: string
  url: string
  virtual: boolean
}

const ICON_COPY = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect x="6" y="6" width="7.5" height="7.5" rx="1.6" />
    <path d="M10.5 3.9v-.5A1.4 1.4 0 0 0 9.1 2H3.9a1.4 1.4 0 0 0-1.4 1.4v5.2A1.4 1.4 0 0 0 3.9 10h.6" />
  </svg>
)

const ICON_OPEN = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9.2 2.8h4v4" />
    <path d="M13.2 2.8 7.6 8.4" />
    <path d="M12.4 9.8v2.2a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 12.1V5.5a1.4 1.4 0 0 1 1.4-1.4h2.2" />
  </svg>
)

const ICON_REFRESH = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" />
    <path d="M13.4 2.6v3.8H9.6" />
  </svg>
)

const ICON_CHEV = (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2.5 4 5 6.5 7.5 4" />
  </svg>
)

const ICON_QR = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2" width="4.8" height="4.8" rx="1.1" />
    <rect x="9.2" y="2" width="4.8" height="4.8" rx="1.1" />
    <rect x="2" y="9.2" width="4.8" height="4.8" rx="1.1" />
    <rect x="9.4" y="9.4" width="1.7" height="1.7" fill="currentColor" stroke="none" />
    <rect x="12.1" y="12.1" width="1.7" height="1.7" fill="currentColor" stroke="none" />
  </svg>
)

function hostOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function buildOptions(view: StateView | null): Option[] {
  if (!view) return []

  // 后端在没有任何地址时曾发出 null（nil slice），这里兜一层，
  // 免得一次快照就把整个界面炸成黑屏。
  const list: Option[] = (view.urls ?? []).map((item) => ({
    key: `${item.iface}|${hostOf(item.url)}`,
    iface: item.iface,
    url: item.url,
    virtual: item.virtual,
  }))

  // 本机放最后：分享场景默认用局域网地址，回环地址只是本机调试用
  list.push({ key: 'local', iface: '本机', url: view.localUrl, virtual: false })
  return list
}

export function AddressList({ view }: Props) {
  const running = view?.running ?? false
  const options = buildOptions(view)

  const [selectedKey, setSelectedKey] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [done, setDone] = useState(false)
  const [panelMax, setPanelMax] = useState<number>()
  const [qrUrl, setQrUrl] = useState<string>()
  const cardRef = useRef<HTMLLIElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  // 候选浮层尽量一次显示全部网卡：上限取「地址行下沿到启动按钮上沿」。
  // 只有窗口实在放不下时才在浮层内部滚动（正常情况下不应该发生）。
  useLayoutEffect(() => {
    if (!expanded) return
    const card = cardRef.current
    const footer = document.querySelector('.footer')
    if (!card || !footer) return

    const room = footer.getBoundingClientRect().top - card.getBoundingClientRect().bottom - 8
    setPanelMax(Math.max(96, room))
  }, [expanded, options.length])

  // 浮层会盖住下面的表单，点到外面就收起来
  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [expanded])

  // 选中的网卡可能被拔掉（Wi-Fi 断开），这时回落到第一项，
  // 别让地址停在一个已经不存在的主机上。
  const selected = options.find((option) => option.key === selectedKey) ?? options[0]
  const switchable = options.length > 1

  const copy = () => {
    if (!selected) return
    void act(async () => {
      await controller.copyURL(selected.url)
      setDone(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setDone(false), 1200)
    })
  }

  const openInBrowser = () => {
    if (!selected) return
    void act(async () => {
      await controller.openInBrowser(selected.url)
    })
  }

  const refreshNetworks = () => {
    void act(async () => {
      await controller.refreshNetworks()
    })
  }

  let body
  if (!running) {
    body = <li className="empty">服务未启动</li>
  } else if (!selected || (view?.urls?.length ?? 0) === 0) {
    body = <li className="empty">未检测到局域网地址</li>
  } else {
    body = (
      <li ref={cardRef} className={expanded ? 'addr open' : 'addr'}>
        <div className="addr-main">
          <button
            className="iface-btn"
            type="button"
            disabled={!switchable}
            title={switchable ? '切换网卡' : undefined}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="name">{selected.iface}</span>
            {selected.virtual ? <span className="tag">虚拟</span> : null}
            {switchable ? ICON_CHEV : null}
          </button>
          <span className="url" title={selected.url}>
            {selected.url}
          </span>
          <div className="actions">
            <button
              className={done ? 'icon-btn done' : 'icon-btn'}
              type="button"
              title="复制地址"
              aria-label="复制地址"
              onClick={copy}
            >
              {ICON_COPY}
            </button>
            <button
              className="icon-btn"
              type="button"
              title="在浏览器打开"
              aria-label="在浏览器打开"
              onClick={openInBrowser}
            >
              {ICON_OPEN}
            </button>
            <button
              className="icon-btn"
              type="button"
              title="显示二维码"
              aria-label="显示二维码"
              onClick={() => {
                setExpanded(false)
                setQrUrl(selected.url)
              }}
            >
              {ICON_QR}
            </button>
          </div>
        </div>

        {expanded ? (
          <ul className="options" style={{ maxHeight: panelMax }}>
            {options.map((option) => (
              <li key={option.key}>
                <button
                  className={option.key === selected.key ? 'opt active' : 'opt'}
                  type="button"
                  onClick={() => {
                    setSelectedKey(option.key)
                    setExpanded(false)
                  }}
                >
                  <span className="opt-iface">{option.iface}</span>
                  {option.virtual ? <span className="tag">虚拟</span> : null}
                  <span className="opt-url">{option.url}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <section className="addresses">
      <div className="section-head">
        <span className="label">
          访问地址
          {running ? <span className="live">运行中</span> : null}
        </span>
        <button
          className="icon-btn"
          type="button"
          title="重新检测网卡"
          aria-label="重新检测网卡"
          disabled={!running}
          onClick={refreshNetworks}
        >
          {ICON_REFRESH}
        </button>
      </div>
      <ul className="urls">{body}</ul>
      {qrUrl ? <QrPanel url={qrUrl} onClose={() => setQrUrl(undefined)} /> : null}
    </section>
  )
}
