import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DependencyName } from '@/types/tools';

const INSTALL_HINTS: Record<DependencyName, string> = {
  ghostscript: 'Ghostscript is bundled with Papercut. If unavailable, reinstall the app or install manually: brew install ghostscript',
  calibre: 'Install Calibre for ebook support — calibre-ebook.com/download',
  libreoffice: 'Install LibreOffice for document conversion — libreoffice.org/download',
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
    getHint: (dep: DependencyName) => INSTALL_HINTS[dep],
    isAvailable: (dep: DependencyName | undefined) => dep === undefined || available[dep],
  };
}
