import { useEffect, useRef, useState } from 'react'
import { controller } from '../api'
import type { StateView, URLView } from '../api'
import { act } from '../store'

interface Props {
  view: StateView | null
}

// 图标按钮：条目多时比文字按钮安静得多，功能靠 title 提示。
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

function AddressRow({ item }: { item: URLView }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = () => {
    void act(async () => {
      await controller.copyURL(item.url)
      setDone(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setDone(false), 1200)
    })
  }

  const open = () => {
    void act(async () => {
      await controller.openInBrowser(item.url)
    })
  }

  return (
    <li>
      <span className="iface">{item.iface}</span>
      <span className="url" title={item.url}>
        {item.url}
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
          onClick={open}
        >
          {ICON_OPEN}
        </button>
      </div>
    </li>
  )
}

export function AddressList({ view }: Props) {
  const running = view?.running ?? false
  const urls = view?.urls ?? []

  let content
  if (!running) {
    content = <li className="empty">服务未启动</li>
  } else if (urls.length === 0) {
    content = <li className="empty">未检测到局域网地址</li>
  } else {
    content = urls.map((item) => (
      <AddressRow key={`${item.iface}|${item.url}`} item={item} />
    ))
  }

  return (
    <section className="addresses">
      <div className="section-head">
        <span className="label">访问地址</span>
      </div>
      <ul className="urls">{content}</ul>
    </section>
  )
}
