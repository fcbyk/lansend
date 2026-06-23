import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#fafafa] text-[#333] p-8">
          <div className="text-5xl mb-4">😵</div>
          <h2 className="text-xl font-semibold mb-2">出了点问题</h2>
          <p className="text-[#666] text-sm mb-6 max-w-md text-center">
            应用发生了意外错误，请尝试刷新页面。如果问题持续，请检查网络连接。
          </p>
          <details className="mb-6 max-w-lg w-full">
            <summary className="text-xs text-[#999] cursor-pointer">错误详情</summary>
            <pre className="mt-2 p-3 bg-[#f5f5f5] rounded text-xs overflow-auto max-h-40 whitespace-pre-wrap break-all">
              {this.state.error?.message}
            </pre>
          </details>
          <button
            type="button"
            className="px-5 py-2 bg-[#409eff] text-white rounded-md hover:bg-[#66b1ff] transition-colors text-sm"
            onClick={this.handleReload}
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
