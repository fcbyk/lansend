import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { getChatMessages, sendChatMessage } from '../api'
import type { ChatMessage } from '../types'
import { formatTimeLabel, getAvatarText, shouldShowTimeLabel } from '../utils/chat'

export const ChatTab = memo(function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [currentIp, setCurrentIp] = useState('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollIntervalRef = useRef<number | null>(null)

  const canSend = inputMessage.trim().length > 0 && !sending

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [])

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const maxHeight = 132
      const minHeight = 35
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const data = await getChatMessages()
      if (data.current_ip) {
        setCurrentIp((prev) => prev || (data.current_ip ?? ''))
      }

      setMessages((prev) => {
        const lastMessageId = prev.length > 0 ? prev[prev.length - 1].id : 0
        const newMessages = data.messages.filter((msg) => msg.id > lastMessageId)

        if (newMessages.length > 0) {
          requestAnimationFrame(scrollToBottom)
        } else if (prev.length !== data.messages.length) {
          // 消息数量不同，说明有更新
        }
        return data.messages
      })
    } catch (error) {
      console.error('加载消息失败:', error)
    }
  }, [scrollToBottom])

  // 发送消息
  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || sending) return

    const messageText = inputMessage.trim()
    setSending(true)
    try {
      const response = await sendChatMessage(messageText)
      if (response.message && response.message.ip) {
        setCurrentIp(response.message.ip)
      }
      setInputMessage('')
      adjustTextareaHeight()
      await loadMessages()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          textareaRef.current?.focus()
        })
      })
    } catch (error) {
      console.error('发送消息失败:', error)
      alert('发送失败，请重试')
    } finally {
      setSending(false)
    }
  }, [inputMessage, sending, loadMessages, adjustTextareaHeight])

  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputMessage(e.target.value)
    },
    [],
  )

  // inputMessage 变化时调整高度
  useEffect(() => {
    requestAnimationFrame(adjustTextareaHeight)
  }, [inputMessage, adjustTextareaHeight])

  // 初始化加载 + 轮询
  useEffect(() => {
    let mounted = true
    ;(async () => {
      await loadMessages()
      if (mounted) {
        pollIntervalRef.current = window.setInterval(loadMessages, 2000)
      }
    })()
    adjustTextareaHeight()
    return () => {
      mounted = false
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [loadMessages, adjustTextareaHeight])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex-1 overflow-y-auto p-2 md:py-2 md:px-0 flex flex-col gap-2"
        ref={messagesContainerRef}
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#999] text-sm">
            <p>暂无消息，开始聊天吧～</p>
          </div>
        )}
        {messages.length > 0 &&
          messages.map((msg, index) => (
            <div key={msg.id}>
              {shouldShowTimeLabel(messages, msg, index) && (
                <div className="text-center my-3 text-[12px] text-[#999]">
                  {formatTimeLabel(msg.timestamp)}
                </div>
              )}

              <div
                className={`block mb-1 px-3.75 w-full box-border group ${msg.ip === currentIp ? 'own-message' : ''}`}
              >
                <div className={`flex gap-2 w-fit max-w-[70%] ${msg.ip === currentIp ? 'flex-row-reverse ml-auto' : ''}`}>
                  <div
                    className={`w-9 h-9 rounded-full text-white flex items-center justify-center text-[12px] font-semibold flex-none ${msg.ip === currentIp ? 'bg-[#f5576c]' : 'bg-[#667eea]'}`}
                  >
                    {getAvatarText(msg.ip)}
                  </div>

                  <div className="flex flex-col flex-1 min-w-0">
                    <div className={`text-[12px] text-[#999] mb-1 px-1 ${msg.ip === currentIp ? 'text-right' : ''}`}>
                      {msg.ip}
                    </div>
                    <div
                      className={`p-2.5 md:px-3.5 md:py-2.5 rounded-lg relative wrap-break-word max-w-full ${msg.ip === currentIp ? 'bg-[#007bff] text-white' : 'bg-[#f0f0f0]'}`}
                    >
                      <div className="wrap-break-word whitespace-pre-wrap leading-relaxed">{msg.message}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div className="flex gap-2 p-3 border-t border-[#e0e0e0] bg-white flex-none">
        <textarea
          ref={textareaRef}
          className="text-box flex-1 px-2 py-1.5 border border-[#ddd] rounded-md text-sm outline-none font-inherit resize-none h-8.75 max-h-33 leading-relaxed overflow-y-auto box-border focus:border-[#007bff] disabled:bg-[#f5f5f5] disabled:cursor-not-allowed"
          placeholder="输入消息..."
          value={inputMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={sending}
          rows={1}
        />
        <button
          type="button"
          className="px-4 py-2 bg-[#007bff] text-white border-none rounded cursor-pointer text-sm transition-colors duration-200 hover:enabled:bg-[#0056b3] disabled:bg-[#ccc] disabled:cursor-not-allowed"
          onClick={sendMessage}
          disabled={!canSend || sending}
        >
          {sending ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  )
})
