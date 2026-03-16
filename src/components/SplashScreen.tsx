import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(''));
  }, []);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 1500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1800); // 1500ms display + 300ms fade-out

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-300 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Scissors icon (inline SVG matching app icon — black & white) */}
      <div className="mb-6 animate-fade-in">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1024 1024"
          className="h-28 w-28 drop-shadow-lg"
        >
          {/* macOS-style superellipse background */}
          <path d="
            M 512 16
            C 780 16 848 16 912 80
            C 976 144 1008 244 1008 512
            C 1008 780 976 880 912 944
            C 848 1008 780 1008 512 1008
            C 244 1008 144 1008 80 944
            C 16 880 16 780 16 512
            C 16 244 16 144 80 80
            C 144 16 244 16 512 16 Z
          " fill="#1a1a1a" className="dark:fill-[#1a1a1a]" />

          {/* Large paper sheet */}
          <path d="M 300 160 L 680 160 L 724 204 L 724 864 L 300 864 Z" fill="#ffffff" />
          <path d="M 680 160 L 680 204 L 724 204 Z" fill="#cccccc" />
          <line x1="360" y1="280" x2="660" y2="280" stroke="#d0d0d0" strokeWidth="12" strokeLinecap="round" />
          <line x1="360" y1="340" x2="640" y2="340" stroke="#d0d0d0" strokeWidth="12" strokeLinecap="round" />
          <line x1="360" y1="400" x2="620" y2="400" stroke="#d0d0d0" strokeWidth="12" strokeLinecap="round" />
          <line x1="360" y1="460" x2="650" y2="460" stroke="#d0d0d0" strokeWidth="12" strokeLinecap="round" />
          <line x1="360" y1="520" x2="600" y2="520" stroke="#d0d0d0" strokeWidth="12" strokeLinecap="round" />

          {/* Large scissors */}
          <g transform="translate(510, 660) rotate(-25) scale(1.3)">
            <ellipse cx="-75" cy="70" rx="32" ry="48" fill="none" stroke="#ffffff" strokeWidth="16" />
            <path d="M -55 30 L 20 -130" stroke="#ffffff" strokeWidth="20" strokeLinecap="round" />
            <ellipse cx="75" cy="70" rx="32" ry="48" fill="none" stroke="#ffffff" strokeWidth="16" />
            <path d="M 55 30 L -20 -130" stroke="#ffffff" strokeWidth="20" strokeLinecap="round" />
            <circle cx="0" cy="-40" r="14" fill="#1a1a1a" stroke="#ffffff" strokeWidth="6" />
          </g>

          {/* Cut line */}
          <line x1="240" y1="620" x2="520" y2="540" stroke="#888888" strokeWidth="4" strokeDasharray="16,12" strokeLinecap="round" />
        </svg>
      </div>

      {/* App name */}
      <h1 className="animate-fade-in text-4xl font-bold tracking-tight text-foreground">
        Papercut
      </h1>
      <p className="animate-fade-in mt-2 text-sm text-muted-foreground">
        Your local document toolkit — private, fast, offline
      </p>
      {version && (
        <p className="animate-fade-in mt-3 text-xs text-muted-foreground/60">
          v{version}
        </p>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
