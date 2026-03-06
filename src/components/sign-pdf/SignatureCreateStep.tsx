import { useState, useCallback } from 'react';
import { SignatureCanvas } from './SignatureCanvas';
import { SignatureTyped } from './SignatureTyped';
import { SignatureUpload } from './SignatureUpload';
import { useSavedSignatures } from '@/hooks/useSavedSignatures';
import type { SavedSignature } from '@/hooks/useSavedSignatures';

interface SignatureCreateStepProps {
  onSignatureSelected: (dataUrl: string) => void;
  onBack: () => void;
}

type TabId = 'draw' | 'type' | 'upload';

const TABS: { id: TabId; label: string }[] = [
  { id: 'draw', label: 'Draw' },
  { id: 'type', label: 'Type' },
  { id: 'upload', label: 'Upload' },
];

export function SignatureCreateStep({ onSignatureSelected, onBack }: SignatureCreateStepProps) {
  const { signatures, saveSignature, deleteSignature, isLoading } = useSavedSignatures();
  const [activeTab, setActiveTab] = useState<TabId>('draw');
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<SavedSignature['type']>('drawn');
  const [sigName, setSigName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleCreated = useCallback((dataUrl: string, type: SavedSignature['type']) => {
    setPendingDataUrl(dataUrl);
    setPendingType(type);
    setSigName(`Signature ${signatures.length + 1}`);
  }, [signatures.length]);

  const handleSaveAndProceed = useCallback(async () => {
    if (!pendingDataUrl) return;
    setIsSaving(true);
    try {
      await saveSignature({
        name: sigName.trim() || `Signature ${signatures.length + 1}`,
        type: pendingType,
        dataUrl: pendingDataUrl,
      });
      onSignatureSelected(pendingDataUrl);
    } finally {
      setIsSaving(false);
      setPendingDataUrl(null);
    }
  }, [pendingDataUrl, sigName, pendingType, saveSignature, signatures.length, onSignatureSelected]);

  const handleCancelSave = useCallback(() => {
    setPendingDataUrl(null);
    setSigName('');
  }, []);

  const handleSavedClick = useCallback((sig: SavedSignature) => {
    onSignatureSelected(sig.dataUrl);
  }, [onSignatureSelected]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSignature(id);
  }, [deleteSignature]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          Back
        </button>
        <h2 className="text-lg font-semibold text-foreground">Create or Select Signature</h2>
      </div>

      {/* Saved Signatures */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Saved Signatures
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : signatures.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No saved signatures</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                onClick={() => handleSavedClick(sig)}
                className="group relative cursor-pointer rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="flex h-16 items-center justify-center">
                  <img
                    src={sig.dataUrl}
                    alt={sig.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <p className="mt-1.5 truncate text-center text-xs text-muted-foreground">
                  {sig.name}
                </p>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, sig.id)}
                  className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                  title="Delete signature"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Create New */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Create New
        </h3>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'draw' && (
          <SignatureCanvas
            onComplete={(dataUrl) => handleCreated(dataUrl, 'drawn')}
            onClear={() => {}}
          />
        )}
        {activeTab === 'type' && (
          <SignatureTyped
            onComplete={(dataUrl) => handleCreated(dataUrl, 'typed')}
          />
        )}
        {activeTab === 'upload' && (
          <SignatureUpload
            onComplete={(dataUrl) => handleCreated(dataUrl, 'uploaded')}
          />
        )}
      </section>

      {/* Save/Name dialog -- inline after signature created */}
      {pendingDataUrl && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Name your signature</p>
          <div className="mb-3 flex items-center justify-center rounded-lg bg-white p-3">
            <img
              src={pendingDataUrl}
              alt="New signature"
              className="max-h-16 max-w-full object-contain"
            />
          </div>
          <input
            type="text"
            value={sigName}
            onChange={(e) => setSigName(e.target.value)}
            placeholder="Signature name..."
            className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            maxLength={40}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveAndProceed();
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelSave}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndProceed}
              disabled={isSaving}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {isSaving ? 'Saving...' : 'Save & Use'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
