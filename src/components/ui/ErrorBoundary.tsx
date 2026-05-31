import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error:    Error | null
  info:     ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    this.setState({ info })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      const stack          = this.state.error?.stack ?? ''
      const componentStack = this.state.info?.componentStack ?? ''

      return (
        <div style={{
          height: '100%', overflow: 'auto', padding: '32px 40px',
          color: 'var(--fg)', fontFamily: 'inherit',
        }}>
          <div style={{ maxWidth: 920 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'oklch(72% 0.18 25)', fontWeight: 700, marginBottom: 10,
            }}>
              Render-Fehler
            </div>
            <h2 style={{
              fontSize: 22, fontWeight: 700, color: 'var(--fg)',
              letterSpacing: '-0.02em', marginBottom: 16,
            }}>
              {this.state.error?.message ?? 'Unbekannter Fehler'}
            </h2>

            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10,
                background: 'var(--accent)', color: 'var(--accent-ink)',
                border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                marginBottom: 20,
              }}
            >
              Erneut versuchen
            </button>

            {stack && (
              <details open style={{ marginBottom: 18 }}>
                <summary style={{
                  cursor: 'pointer', fontSize: 12, color: 'var(--fg-muted)',
                  fontWeight: 600, marginBottom: 8,
                }}>
                  Stack
                </summary>
                <pre style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)',
                  fontSize: 11, lineHeight: 1.5, overflow: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{stack}</pre>
              </details>
            )}

            {componentStack && (
              <details>
                <summary style={{
                  cursor: 'pointer', fontSize: 12, color: 'var(--fg-muted)',
                  fontWeight: 600, marginBottom: 8,
                }}>
                  Component-Stack
                </summary>
                <pre style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)',
                  fontSize: 11, lineHeight: 1.5, overflow: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{componentStack}</pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
