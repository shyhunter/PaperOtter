// Saved settings: applying one, and saving one.
//
// Two components, because the two halves belong in opposite places. Applying is
// an *input* — a click rewrites the quality, the target size and the page size
// below it — so it sits above the controls it moves, where the user can watch it
// happen. Saving is an *output* of those controls, so it sits under them, where
// you arrive once you are happy with what you set.
//
// Nothing is shipped in the list. Naming a preset for a consulate claims to know
// its rules; naming one "web upload, under 2 MB" claims to know which portal
// this user is fighting. Everyone's requirement comes from a form only they have
// read, so they save their own and name it themselves — and nothing here
// suggests what those names should be, down to the placeholder.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { destinationName, type DestinationRequirement } from '@/lib/destinations';

export interface SavedSettingsRowProps {
  destinations: DestinationRequirement[];
  selectedId: string | null;
  onSelect: (destination: DestinationRequirement | null) => void;
  onRemove?: (id: string) => void;
}

/**
 * The saved settings, above the controls they rewrite.
 *
 * Renders nothing at all when there are none — which is every first run, now
 * that the list ships empty. A heading over a single dead "None" pill would be
 * a control that does nothing, permanently, for anyone who never saves one.
 */
export function SavedSettingsRow({
  destinations, selectedId, onSelect, onRemove,
}: SavedSettingsRowProps) {
  if (destinations.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="saved-settings-row">
      <h2 className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-foreground">
        {t('destination.savedLabel')}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {/* "None" is a real choice, not the absence of one: most documents are
            not going to a portal, and the controls then stay as the user left
            them. It only means anything once there is another choice beside it,
            which is why the whole row is hidden when the list is empty. */}
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
    </div>
  );
}

export interface SaveSettingAsProps {
  onSave: (name: string) => void;
  /** Whether anything has been saved yet — first run gets the one-line reason. */
  hasSaved: boolean;
}

/** Keeping the current controls under a name, below the controls being kept. */
export function SaveSettingAs({ onSave, hasSaved }: SaveSettingAsProps) {
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  const commit = () => {
    const name = draftName.trim();
    if (!name) return;
    onSave(name);
    setDraftName('');
    setNaming(false);
  };

  return (
    <div className="space-y-2" data-testid="save-setting-as">
      {/* Only before anything is saved. Once the row above exists, the feature
          has demonstrated itself and the sentence is just noise on every file. */}
      {!hasSaved && (
        <p data-testid="destination-empty" className="text-xs text-muted-foreground">
          {t('destination.emptyHint')}
        </p>
      )}

      {naming ? (
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
      )}
    </div>
  );
}
