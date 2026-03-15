import { Shield, X } from 'lucide-react';

interface PrivacyModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyModal({ open, onClose }: PrivacyModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      aria-modal="true"
      role="dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-background text-foreground border border-border rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold">Your Privacy</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Human-readable promise */}
        <div className="p-4 space-y-3">
          <p className="text-base font-medium">
            Your files never leave your device.
          </p>
          <p className="text-sm text-muted-foreground">
            Papercut processes everything locally on your computer. No uploads, no cloud storage, no tracking.
          </p>
          <p className="text-sm text-muted-foreground">
            We collect zero data — no analytics, no telemetry, no crash reports.
          </p>
        </div>

        {/* Collapsible technical details */}
        <div className="px-4 pb-4">
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors select-none">
              Technical details
            </summary>
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground list-disc list-inside">
              <li>No network permissions — the app has zero ability to make HTTP calls (enforced by Tauri capability config)</li>
              <li>Content Security Policy blocks all external connections</li>
              <li>No analytics SDK or tracking code is included</li>
              <li>All file processing runs locally via Rust, Ghostscript, LibreOffice, and Calibre</li>
              <li>Temporary files are created during processing and automatically deleted afterwards</li>
              <li>Leftover temp files from crashes are swept on app launch</li>
              <li>Passwords (PDF protect/unlock) are never stored, logged, or written to disk</li>
            </ul>
          </details>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
