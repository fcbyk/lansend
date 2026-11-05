import { useEffect, useMemo } from 'react'
import { renderSVG } from 'uqr'

interface Props {
  url: string
  onClose: () => void
}

/** 二维码浮层：盖住整个窗口，点背景或按 Esc 关闭。 */
export function QrPanel({ url, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // 纠错等级 M（可恢复约 15%）足够应付屏幕反光；border 1 是标准静区，
  // 外的白边由 .qr-plate 的内边距补上，扫起来更稳。
  const svg = useMemo(() => renderSVG(url, { ecc: 'M', border: 1 }), [url])

  return (
    <div className="qr-backdrop" onClick={onClose}>
      <div className="qr-panel" onClick={(event) => event.stopPropagation()}>
        {/* 内容来自 uqr 生成的 SVG，不含用户输入拼接，安全 */}
        <div className="qr-plate" dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="qr-url">{url}</span>
      </div>
    </div>
  )
}
