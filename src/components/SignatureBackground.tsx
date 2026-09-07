// SignatureBackground: what sits behind a signature, offered the same way in
// both places that place one.
//
// Shared rather than written twice on purpose. Sign PDF and the editor's sign
// panel already kept separate signature lists in separate storage, and that is
// exactly how the two drifted; a control duplicated here would drift the same
// way.
import { Ban } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

export type SignatureBg = string | null;

interface Props {
  value: SignatureBg;
  onChange: (next: SignatureBg) => void;
  className?: string;
}

/**
 * Common page stocks, so the usual cases need no picking at all.
 *
 * Colours only. A t() call out here would resolve once at import and keep that
 * language for the rest of the session, which is the same trap the compress
 * presets fell into; the label is looked up at render instead.
 */
const PRESETS = [
  { colour: '#ffffff', key: 'signatureBackground.white' },
  { colour: '#faf8f2', key: 'signatureBackground.cream' },
  { colour: '#f5f5f5', key: 'signatureBackground.grey' },
] as const;

export function SignatureBackground({ value, onChange, className }: Props) {
  // Names the thing it sets, without repeating the ink picker's wording. Two
  // controls in one panel both called "custom colour" cannot be told apart by
  // anyone reading the labels, whether by eye or by screen reader.
  const customLabel = t('signatureBackground.label');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="text-xs font-medium text-foreground">
        {t('signatureBackground.label')}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* None is first and is the default: a signature with no background is
            the one that works on every page. */}
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          title={t('signatureBackground.none')}
          className={cn(
            'flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]',
            value === null
              ? 'border-primary bg-accent font-medium text-foreground'
              : 'border-border text-muted-foreground hover:bg-accent',
          )}
        >
          <Ban className="h-3 w-3" aria-hidden="true" />
          {t('signatureBackground.none')}
        </button>

        {PRESETS.map((p) => {
          // Qualified with what it sets. The ink picker in the same panel has
          // its own White, and two controls with one name is ambiguous to read
          // and impossible to address by voice or screen reader.
          const label = `${t('signatureBackground.label')}: ${t(p.key)}`;
          return (
          <button
            key={p.colour}
            type="button"
            onClick={() => onChange(p.colour)}
            aria-pressed={value?.toLowerCase() === p.colour}
            title={label}
            aria-label={label}
            className={cn(
              'h-7 w-7 rounded-md border',
              value?.toLowerCase() === p.colour ? 'border-primary ring-2 ring-ring' : 'border-border',
            )}
            style={{ backgroundColor: p.colour }}
          />
          );
        })}

        {/* Qualified for the same reason as the swatches: the ink picker beside
            this one also offers a custom colour. */}
        <label
          className="flex h-7 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent"
          title={customLabel}
        >
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            aria-label={customLabel}
          />
        </label>

      </div>
    </div>
  );
}
