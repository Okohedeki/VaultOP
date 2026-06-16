import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, EmptyState } from '../design/primitives'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** One render failure must never blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('render error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 'var(--sp-6)' }}>
          <EmptyState
            title="Something broke in the UI"
            hint={this.state.error.message}
          />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button variant="primary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
