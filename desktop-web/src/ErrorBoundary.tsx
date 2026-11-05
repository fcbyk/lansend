import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 渲染异常的兜底。没有它，React 会卸载整棵树，窗口就是一片黑，
 * 连错在哪里都看不出来；有它至少能把错误画在窗口里。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <h1>界面出错了</h1>
        <pre>{error.stack || `${error.name}: ${error.message}`}</pre>
        <button className="btn" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    )
  }
}
