import { t } from '@/i18n';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DependencyName } from '@/types/tools';

/**
 * What to tell someone whose build cannot compress PDFs.
 *
 * The advice has to differ by platform because what is actually in the bundle
 * differs by platform. Verified during REL-02 on 2026-08-28: real Ghostscript
 * binaries are committed for macOS arm64, macOS x86_64 and Linux, and both macOS
 * slices link nothing outside /usr/lib — no Homebrew required. Only Windows still
 * holds a placeholder locally, which CI replaces at release time.
 *
 * So on macOS, "reinstall" is the correct advice and `brew install ghostscript`
 * was not: it points at a program the app already ships, and it is unusable by
 * the very person most likely to see it, who has no Homebrew. Detection tries the
 * sidecar before anything else, so this hint is only ever reached when the
 * bundled copy failed to start — which reinstalling does fix.
 *
 * Windows and Linux copy is unchanged pending verification on real machines.
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
