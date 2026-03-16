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
      {/* Scissors icon (inline SVG matching app icon — B&W scissors cutting paper) */}
      <div className="mb-6 animate-fade-in">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1024 1024"
          className="h-28 w-28 drop-shadow-lg"
        >
          {/* White background */}
          <rect width="1024" height="1024" rx="220" ry="220" className="fill-white dark:fill-zinc-800" />

          {/* Paper sheet (slightly rotated, with fold corner) */}
          <g transform="translate(512, 420) rotate(5)">
            <rect x="-180" y="-250" width="360" height="480" rx="8" className="fill-gray-100 dark:fill-zinc-700" stroke="currentColor" strokeWidth="3" opacity="0.8" />
            <path d="M 130 -250 L 180 -250 L 180 -200 Z" className="fill-gray-300 dark:fill-zinc-600" />
            <path d="M 130 -250 L 130 -200 L 180 -200" fill="none" className="stroke-gray-400 dark:stroke-zinc-500" strokeWidth="2" />
            <line x1="-130" y1="-180" x2="100" y2="-180" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="8" strokeLinecap="round" />
            <line x1="-130" y1="-140" x2="80" y2="-140" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="8" strokeLinecap="round" />
            <line x1="-130" y1="-100" x2="110" y2="-100" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="8" strokeLinecap="round" />
            <line x1="-130" y1="-60" x2="70" y2="-60" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="8" strokeLinecap="round" />
            <line x1="-130" y1="-20" x2="90" y2="-20" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="8" strokeLinecap="round" />
          </g>

          {/* Cut line */}
          <line x1="220" y1="580" x2="580" y2="380" stroke="#999999" strokeWidth="3" strokeDasharray="12,8" />

          {/* Black scissors */}
          <g transform="translate(400, 620) rotate(-35) scale(1.6)">
            <path d="M -8 -10 L -30 -140 Q -32 -150 -25 -150 L -10 -150 Q -3 -150 -2 -140 L 8 -10 Z" className="fill-gray-900 dark:fill-gray-100" />
            <path d="M -8 -10 L 25 -140 Q 27 -150 34 -148 L 45 -142 Q 50 -138 48 -130 L 8 -10 Z" className="fill-gray-800 dark:fill-gray-200" />
            <circle cx="0" cy="-10" r="10" className="fill-gray-700 dark:fill-gray-300 stroke-gray-900 dark:stroke-gray-100" strokeWidth="3" />
            <circle cx="0" cy="-10" r="4" className="fill-gray-500 dark:fill-gray-400" />
            <ellipse cx="-40" cy="60" rx="38" ry="50" fill="none" className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="14" />
            <path d="M -8 0 Q -20 20 -20 30 Q -20 40 -30 45" fill="none" className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="14" strokeLinecap="round" />
            <ellipse cx="40" cy="60" rx="38" ry="50" fill="none" className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="14" />
            <path d="M 8 0 Q 20 20 20 30 Q 20 40 30 45" fill="none" className="stroke-gray-900 dark:stroke-gray-100" strokeWidth="14" strokeLinecap="round" />
          </g>

          {/* Small cut piece */}
          <g transform="translate(260, 320) rotate(-20)">
            <rect x="-60" y="-80" width="120" height="140" rx="4" className="fill-gray-200 dark:fill-zinc-600" stroke="currentColor" strokeWidth="2" opacity="0.7" />
            <line x1="-35" y1="-50" x2="35" y2="-50" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="6" strokeLinecap="round" />
            <line x1="-35" y1="-20" x2="25" y2="-20" className="stroke-gray-300 dark:stroke-zinc-500" strokeWidth="6" strokeLinecap="round" />
          </g>
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
