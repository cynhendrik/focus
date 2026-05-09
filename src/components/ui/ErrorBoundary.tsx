import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <p className="text-lg font-semibold text-[var(--text)]">Etwas ist schiefgelaufen</p>
          <p className="text-sm text-[var(--text2)] max-w-md text-center">
            {this.state.error?.message ?? 'Unbekannter Fehler'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark"
          >
            Erneut versuchen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
