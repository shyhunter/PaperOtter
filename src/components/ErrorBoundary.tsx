import React from 'react';
import { CrashReporter } from '@/components/CrashReporter';

// ── StepErrorBoundary ──────────────────────────────────────────────────────────

interface StepBoundaryProps {
  children: React.ReactNode;
  stepName: string;
}

interface StepBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  componentStack: string | null;
}

export class StepErrorBoundary extends React.Component<StepBoundaryProps, StepBoundaryState> {
  constructor(props: StepBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<StepBoundaryState> {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Error logged to boundary state — no external error service (privacy-first)
    console.error('[ErrorBoundary]', this.props.stepName, error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false, componentStack: null });
  };

  handleToggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <CrashReporter
          error={this.state.error}
          componentStack={this.state.componentStack}
          recoveryLabel="Reset this step"
          onRecover={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

// ── AppErrorBoundary ───────────────────────────────────────────────────────────

interface AppBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  componentStack: string | null;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<AppBoundaryState> {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleToggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <CrashReporter
          error={this.state.error}
          componentStack={this.state.componentStack}
          recoveryLabel="Restart app"
          onRecover={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
