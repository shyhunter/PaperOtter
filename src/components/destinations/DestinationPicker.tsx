// Choosing what the document is being prepared *for*.
//
// The built-ins are deliberately generic. Naming a preset for a consulate or a
// university would be this app claiming to know someone else's rules — those
// vary by office and change without notice, and being confidently wrong gets an
// application rejected and blamed on us. The user read the form; they name it.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { destinationName, type DestinationRequirement } from '@/lib/destinations';

export interface DestinationPickerProps {
  destinations: DestinationRequirement[];
  selectedId: string | null;
  onSelect: (destination: DestinationRequirement | null) => void;
  /** Absent while there is nothing worth saving yet. */
  onSaveCurrent?: (name: string) => void;
  onRemove?: (id: string) => void;
}

export function DestinationPicker({
  destinations, selectedId, onSelect, onSaveCurrent, onRemove,
}: DestinationPickerProps) {
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  const commit = () => {
    const name = draftName.trim();
    if (!name || !onSaveCurrent) return;
    onSaveCurrent(name);
    setDraftName('');
    setNaming(false);
  };

  return (
    <div className="space-y-2" data-testid="destination-picker">
      <div className="flex flex-wrap gap-1.5">
        {/* "No destination" is a real choice, not the absence of one: most
            documents are not going to a portal, and the controls stay manual. */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedId === null}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            selectedId === null
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent/50',
          )}
        >
          {t('destination.none')}
        </button>

        {destinations.map((d) => (
          <span key={d.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={selectedId === d.id}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                selectedId === d.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent/50',
              )}
            >
              {destinationName(d)}
            </button>
            {d.userDefined && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                aria-label={t('destination.forget', { name: destinationName(d) })}
                className="ms-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {onSaveCurrent && (naming ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setNaming(false); }}
            placeholder={t('destination.namePlaceholder')}
            aria-label={t('destination.nameLabel')}
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <Button size="sm" variant="outline" onClick={commit} disabled={draftName.trim().length === 0}>
            {t('common.save')}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('destination.saveCurrent')}
        </button>
      ))}
    </div>
  );
}
