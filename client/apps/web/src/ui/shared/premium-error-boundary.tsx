'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { reportError } from '@/core/report-error';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  area?: string;
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PremiumErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      area: this.props.area || 'widget',
      action: 'renderError',
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      if (this.props.compact) {
        return (
          <div className="flex items-center gap-2 rounded-lg border border-dark-gray/50 bg-dark-gray2/20 px-3 py-2">
            <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 3.5V6.5M6 8.5H6.005" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-size-11 text-dark-disabled">Failed to load</span>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="text-size-10 text-half-enabled hover:text-white transition ml-auto"
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dark-gray/40 bg-gradient-to-b from-dark-gray2/30 to-transparent p-8 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-red-400/60">
                <path d="M14 9V15M14 19H14.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M12.27 4.56L2.67 21C2.49 21.31 2.4 21.66 2.4 22.02C2.4 22.38 2.49 22.73 2.67 23.04C2.85 23.35 3.1 23.6 3.41 23.78C3.72 23.96 4.07 24.05 4.43 24.05H23.63C23.99 24.05 24.34 23.96 24.65 23.78C24.96 23.6 25.21 23.35 25.39 23.04C25.57 22.73 25.66 22.38 25.66 22.02C25.66 21.66 25.57 21.31 25.39 21L15.79 4.56C15.61 4.26 15.36 4.01 15.06 3.83C14.76 3.66 14.41 3.57 14.06 3.57C13.71 3.57 13.36 3.66 13.06 3.83C12.76 4.01 12.51 4.26 12.33 4.56H12.27Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="absolute -inset-4 bg-red-500/5 rounded-3xl blur-2xl" />
          </div>
          <div className="space-y-1.5 relative">
            <h3 className="text-size-14 font-manrope-bold text-white/80">Something went wrong</h3>
            <p className="text-size-11 text-dark-disabled max-w-xs">
              This section encountered an error. Your data is safe.
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-1 px-5 py-2 rounded-xl border border-dark-gray/60 bg-dark-gray2/40 text-size-12 font-manrope-bold text-half-enabled hover:text-white hover:bg-dark-gray2/80 transition-all active:scale-[0.97]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default PremiumErrorBoundary;
