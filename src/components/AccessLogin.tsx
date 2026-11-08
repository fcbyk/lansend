import { useState } from 'react'
import type { FormEvent } from 'react'
import { loginWithAccessPassword } from '../api'

interface Props {
  /** 登录成功回调：由上层重新拉配置与目录 */
  onSuccess: () => void
}

/**
 * 整站访问密码的登录页。
 *
 * 登录成功后服务端下发会话 Cookie，之后所有请求（含图片、视频、下载直链）都由
 * 浏览器自动携带，前端不保存密码本身。
 */
export function AccessLogin({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    if (!password) {
      setError('请输入访问密码')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await loginWithAccessPassword(password)
      // 成功后不恢复 submitting：本组件随即卸载，恢复反而会闪一下按钮
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#f5f5f5] px-5">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[320px] flex-col gap-4 rounded-xl bg-white p-6 shadow-md"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#eff6ff]">
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.5" />
              <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
            </svg>
          </div>
          <h1 className="text-[15px] font-medium text-[#333]">需要访问密码</h1>
          <p className="mt-1 text-xs text-[#9ca3af]">请输入分享者提供的密码</p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.currentTarget.value)
            setError('')
          }}
          autoFocus
          autoComplete="current-password"
          placeholder="访问密码"
          aria-label="访问密码"
          className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#333] outline-none transition-colors placeholder:text-[#c4c4c4] focus:border-[#3b82f6]"
        />

        {error && <p className="text-xs text-[#ef4444]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#3b82f6] py-2 text-sm font-medium text-white transition-colors hover:bg-[#2563eb] disabled:bg-[#93b4f5]"
        >
          {submitting ? '验证中…' : '进入'}
        </button>
      </form>
    </div>
  )
}
