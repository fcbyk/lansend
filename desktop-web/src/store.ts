import { Events } from '@wailsio/runtime'
import { useSyncExternalStore } from 'react'
import { controller } from './api'
import type { StateView } from './api'

/**
 * 正在进行的配置动作，null 表示空闲。
 *
 * 用具体动作而不是布尔值：启停服务时没必要把地址行的复制/打开一起变灰，
 * 整块面板同时变色在小窗里看起来就像页面重载了一次。
 */
export type BusyKey = 'toggle' | 'port' | 'directory'

export interface Snapshot {
  /** null 表示还没拿到第一份快照 */
  view: StateView | null
  busy: BusyKey | null
  error: string
}

let snapshot: Snapshot = { view: null, busy: null, error: '' }
const listeners = new Set<() => void>()

function set(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 给事件回调这类非渲染场景读取最新快照用。 */
export const getSnapshot = () => snapshot

export const useSnapshot = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

export function errorText(e: unknown) {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return String(e)
}

export function showError(message: string) {
  set({ error: message })
}

export function clearError() {
  set({ error: '' })
}

// 与旧实现一致：整份快照覆盖，error 也随快照走（后端报错优先）
function apply(next: StateView) {
  set({ view: next, error: next.error })
}

export async function refresh() {
  apply(await controller.getState())
}

/** 串行执行一次配置变更，期间由 key 标记是哪一个动作占用。 */
export async function run(key: BusyKey, fn: () => Promise<void>) {
  if (snapshot.busy) return
  set({ busy: key })
  try {
    await fn()
    clearError()
  } catch (e) {
    showError(errorText(e))
  } finally {
    set({ busy: null })
  }
}

/**
 * 瞬时动作（复制地址、在浏览器打开）：不改配置、不重建服务，
 * 因此不进忙碌态 —— 否则点一下复制，整条地址列表连带状态提示都要闪一次。
 */
export async function act(fn: () => Promise<void>) {
  try {
    await fn()
    clearError()
  } catch (e) {
    showError(errorText(e))
  }
}

let started = false

/**
 * 挂载全局状态订阅并拉取首份快照。
 *
 * 页面可能比 Wails 运行时先就绪，所以首帧用短重试顶住。
 */
export function start() {
  if (started) return () => {}
  started = true

  const off = Events.On<StateView>('state', (event) => {
    if (event?.data) apply(event.data)
  })

  void (async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        apply(await controller.getState())
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    showError('无法连接到后端服务')
  })()

  return off
}
