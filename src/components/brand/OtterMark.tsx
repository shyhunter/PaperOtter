import { OTTER_FULL, OTTER_SIMPLE } from './otterPath';

interface OtterMarkProps {
  /** Below ~48px the full outline fills in; `simple` keeps its shapes. */
  variant?: 'full' | 'simple';
  className?: string;
  title?: string;
}

/**
 * The PaperOtter mark. Inlined rather than loaded through `<img>` so it can take
 * `currentColor` — which is what lets one file serve light mode, dark mode and
 * print without a second asset or a CSS invert filter.
 */
export function OtterMark({ variant = 'full', className, title }: OtterMarkProps) {
  const art = variant === 'simple' ? OTTER_SIMPLE : OTTER_FULL;
  return (
    <svg
      viewBox={art.viewBox}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={art.d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
