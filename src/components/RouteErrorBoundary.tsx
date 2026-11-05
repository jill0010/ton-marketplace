import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"

type Props = { children: ReactNode }
type State = { error: Error | null }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Premium route rendering failed:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <section className="mx-auto max-w-2xl rounded-2xl border border-red-400/20 bg-[#151923] p-6 text-zinc-100">
          <h1 className="text-xl font-semibold">会员页面暂时无法加载</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            页面捕获到初始化错误。请刷新重试；如果问题持续，请联系管理员。
          </p>
          <pre className="mt-4 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-xs text-red-200">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
          >
            刷新页面
          </button>
        </section>
      )
    }

    return this.props.children
  }
}
