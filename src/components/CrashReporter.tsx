import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchFeedbackEmail } from '@/lib/feedbackConfig';
import { getSystemInfo } from '@/lib/systemInfo';

interface CrashReporterProps {
  error: Error | null;
  componentStack?: string | null;
  /** Label for the recovery button (e.g. "Reset this step" or "Restart app") */
  recoveryLabel: string;
  /** Called when the user chooses to recover/dismiss */
  onRecover: () => void;
}

/**
 * Opt-in crash report UI displayed inside ErrorBoundary fallbacks.
 *
 * Privacy guarantees:
 * - Nothing is sent automatically
 * - User sees exactly what will be sent before clicking
 * - "Send" opens the mail client — user must still send the message themselves
 * - No telemetry, no analytics, no automatic crash collection
 */
export function CrashReporter({
  error,
  componentStack,
  recoveryLabel,
  onRecover,
}: CrashReporterProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [systemInfo, setSystemInfo] = useState('');

  useEffect(() => {
    let cancelled = false;
    getSystemInfo().then((info) => {
      if (!cancelled) setSystemInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const errorMessage = error?.message ?? 'Unknown error';
  const truncatedStack = componentStack
    ? componentStack.slice(0, 500) + (componentStack.length > 500 ? '\n...(truncated)' : '')
    : null;

  const buildReportBody = useCallback(async () => {
    let version = 'unknown';
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      version = await getVersion();
    } catch {
      // fallback
    }

    const os = systemInfo || (await getSystemInfo());

    const lines = [
      '## Crash Report',
      '',
      '### Error',
      '```',
      errorMessage,
      '```',
      '',
    ];

    if (truncatedStack) {
      lines.push('### Component Stack', '```', truncatedStack, '```', '');
    }

    lines.push(
      '### System Info',
      `- App Version: ${version}`,
      `- OS: ${os}`,
      `- Theme: ${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`,
    );

    return lines.join('\n');
  }, [errorMessage, truncatedStack, systemInfo]);

  const handleSend = useCallback(async () => {
    const body = await buildReportBody();
    const title = `Crash: ${errorMessage.slice(0, 80)}`;
    const email = await fetchFeedbackEmail();
    const url = `mailto:${email}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

    try {
      await openUrl(url);
    } catch (err) {
      console.warn('[CrashReporter] Could not open mail client:', err);
    }
  }, [buildReportBody, errorMessage]);

  const handlePreviewToggle = useCallback(() => {
    setShowPreview((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive flex-none" />
          <div>
            <p className="text-sm font-semibold text-foreground">Something went wrong</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              An unexpected error occurred. You can send a crash report to help us fix it.
            </p>
          </div>
        </div>

        {/* Error details (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showDetails ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {showDetails ? 'Hide error details' : 'Show error details'}
          </button>
          {showDetails && (
            <div className="mt-2 space-y-2">
              <pre className="text-xs text-muted-foreground overflow-auto max-h-32 p-2 rounded bg-muted whitespace-pre-wrap break-words">
                {errorMessage}
              </pre>
              {truncatedStack && (
                <pre className="text-xs text-muted-foreground overflow-auto max-h-32 p-2 rounded bg-muted whitespace-pre-wrap break-words">
                  {truncatedStack}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Preview what will be sent */}
        <div>
          <button
            type="button"
            onClick={handlePreviewToggle}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPreview ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {showPreview ? 'Hide report preview' : 'Preview what will be sent'}
          </button>
          {showPreview && (
            <div className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground overflow-auto max-h-48">
              <p className="font-medium text-foreground mb-1">This will open in your email app:</p>
              <pre className="whitespace-pre-wrap break-words">
                {`## Crash Report\n\n### Error\n\`\`\`\n${errorMessage}\n\`\`\`${
                  truncatedStack
                    ? `\n\n### Component Stack\n\`\`\`\n${truncatedStack}\n\`\`\``
                    : ''
                }\n\n### System Info\n- App Version: (auto-detected)\n- OS: ${systemInfo}\n- Theme: ${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`}
              </pre>
              <p className="mt-2 text-[10px] text-muted-foreground/60 italic">
                The report opens as a draft email. Nothing is sent until you send it yourself.
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSend}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            Send Crash Report
          </Button>
          <Button variant="ghost" size="sm" onClick={onRecover}>
            <X className="h-3.5 w-3.5 mr-1" />
            {recoveryLabel}
          </Button>
        </div>

        {/* Privacy note */}
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
          No data is sent automatically. The report opens as a draft email in your mail app
          — you choose whether to send it.
        </p>
      </div>
    </div>
  );
}
