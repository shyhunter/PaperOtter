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

/** Read image file and return a small preview data URL (for the dialog) */
async function fileToPreviewDataUrl(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const blob = new Blob([bytes]);
  const bitmap = await createImageBitmap(blob);

  // Resize to max 400px for preview
  const maxDim = 400;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(outBlob);
  });
}

/** Read image, resize to max 800px, compress as JPEG, return raw base64 (no data: prefix) */
async function fileToCompressedBase64(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  const blob = new Blob([bytes]);
  const bitmap = await createImageBitmap(blob);

  const maxDim = 800;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
  const buffer = await outBlob.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/** Upload screenshot to repo and return the raw URL */
async function uploadScreenshot(token: string, base64Content: string): Promise<string> {
  const timestamp = Date.now();
  const path = `feedback-screenshots/${timestamp}.jpg`;

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: `feedback screenshot ${timestamp}`,
        content: base64Content,
      }),
    },
  );

  if (!res.ok) {
    // Non-critical — skip screenshot if upload fails
    console.warn('[Feedback] Screenshot upload failed:', res.status);
    return '';
  }

  const json = await res.json();
  return json.content?.download_url || '';
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
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
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
        const [preview, compressed] = await Promise.all([
          fileToPreviewDataUrl(path as string),
          fileToCompressedBase64(path as string),
        ]);
        setScreenshotPreview(preview);
        setScreenshotBase64(compressed);
      } catch {
        setScreenshotPreview(null);
        setScreenshotBase64(null);
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

      // Upload screenshot if attached
      if (screenshotBase64) {
        const screenshotUrl = await uploadScreenshot(currentToken, screenshotBase64);
        if (screenshotUrl) {
          parts.push('', '## Screenshot', `![screenshot](${screenshotUrl})`);
        }
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
        setScreenshotBase64(null);
        setStatus('idle');
        onClose();
      }, 1500);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit feedback');
    }
  }, [title, description, priority, screenshotBase64, token, onClose]);

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
                  setScreenshotBase64(null);
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
