import { OtterMark } from './OtterMark';

interface OtterSpinnerProps {
  /** Tailwind size classes. Defaults to 20px, which is where the mark still reads. */
  className?: string;
}

/**
 * The loader at control size: inside a button, beside a label, over a preview.
 *
 * It uses the simplified mark rather than the full one. The full outline is 329
 * path segments traced from the artwork, and below about 48px they fill into
 * each other; `simple` is the same drawing traced at a smaller size, so its
 * shapes survive. Rendered side by side at 16, 20, 24 and 32px, `simple` at
 * 20px is the smallest that still reads as an otter rather than as a mark.
 *
 * Same keyframe as `OtterLoader`, deliberately: this is the same animation at a
 * different size, not a second one. That also means it inherits the compositor
 * -only transform and the reduced-motion rule for free.
 */
export function OtterSpinner({ className }: OtterSpinnerProps) {
  return (
    <span className="otter-loader-stage inline-flex flex-none" aria-hidden="true">
      <OtterMark variant="simple" className={`otter-loader-mark ${className ?? "size-5"}`} />
    </span>
  );
}
