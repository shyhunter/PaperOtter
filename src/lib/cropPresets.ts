import { t } from '@/i18n';

/**
 * The margin presets, shared by the standalone Crop tool and the editor's crop
 * panel so the two cannot offer different ones.
 *
 * A function rather than a constant: `t()` at module scope resolves once while
 * the module graph is being built, before the stored locale has been read, and
 * keeps that language for the rest of the session.
 */
export function cropMarginPresets(): { label: string; mm: number }[] {
  return [
    { label: t('cropPdfFlow.none'), mm: 0 },
    { label: t('watermarkFlow.small'), mm: 5 },
    { label: t('watermarkFlow.medium'), mm: 10 },
    { label: t('watermarkFlow.large'), mm: 20 },
  ];
}
