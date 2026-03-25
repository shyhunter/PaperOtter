import { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle, ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

const REPO_OWNER = 'shyhunter';
const REPO_NAME = 'Papercut';

type Priority = 'high' | 'medium' | 'low';

async function getSystemInfo(): Promise<string> {
  let version = 'unknown';
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    version = await getVersion();
  } catch {
    // fallback
  }
  const os = navigator.platform || 'unknown';
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  return `App: v${version} | OS: ${os} | Theme: ${theme}`;
}

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

const PRIORITY_LABELS: Record<Priority, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-red-500 border-red-500/50 bg-red-500/10' },
  medium: { label: 'Medium', color: 'text-yellow-500 border-yellow-500/50 bg-yellow-500/10' },
  low: { label: 'Low', color: 'text-blue-400 border-blue-400/50 bg-blue-400/10' },
};

export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<'idle' | 'success'>('idle');
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStatus('idle');
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    const systemInfo = await getSystemInfo();

    const bodyParts = [
      `**Priority:** ${PRIORITY_LABELS[priority].label}`,
      '',
      '## Description',
      description || '_No description provided._',
      '',
      '## System Info',
      systemInfo,
      '',
      '_Tip: You can drag & drop or paste a screenshot into this issue on GitHub._',
    ];

    const issueTitle = `[${priority.toUpperCase()}] ${title}`;
    const issueBody = bodyParts.join('\n');
    const labels = `feedback,priority: ${priority}`;

    const url = new URL(`https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/new`);
    url.searchParams.set('title', issueTitle);
    url.searchParams.set('body', issueBody);
    url.searchParams.set('labels', labels);

    await openUrl(url.toString());

    setStatus('success');
    setTimeout(() => {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('idle');
      onClose();
    }, 1500);
  }, [title, description, priority, onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Send Feedback"
    >
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Send Feedback</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary of your feedback..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {/* Description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe in detail (optional)..."
          rows={4}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />

        {/* Priority */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Priority</label>
          <div className="flex gap-2">
            {(Object.entries(PRIORITY_LABELS) as [Priority, { label: string; color: string }][]).map(
              ([key, { label, color }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPriority(key)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    priority === key
                      ? color
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Info about screenshots */}
        <p className="text-xs text-muted-foreground">
          Screenshots can be pasted directly into the GitHub issue after it opens.
        </p>

        {/* Success message */}
        {status === 'success' && (
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/30 p-3">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p className="text-xs text-green-400">Opening GitHub — submit the issue there!</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!title.trim() || status === 'success'}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {status === 'success' ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Opening GitHub...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" />
              Open on GitHub
            </>
          )}
        </button>
      </div>
    </div>
  );
}
