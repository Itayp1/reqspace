import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '../../utils/errorReporter';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      kind: 'react-boundary',
      message: error.message || 'Render error',
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-text">
        <p>Something went wrong.</p>
        <button
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
