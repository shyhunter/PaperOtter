import React from "react";

/**
 * Animated scissors loading indicator.
 * Scissors only (no paper) — single continuous path draws top to bottom.
 * Thick Lucide-style strokes matching the app icon.
 */
const LoadingScissors: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <svg
        viewBox="0 0 120 150"
        width="110"
        height="140"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/*
          Single continuous path — draws top to bottom:
          1. Left blade tip (top-right) → down to center crossing
          2. Continue down-left to left handle circle
          3. Back up to center
          4. Right blade tip (top-left) → down to center crossing
          5. Continue down-right to right handle circle
        */}
        <path
          className="scissors-path"
          stroke="currentColor"
          strokeWidth="5.5"
          d={`
            M 82 8
            L 43 68

            M 43 68
            C 38 62, 28 58, 20 62
            C 8 70, 6 88, 16 97
            C 26 106, 40 100, 42 88
            C 43 82, 40 76, 36 72

            M 36 72
            L 60 78

            M 60 78
            L 84 72

            M 84 72
            C 80 76, 77 82, 78 88
            C 80 100, 94 106, 104 97
            C 114 88, 112 70, 100 62
            C 92 58, 82 62, 77 68

            M 77 68
            L 38 8
          `}
        />

        {/* Center connector line */}
        <line
          className="scissors-path"
          x1="43" y1="68"
          x2="77" y2="68"
          stroke="currentColor"
          strokeWidth="5.5"
        />

        {/* Pivot dot (appears after draw completes) */}
        <circle
          className="scissors-pivot"
          cx="60"
          cy="70"
          r="3.5"
          fill="currentColor"
        />
      </svg>

      <style>{`
        .scissors-path {
          --len: 900;
          stroke-dasharray: var(--len);
          stroke-dashoffset: var(--len);
          animation: drawPath 3s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
        }

        .scissors-pivot {
          opacity: 0;
          animation: showPivot 0.3s ease-out 2s forwards;
        }

        @keyframes drawPath {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes showPivot {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default LoadingScissors;
