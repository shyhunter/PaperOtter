import { useEffect, useState } from 'react';
import LoadingScissors from '@/components/ui/loading-scissors';

interface SplashScreenProps {
  onComplete: () => void;
}

const APP_VERSION = '1.0.0-beta.1';

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [showScissors, setShowScissors] = useState(false);
  const [version, setVersion] = useState(APP_VERSION);

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setVersion)
      .catch(() => setVersion(APP_VERSION));
  }, []);

  useEffect(() => {
    // 1. Text appears immediately (fade-in 0.5s)
    // 2. Scissors animation starts after 0.8s
    const scissorsTimer = setTimeout(() => {
      setShowScissors(true);
    }, 800);

    // 3. Scissors draws for 3s (0.8 + 3 = 3.8s), hold 1s
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 5000);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 5400);

    return () => {
      clearTimeout(scissorsTimer);
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
      {/* Text appears first */}
      <h1 className="splash-text-in text-4xl font-bold tracking-tight text-foreground">
        Papercut
      </h1>
      <p className="splash-text-in-delayed mt-2 text-sm text-muted-foreground">
        Your local document toolkit — private, fast, offline
      </p>
      <p className="splash-text-in-delayed mt-2 text-xs text-muted-foreground/50">
        v{version}
      </p>

      {/* Scissors animation appears after text, draws over it */}
      <div className="mt-8">
        {showScissors && <LoadingScissors />}
      </div>

      <style>{`
        .splash-text-in {
          opacity: 0;
          transform: translateY(6px);
          animation: splashIn 0.5s ease-out 0.1s forwards;
        }
        .splash-text-in-delayed {
          opacity: 0;
          transform: translateY(6px);
          animation: splashIn 0.5s ease-out 0.3s forwards;
        }
        @keyframes splashIn {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
