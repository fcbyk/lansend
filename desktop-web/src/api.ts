import { Call } from '@wailsio/runtime'

/** 一条可访问的地址，对应 Go 侧的 URLView。 */
export interface URLView {
  iface: string
  url: string
  /** VMware / WSL 之类的虚拟网卡，页面上打个标签 */
  virtual: boolean
}

/** 配置与运行状态的扁平快照，对应 Go 侧的 StateView。 */
export interface StateView {
  running: boolean
  port: number
  directory: string

  downloadEnabled: boolean
  uploadEnabled: boolean
  chatEnabled: boolean
  passwordSet: boolean

  localUrl: string
  lanUrl: string
  urls: URLView[]

  error: string
}

export type FeatureName = 'download' | 'upload' | 'chat'

// 页面通过 Wails 绑定按 FQN 调用，前缀固定为 main.Controller。
const call = <T>(method: string, ...args: unknown[]): Promise<T> =>
  Call.ByName(`main.Controller.${method}`, ...args) as Promise<T>

export const controller = {
  getState: () => call<StateView>('GetState'),
  start: () => call<void>('Start'),
  stop: () => call<void>('Stop'),
  setPort: (port: number) => call<void>('SetPort', port),
  setFeature: (name: FeatureName, enabled: boolean) => call<void>('SetFeature', name, enabled),
  refreshNetworks: () => call<void>('RefreshNetworks'),
  pickDirectory: () => call<string>('PickDirectory'),
  copyURL: (url: string) => call<void>('CopyURL', url),
  openInBrowser: (url: string) => call<void>('OpenInBrowser', url),
}
