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
  /** 整站访问密码是否生效 */
  accessPasswordSet: boolean

  localUrl: string
  lanUrl: string
  urls: URLView[]

  /** 构建期注入，与服务是否运行无关，页脚常驻显示 */
  version: string
  /** 短提交哈希；取不到时是 "unknown" */
  commitHash: string

  error: string
}

export type FeatureName = 'download' | 'upload' | 'chat'

/** 设置浮窗需要的密码状态，对应 Go 侧的 PasswordView。 */
export interface PasswordState {
  /** 保存的密码原文；关闭状态下依然保留 */
  password: string
  enabled: boolean
}

// 页面通过 Wails 绑定按 FQN 调用，前缀固定为 main.Controller。
const call = <T>(method: string, ...args: unknown[]): Promise<T> =>
  Call.ByName(`main.Controller.${method}`, ...args) as Promise<T>

export const controller = {
  getState: () => call<StateView>('GetState'),
  start: () => call<void>('Start'),
  stop: () => call<void>('Stop'),
  setPort: (port: number) => call<void>('SetPort', port),
  setFeature: (name: FeatureName, enabled: boolean) => call<void>('SetFeature', name, enabled),
  getUploadPassword: () => call<PasswordState>('GetUploadPassword'),
  setUploadPassword: (password: string, enabled: boolean) =>
    call<void>('SetUploadPassword', password, enabled),
  getAccessPassword: () => call<PasswordState>('GetAccessPassword'),
  setAccessPassword: (password: string, enabled: boolean) =>
    call<void>('SetAccessPassword', password, enabled),
  refreshNetworks: () => call<void>('RefreshNetworks'),
  pickDirectory: () => call<string>('PickDirectory'),
  copyURL: (url: string) => call<void>('CopyURL', url),
  copyText: (text: string) => call<void>('CopyText', text),
  openInBrowser: (url: string) => call<void>('OpenInBrowser', url),
}
