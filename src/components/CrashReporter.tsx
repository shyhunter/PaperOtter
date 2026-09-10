import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetchFeedbackUrl, newDiscussionUrl } from '@/lib/feedbackConfig';
import { getSystemInfo } from '@/lib/systemInfo';
import { t } from '@/i18n';

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

  const errorMessage = error?.message ?? t('crashReporter.unknownError');
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
    // Opens GitHub's compose form with the fields filled in. Nothing is posted
    // until the user reads the report and presses the button themselves --
    // these bodies carry system details, and a discussion is public.
    const url = newDiscussionUrl(await fetchFeedbackUrl(), title, body);

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
            <p className="text-sm font-semibold text-foreground">{t('crashReporter.somethingWentWrong')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('crashReporter.anUnexpectedErrorOccurredYou')}
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
            {showDetails ? t('crashReporter.hideErrorDetails') : t('crashReporter.showErrorDetails')}
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
            {showPreview ? t('crashReporter.hideReportPreview') : t('crashReporter.previewWhatWillBeSent')}
          </button>
          {showPreview && (
            <div className="mt-2 rounded bg-muted p-3 text-xs text-muted-foreground overflow-auto max-h-48">
              <p className="font-medium text-foreground mb-1">{t('crashReporter.thisWillOpenInYour')}</p>
              <pre className="whitespace-pre-wrap break-words">
                {`## Crash Report\n\n### Error\n\`\`\`\n${errorMessage}\n\`\`\`${
                  truncatedStack
                    ? `\n\n### Component Stack\n\`\`\`\n${truncatedStack}\n\`\`\``
                    : ''
                }\n\n### System Info\n- App Version: (auto-detected)\n- OS: ${systemInfo}\n- Theme: ${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`}
              </pre>
              <p className="mt-2 text-[10px] text-muted-foreground/60 italic">
                {t('crashReporter.theReportOpensAsA')}
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
            {t('crashReporter.sendCrashReport')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRecover}>
            <X className="h-3.5 w-3.5 me-1" />
            {recoveryLabel}
          </Button>
        </div>

        {/* Privacy note */}
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
          {t('crashReporter.noDataSentAutomatically')}
        </p>
      </div>
    </div>
  );
}
