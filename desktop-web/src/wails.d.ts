// `@wailsio/runtime` 由 Wails 在运行时注入（/wails/runtime.js），
// 不走 npm 安装，因此这里只声明用到的那部分接口。
//
// 构建时 vite 把这条 import 原样保留（rollupOptions.external），
// 由 index.html 里的 importmap 负责解析。
declare module '@wailsio/runtime' {
  export interface WailsEvent<T = unknown> {
    name: string
    data: T
  }

  export const Call: {
    ByName(name: string, ...args: unknown[]): Promise<any>
  }

  export const Events: {
    /** 返回取消订阅的函数 */
    On<T = unknown>(name: string, callback: (event: WailsEvent<T>) => void): () => void
  }
}
