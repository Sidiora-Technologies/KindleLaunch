'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { reportError } from '@/core/report-error';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  area?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      area: this.props.area || 'unknown',
      action: 'renderError',
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-xl border border-dark-gray bg-dark-gray2/30 p-6 text-center">
          <p className="text-size-12 text-dark-disabled">Something went wrong.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 px-3 py-1.5 rounded-lg border border-dark-gray text-size-11 text-half-enabled hover:text-white transition"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
