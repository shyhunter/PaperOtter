import { useEffect, useState } from 'react';
import logoSvg from '@/assets/logo.svg';

interface SplashScreenProps {
  onComplete: () => void;
}

const APP_VERSION = '1.0.0-beta.7';

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [showLogo, setShowLogo] = useState(false);
  const [version, setVersion] = useState(APP_VERSION);

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then((mod) => mod.getVersion())
      .then(setVersion)
      .catch(() => setVersion(APP_VERSION));
  }, []);

  useEffect(() => {
    // Text appears immediately (fade-in 0.6s)
    // Logo fades in after 0.8s
    const logoTimer = setTimeout(() => {
      setShowLogo(true);
    }, 800);

    // Hold for 3.5s total, then fade out
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 3500);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 4000);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-[500ms] ${
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
      <p className="splash-text-in-delayed mt-1 text-xs text-muted-foreground/50">
        v{version}
      </p>

      {/* Logo fades in below text */}
      <div
        className={`mt-8 transition-opacity duration-700 ${
          showLogo ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <img
          src={logoSvg}
          alt="Papercut logo"
          className="h-28 w-28 dark:invert"
        />
      </div>

      <style>{`
        .splash-text-in {
          opacity: 0;
          transform: translateY(6px);
          animation: splashIn 0.6s ease-out 0.1s forwards;
        }
        .splash-text-in-delayed {
          opacity: 0;
          transform: translateY(6px);
          animation: splashIn 0.6s ease-out 0.35s forwards;
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
