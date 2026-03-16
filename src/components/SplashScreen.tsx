import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

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
      {/* Scissors icon (inline SVG matching app icon theme) */}
      <div className="mb-6 animate-fade-in">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1024 1024"
          className="h-28 w-28 drop-shadow-lg"
        >
          <defs>
            <linearGradient id="splash-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <linearGradient id="splash-paper" x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            <linearGradient id="splash-blade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c0c0c0" />
              <stop offset="100%" stopColor="#9ca3af" />
            </linearGradient>
          </defs>
          <rect x="32" y="32" width="960" height="960" rx="200" ry="200" fill="url(#splash-bg)" />
          {/* Left paper piece */}
          <path d="M 280 220 L 460 220 L 460 560 L 340 620 L 280 620 Z" fill="url(#splash-paper)" opacity="0.85" transform="rotate(-8, 370, 420)" />
          <line x1="310" y1="290" x2="430" y2="290" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(-8, 370, 420)" />
          <line x1="310" y1="340" x2="420" y2="340" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(-8, 370, 420)" />
          <line x1="310" y1="390" x2="400" y2="390" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(-8, 370, 420)" />
          {/* Right paper piece */}
          <path d="M 520 250 L 740 250 L 740 750 L 520 750 Z" fill="url(#splash-paper)" transform="rotate(5, 630, 500)" />
          <line x1="555" y1="330" x2="705" y2="330" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(5, 630, 500)" />
          <line x1="555" y1="385" x2="700" y2="385" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(5, 630, 500)" />
          <line x1="555" y1="440" x2="680" y2="440" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(5, 630, 500)" />
          <line x1="555" y1="495" x2="690" y2="495" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(5, 630, 500)" />
          <line x1="555" y1="550" x2="670" y2="550" stroke="#cbd5e1" strokeWidth="8" strokeLinecap="round" transform="rotate(5, 630, 500)" />
          {/* Scissors */}
          <g transform="translate(512, 580) rotate(-30)">
            <ellipse cx="-90" cy="55" rx="28" ry="55" fill="none" stroke="#f1f5f9" strokeWidth="14" transform="rotate(15, -90, 55)" />
            <path d="M -70 20 L 30 -120" stroke="url(#splash-blade)" strokeWidth="22" strokeLinecap="round" />
            <ellipse cx="90" cy="55" rx="28" ry="55" fill="none" stroke="#f1f5f9" strokeWidth="14" transform="rotate(-15, 90, 55)" />
            <path d="M 70 20 L -30 -120" stroke="url(#splash-blade)" strokeWidth="22" strokeLinecap="round" />
            <circle cx="0" cy="-50" r="14" fill="#f1f5f9" stroke="#9ca3af" strokeWidth="4" />
            <circle cx="0" cy="-50" r="5" fill="#9ca3af" />
          </g>
        </svg>
      </div>

      {/* App name */}
      <h1 className="animate-fade-in text-4xl font-bold tracking-tight text-foreground">
        Papercut
      </h1>
      <p className="animate-fade-in mt-2 text-sm text-muted-foreground">
        Resize and reformat, locally
      </p>

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
