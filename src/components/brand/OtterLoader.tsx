import { OtterMark } from './OtterMark';

/**
 * How much room the loader has. The mark is the same at every size; only the
 * slot differs.
 *
 * `sm` is for a panel or a thumbnail that is waiting on one render, `md` for a
 * canvas or a preview pane, `lg` for a whole screen given over to the job.
 */
export type OtterLoaderSize = 'sm' | 'md' | 'lg';

const MARK_SIZE: Record<OtterLoaderSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

interface OtterLoaderProps {
  /** Rendered under the mark. Say what is happening, not "Loading". */
  label?: string;
  size?: OtterLoaderSize;
  className?: string;
}

/**
 * The loading state: the mark flips toward the viewer, snapping through sixteen
 * positions a second like hand-cranked film.
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
 * For control-size spinners -- inside a button, beside a label, over a preview
 * -- use `OtterSpinner`, which is this animation on the simplified mark.
 */
export function OtterLoader({ label, size = 'lg', className }: OtterLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center gap-4 ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="otter-loader-stage">
        <OtterMark className={`otter-loader-mark ${MARK_SIZE[size]} text-foreground`} />
      </div>
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  );
}
