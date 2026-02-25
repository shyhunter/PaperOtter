import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Shared fallback UI ─────────────────────────────────────────────────────────

interface BoundaryFallbackProps {
  message: string;
  error: Error | null;
  showDetails: boolean;
  onToggleDetails: () => void;
  recoveryLabel: string;
  onRecover: () => void;
  fullWidth?: boolean;
}

function BoundaryFallback({
  message,
  error,
  showDetails,
  onToggleDetails,
  recoveryLabel,
  onRecover,
  fullWidth,
}: BoundaryFallbackProps) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-center p-8',
        fullWidth && 'w-full',
      )}
    >
      <div
        className={cn(
          'rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex flex-col gap-4',
          fullWidth ? 'w-full' : 'max-w-md w-full',
        )}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive flex-none" />
          <p className="text-sm font-medium text-foreground">{message}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onToggleDetails}
            className="text-xs text-muted-foreground hover:text-foreground text-left transition-colors"
          >
            {showDetails ? 'Hide error details' : 'Show error details'}
          </button>
          {showDetails && error && (
            <pre className="text-xs text-muted-foreground overflow-auto max-h-40 p-2 rounded bg-muted whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onRecover} className="self-start">
          {recoveryLabel}
        </Button>
      </div>
    </div>
  );
}

// ── StepErrorBoundary ──────────────────────────────────────────────────────────

interface StepBoundaryProps {
  children: React.ReactNode;
  stepName: string;
}

interface StepBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class StepErrorBoundary extends React.Component<StepBoundaryProps, StepBoundaryState> {
  constructor(props: StepBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): StepBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Error logged to boundary state — no external error service (privacy-first)
    console.error('[ErrorBoundary]', this.props.stepName, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  handleToggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <BoundaryFallback
          message={`${this.props.stepName} encountered an unexpected error.`}
          error={this.state.error}
          showDetails={this.state.showDetails}
          onToggleDetails={this.handleToggleDetails}
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
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): AppBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info);
  }

  handleToggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <BoundaryFallback
          message="The app encountered an unexpected error."
          error={this.state.error}
          showDetails={this.state.showDetails}
          onToggleDetails={this.handleToggleDetails}
          recoveryLabel="Restart app"
          onRecover={() => window.location.reload()}
          fullWidth
        />
      );
    }
    return this.props.children;
  }
}
