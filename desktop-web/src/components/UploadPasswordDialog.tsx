import { useEffect, useState } from 'react'
import { controller } from '../api'
import { errorText, refresh, useSnapshot } from '../store'

interface Props {
  onClose: () => void
}

/**
 * 随机密码的字符集：去掉 0/O/o/1/l/I 这些容易看错的字符。
 *
 * 密码大多要口头念给旁边的人或者手抄到手机上，少一个看错的字符，
 * 就少一次「密码明明对却传不上去」的排查。
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RANDOM_LENGTH = 8

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint32Array(RANDOM_LENGTH))
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('')
}

/** 上传密码设置浮窗：启用/关闭二态 + 密码编辑，点背景或按 Esc 关闭。 */
export function UploadPasswordDialog({ onClose }: Props) {
  const { view } = useSnapshot()

  const [password, setPassword] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 打开时才取一次明文，退出时丢弃：密码不参与 state 快照的广播。
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const current = await controller.getUploadPassword()
        if (cancelled) return
        setPassword(current.password)
        setEnabled(current.enabled)
      } catch (e) {
        if (!cancelled) setError(errorText(e))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const save = () => {
    if (!loaded || saving) return

    const value = password.trim()
    if (enabled && !value) {
      setError('请先输入密码，或点「随机生成」')
      return
    }

    setSaving(true)
    setError('')

    void (async () => {
      try {
        await controller.setUploadPassword(value, enabled)
      } catch (e) {
        // 失败时留在浮窗里：直接关掉的话，用户刚输的密码就白输了
        setError(errorText(e))
        setSaving(false)
        return
      }

      onClose()
      // Apply 已经广播过一次快照，这里再拉一次只是兜底，失败不必打扰用户
      void refresh().catch(() => {})
    })()
  }

  const notes: string[] = []
  if (view?.running) notes.push('保存后服务会重启，进行中的上传会中断')
  if (!enabled && password) notes.push('关闭不会清掉已保存的密码，重新启用时不用再输')

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label="上传密码"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="dialog-title">上传密码</span>

        <div className="segmented" role="group" aria-label="密码状态">
          <button
            type="button"
            className={`seg${enabled ? ' on' : ''}`}
            onClick={() => {
              setEnabled(true)
              setError('')
            }}
          >
            启用密码
          </button>
          <button
            type="button"
            className={`seg${enabled ? '' : ' on'}`}
            onClick={() => {
              setEnabled(false)
              setError('')
            }}
          >
            关闭密码
          </button>
        </div>

        <div className="field">
          <span className="label">密码</span>
          <div className="pwd-row">
            <input
              type={revealed ? 'text' : 'password'}
              value={password}
              disabled={!loaded || saving}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setPassword(event.currentTarget.value)
                setError('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save()
              }}
            />
            <button
              type="button"
              className="btn mini"
              disabled={!loaded || saving}
              onClick={() => setRevealed((prev) => !prev)}
            >
              {revealed ? '隐藏' : '显示'}
            </button>
            <button
              type="button"
              className="btn mini"
              disabled={!loaded || saving}
              onClick={() => {
                setPassword(randomPassword())
                // 生成的值直接露出来，省得用户再点一次「显示」才知道密码是什么
                setRevealed(true)
                setError('')
              }}
            >
              随机生成
            </button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {notes.length > 0 && (
          <div className="dialog-notes">
            {notes.map((note) => (
              <span className="dialog-note" key={note}>
                {note}
              </span>
            ))}
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!loaded || saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
