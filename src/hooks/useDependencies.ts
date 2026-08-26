import { t } from '@/i18n';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DependencyName } from '@/types/tools';

/**
 * What to tell someone whose build cannot compress PDFs.
 *
 * This used to say Ghostscript was "bundled with Papercut" and suggest
 * reinstalling the app. Ghostscript is only genuinely bundled for Apple Silicon;
 * the other three platforms ship a stub, so that advice sent people to reinstall
 * something that would never fix it. The app does fall back to a system-installed
 * Ghostscript, so pointing at the right installer is advice that actually works.
 */
export function ghostscriptHint(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Macintosh')) return t('deps.ghostscriptMac');
  if (ua.includes('Windows')) return t('deps.ghostscriptWindows');
  return t('deps.ghostscriptLinux');
}

const INSTALL_HINTS: Record<DependencyName, () => string> = {
  ghostscript: ghostscriptHint,
  calibre: () => t('deps.calibre'),
  libreoffice: () => t('deps.libreoffice'),
};

interface DependencyStatus {
  available: Record<DependencyName, boolean>;
  loading: boolean;
  getHint: (dep: DependencyName) => string;
  isAvailable: (dep: DependencyName | undefined) => boolean;
}

export function useDependencies(): DependencyStatus {
  const [available, setAvailable] = useState<Record<DependencyName, boolean>>({
    ghostscript: true, // assume available until checked
    calibre: true,
    libreoffice: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<string>('detect_converters')
      .then((json) => {
        const parsed = JSON.parse(json) as Record<string, boolean>;
        setAvailable({
          ghostscript: parsed.ghostscript ?? false,
          calibre: parsed.calibre ?? false,
          libreoffice: parsed.libreoffice ?? false,
        });
      })
      .catch(() => {
        // On error, assume nothing is available
        setAvailable({ ghostscript: false, calibre: false, libreoffice: false });
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    available,
    loading,
    getHint: (dep: DependencyName) => INSTALL_HINTS[dep](),
    isAvailable: (dep: DependencyName | undefined) => dep === undefined || available[dep],
  };
}
