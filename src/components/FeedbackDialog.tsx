import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Send, ImagePlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

const store = new LazyStore('papercut-settings.json');
const GITHUB_TOKEN_KEY = 'github-pat';
const REPO_OWNER = 'shyhunter';
const REPO_NAME = 'Vibecoding2';

type Priority = 'high' | 'medium' | 'low';
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error' | 'no-token';

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

async function fileToBase64DataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png';
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

const PRIORITY_MAP: Record<Priority, string> = {
  high: 'priority: high',
  medium: 'priority: medium',
  low: 'priority: low',
};

/** Create a GitHub issue via REST API (fine-grained PAT with Issues:write on the repo) */
async function createGitHubIssue(
  token: string,
  title: string,
  body: string,
  priority: Priority,
): Promise<string> {
  const labels = ['feedback', PRIORITY_MAP[priority]];

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body, labels }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }

  const json = await res.json();
  return json.html_url;
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
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [token, setToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Load token on open
  useEffect(() => {
    if (!open) return;
    store
      .get<string>(GITHUB_TOKEN_KEY)
      .then((val) => {
        if (val) {
          setToken(val);
          setShowTokenInput(false);
        } else {
          setShowTokenInput(true);
        }
      })
      .catch(() => setShowTokenInput(true));
  }, [open]);

  // Focus title on open
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  const handlePickScreenshot = useCallback(async () => {
    const path = await openFileDialog({
      title: 'Select screenshot',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
      multiple: false,
    });
    if (path) {
      try {
        const dataUrl = await fileToBase64DataUrl(path as string);
        setScreenshotPreview(dataUrl);
      } catch {
        setScreenshotPreview(null);
      }
    }
  }, []);

  const handleSaveToken = useCallback(async () => {
    if (!token.trim()) return;
    await store.set(GITHUB_TOKEN_KEY, token.trim());
    await store.save();
    setShowTokenInput(false);
  }, [token]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;

    const currentToken = token.trim();
    if (!currentToken) {
      setStatus('no-token');
      setShowTokenInput(true);
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    try {
      const systemInfo = await getSystemInfo();

      // Build body
      const parts = [
        `**Priority:** ${PRIORITY_LABELS[priority].label}`,
        '',
        '## Description',
        description || '_No description provided._',
        '',
        '## System Info',
        systemInfo,
      ];

      if (screenshotPreview) {
        parts.push('', '## Screenshot', `![screenshot](${screenshotPreview})`);
      }

      const body = parts.join('\n');

      await createGitHubIssue(currentToken, `[${priority.toUpperCase()}] ${title}`, body, priority);

      setStatus('success');
      // Reset after delay
      setTimeout(() => {
        setTitle('');
        setDescription('');
        setPriority('medium');
        setScreenshotPreview(null);
        setStatus('idle');
        onClose();
      }, 1500);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit feedback');
    }
  }, [title, description, priority, screenshotPreview, token, onClose]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && status !== 'submitting') onClose();
    },
    [onClose, status],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && status !== 'submitting') onClose();
    },
    [onClose, status],
  );

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setErrorMsg('');
    }
  }, [open]);

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
            disabled={status === 'submitting'}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Change token link (shown when token exists but input is hidden) */}
        {!showTokenInput && token && (
          <button
            type="button"
            onClick={() => setShowTokenInput(true)}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Change GitHub token
          </button>
        )}

        {/* Token setup */}
        {showTokenInput && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              One-time setup: enter a GitHub fine-grained token with <strong className="text-foreground">Issues: Read &amp; Write</strong> on <code className="text-foreground">{REPO_OWNER}/{REPO_NAME}</code>.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_..."
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={!token.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}

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

        {/* Screenshot */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Screenshot (optional)</label>
          {screenshotPreview ? (
            <div className="relative rounded-lg border border-border overflow-hidden">
              <img
                src={screenshotPreview}
                alt="Screenshot preview"
                className="w-full max-h-32 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setScreenshotPreview(null);
                }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                title="Remove screenshot"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePickScreenshot}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <ImagePlus className="h-4 w-4" />
              Attach screenshot
            </button>
          )}
        </div>

        {/* Error message */}
        {status === 'error' && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{errorMsg}</p>
          </div>
        )}

        {/* Success message */}
        {status === 'success' && (
          <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/30 p-3">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p className="text-xs text-green-400">Feedback submitted to project backlog!</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!title.trim() || status === 'submitting' || status === 'success'}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle className="h-4 w-4" />
              Submitted!
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit Feedback
            </>
          )}
        </button>
      </div>
    </div>
  );
}
