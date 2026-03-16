import { useEffect, useState } from 'react';
import LoadingScissors from '@/components/ui/loading-scissors';

interface SplashScreenProps {
  onComplete: () => void;
}

const APP_VERSION = '1.0.0-beta.1';

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [version, setVersion] = useState(APP_VERSION);

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setVersion)
      .catch(() => setVersion(APP_VERSION));
  }, []);

  useEffect(() => {
    // Animation: 3s draw + 0.5s cut + 0.5s hold = 4s, then text, then fade
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 4800);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 5200); // 4800ms display + 400ms fade-out

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-[400ms] ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Animated scissors drawing */}
      <LoadingScissors />

      {/* App name — appears after scissors finish drawing */}
      <h1 className="splash-text-reveal mt-6 text-4xl font-bold tracking-tight text-foreground">
        Papercut
      </h1>
      <p className="splash-text-reveal-delayed mt-2 text-sm text-muted-foreground">
        Your local document toolkit — private, fast, offline
      </p>
      <p className="splash-text-reveal-delayed mt-3 text-xs text-muted-foreground/50">
        v{version}
      </p>

      <style>{`
        .splash-text-reveal {
          opacity: 0;
          transform: translateY(8px);
          animation: splashReveal 0.5s ease-out 3.5s forwards;
        }
        .splash-text-reveal-delayed {
          opacity: 0;
          transform: translateY(8px);
          animation: splashReveal 0.5s ease-out 3.7s forwards;
        }
        @keyframes splashReveal {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
