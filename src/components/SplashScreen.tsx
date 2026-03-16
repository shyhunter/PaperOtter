import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

const APP_VERSION = '1.0.0-beta.1';

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [version, setVersion] = useState(APP_VERSION);

  useEffect(() => {
    // Try to get the version from Tauri API, fall back to hardcoded
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setVersion)
      .catch(() => setVersion(APP_VERSION));
  }, []);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 1500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 1800);

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
      {/* Scissors cutting paper — large, clear, B&W */}
      <div className="mb-8 animate-splash-fade-in">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          width="120"
          height="120"
        >
          {/* Paper sheet */}
          <rect x="55" y="25" width="100" height="130" rx="4" fill="#e5e5e5" stroke="#ccc" strokeWidth="1.5" />
          {/* Folded corner */}
          <path d="M 135 25 L 155 25 L 155 45 Z" fill="#d4d4d4" />
          <path d="M 135 25 L 135 45 L 155 45" fill="none" stroke="#bbb" strokeWidth="1" />
          {/* Text lines */}
          <line x1="70" y1="50" x2="140" y2="50" stroke="#ccc" strokeWidth="3" strokeLinecap="round" />
          <line x1="70" y1="62" x2="130" y2="62" stroke="#ccc" strokeWidth="3" strokeLinecap="round" />
          <line x1="70" y1="74" x2="135" y2="74" stroke="#ccc" strokeWidth="3" strokeLinecap="round" />
          <line x1="70" y1="86" x2="125" y2="86" stroke="#ccc" strokeWidth="3" strokeLinecap="round" />
          <line x1="70" y1="98" x2="132" y2="98" stroke="#ccc" strokeWidth="3" strokeLinecap="round" />

          {/* Cut line (dashed) */}
          <line x1="30" y1="130" x2="130" y2="100" stroke="#aaa" strokeWidth="1.5" strokeDasharray="5,4" />

          {/* Small cut-off piece */}
          <g transform="translate(42, 55) rotate(-15)">
            <rect x="-20" y="-25" width="40" height="45" rx="2" fill="#e0e0e0" stroke="#ccc" strokeWidth="1" />
            <line x1="-12" y1="-14" x2="12" y2="-14" stroke="#ccc" strokeWidth="2" strokeLinecap="round" />
            <line x1="-12" y1="-4" x2="8" y2="-4" stroke="#ccc" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* SCISSORS — bold, black, unmistakable */}
          <g transform="translate(75, 145) rotate(-30)">
            {/* Left blade */}
            <path d="M -3 -5 L -12 -60 C -13 -65 -8 -66 -4 -65 L 3 -60 L 3 -5 Z" fill="#1a1a1a" />
            {/* Right blade */}
            <path d="M 3 -5 L 15 -60 C 16 -65 12 -66 8 -65 L -3 -55 L -3 -5 Z" fill="#333" />
            {/* Pivot */}
            <circle cx="0" cy="-5" r="4.5" fill="#444" stroke="#1a1a1a" strokeWidth="1.5" />
            <circle cx="0" cy="-5" r="1.5" fill="#777" />
            {/* Left handle */}
            <path d="M -3 0 C -8 8 -18 12 -22 22 C -28 38 -16 52 -2 48 C 6 46 8 38 6 30 C 4 22 -2 16 -3 10" fill="none" stroke="#1a1a1a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            {/* Right handle */}
            <path d="M 3 0 C 8 8 18 12 22 22 C 28 38 16 52 2 48 C -6 46 -8 38 -6 30 C -4 22 2 16 3 10" fill="none" stroke="#1a1a1a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </div>

      {/* App name */}
      <h1 className="animate-splash-fade-in text-4xl font-bold tracking-tight text-foreground">
        Papercut
      </h1>
      <p className="animate-splash-fade-in mt-2 text-sm text-muted-foreground">
        Your local document toolkit — private, fast, offline
      </p>
      <p className="animate-splash-fade-in mt-3 text-xs text-muted-foreground/60">
        v{version}
      </p>

      <style>{`
        @keyframes splashFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-splash-fade-in {
          animation: splashFadeIn 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
