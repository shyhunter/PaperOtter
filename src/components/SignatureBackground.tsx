// SignatureBackground: what sits behind a signature, offered the same way in
// both places that place one.
//
// Shared rather than written twice on purpose. Sign PDF and the editor's sign
// panel already kept separate signature lists in separate storage, and that is
// exactly how the two drifted; a control duplicated here would drift the same
// way.
import { useCallback, useRef, useState } from 'react';
import { Pipette, Ban } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { sampleAverageColour } from '@/lib/signatureBackground';

export type SignatureBg = string | null;

interface Props {
  value: SignatureBg;
  onChange: (next: SignatureBg) => void;
  /**
   * The rendered page, when there is one on screen. Given it, the picker can
   * take its colour straight off the document instead of asking someone to
   * match a cream page by eye.
   */
  pageCanvas?: HTMLCanvasElement | null;
  /** Turns on while the pointer is being used to pick a colour off the page. */
  onPickingChange?: (picking: boolean) => void;
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

export function SignatureBackground({
  value, onChange, pageCanvas, onPickingChange, className,
}: Props) {
  const [picking, setPicking] = useState(false);
  // Names the thing it sets, without repeating the ink picker's wording. Two
  // controls in one panel both called "custom colour" cannot be told apart by
  // anyone reading the labels, whether by eye or by screen reader.
  const customLabel = t('signatureBackground.label');
  const cleanup = useRef<(() => void) | null>(null);

  const stopPicking = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setPicking(false);
    onPickingChange?.(false);
  }, [onPickingChange]);

  /**
   * Takes the next click on the page and reads the colour under it.
   *
   * Bound on the canvas rather than the window so a click on the panel itself
   * cancels instead of sampling a button. Escape cancels too: a picker with no
   * way out is a trap, and the pointer stays a crosshair until it is released.
   */
  const startPicking = useCallback(() => {
    if (!pageCanvas) return;
    setPicking(true);
    onPickingChange?.(true);

    const onClick = (e: MouseEvent) => {
      const rect = pageCanvas.getBoundingClientRect();
      // The canvas is displayed at whatever size the layout gives it, which is
      // rarely its pixel size, so the click has to be scaled into raster space.
      const x = Math.round((e.clientX - rect.left) * (pageCanvas.width / rect.width));
      const y = Math.round((e.clientY - rect.top) * (pageCanvas.height / rect.height));
      const ctx = pageCanvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        try {
          const img = ctx.getImageData(0, 0, pageCanvas.width, pageCanvas.height);
          const picked = sampleAverageColour(img.data, pageCanvas.width, pageCanvas.height, x, y);
          if (picked) onChange(picked);
        } catch {
          // A tainted canvas cannot be read. Nothing to say: the preset swatches
          // and the colour field are both still there.
        }
      }
      e.preventDefault();
      e.stopPropagation();
      stopPicking();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopPicking(); };

    pageCanvas.addEventListener('click', onClick, { capture: true, once: true });
    window.addEventListener('keydown', onKey);
    pageCanvas.style.cursor = 'crosshair';
    cleanup.current = () => {
      pageCanvas.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('keydown', onKey);
      pageCanvas.style.cursor = '';
    };
  }, [pageCanvas, onChange, onPickingChange, stopPicking]);

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

        {pageCanvas && (
          <button
            type="button"
            onClick={picking ? stopPicking : startPicking}
            aria-pressed={picking}
            title={t('signatureBackground.pickFromPage')}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]',
              picking
                ? 'border-primary bg-accent font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            <Pipette className="h-3 w-3" aria-hidden="true" />
            {picking ? t('signatureBackground.pickingCancel') : t('signatureBackground.pickFromPage')}
          </button>
        )}
      </div>

      {picking && (
        <p className="text-[11px] text-muted-foreground">
          {t('signatureBackground.pickingHint')}
        </p>
      )}
    </div>
  );
}
