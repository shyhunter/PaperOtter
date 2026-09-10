import { OtterMark } from './OtterMark';

interface OtterLoaderProps {
  /** Rendered under the mark. Say what is happening, not "Loading". */
  label?: string;
  className?: string;
}

/**
 * The whole-screen loading state: the mark flips toward the viewer, snapping
 * through sixteen positions a second like hand-cranked film.
 *
 * Two things here are deliberate rather than decorative:
 *
 * - It animates `transform` only, so it runs on the compositor. A loading
 *   animation plays exactly when the app is busiest, and anything driven by JS
 *   or animating layout properties would stall precisely when it is on screen.
 *   A frozen spinner reads as a crashed app.
 * - It flips on Y rather than rotating in the plane, so the face never appears
 *   upside down. `prefers-reduced-motion` stops it upright and fully visible.
 *
 * For 16px spinners inside buttons, keep using `Loader2` — an otter that small
 * is a smudge.
 */
export function OtterLoader({ label, className }: OtterLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center gap-4 ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="otter-loader-stage">
        <OtterMark className="otter-loader-mark h-16 w-16 text-foreground" />
      </div>
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  );
}
