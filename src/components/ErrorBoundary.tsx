import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * Last-resort catch for render errors, so one broken component shows a
 * recoverable screen instead of blanking the whole app.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
    if (import.meta.env?.VITE_SENTRY_DSN) {
      import('@sentry/react').then((Sentry) => Sentry.captureException(error)).catch(() => {})
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen grid place-items-center p-6" role="alert">
        <div className="retro-panel noise p-8 max-w-md text-center shadow-chunk-lg">
          <p className="font-pixel text-sm text-magenta">STEVE TRIPPED OVER A CABLE</p>
          <p className="font-mono text-xl text-beige/80 mt-3">
            Something went wrong on this screen. Your saved calendar is safe — reload to get back to it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 bg-lime text-ink border-3 border-ink shadow-chunk px-6 py-3 font-pixel text-xs uppercase"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
