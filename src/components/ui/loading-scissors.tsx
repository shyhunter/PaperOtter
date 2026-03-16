import React from "react";

/**
 * Animated scissors loading indicator.
 * A single continuous SVG path draws itself from top to bottom,
 * matching the Lucide scissors icon style (geometric lines + circles).
 * After drawing completes, a "snip" cut animation plays.
 */
const LoadingScissors: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <svg
        viewBox="0 0 120 160"
        width="120"
        height="160"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/*
          Single continuous path that traces the entire scissors shape
          top-to-bottom in one stroke:
          1. Right blade tip (top-right) down to center
          2. Continue to left handle circle (bottom-left)
          3. Back to center
          4. Left blade tip (top-left) down to center
          5. Continue to right handle circle (bottom-right)
        */}
        <path
          className="scissors-path"
          stroke="currentColor"
          strokeWidth="4.5"
          d={`
            M 85 15
            L 42 72

            C 36 65, 26 62, 20 66
            C 10 72, 8 86, 16 94
            C 24 102, 36 98, 38 88
            C 39 83, 38 78, 35 74

            L 55 80

            L 35 15

            M 55 80

            L 65 74
            C 62 78, 61 83, 62 88
            C 64 98, 76 102, 84 94
            C 92 86, 90 72, 80 66
            C 74 62, 64 65, 58 72
            L 85 15
          `}
        />

        {/* Pivot dot at center (appears after drawing) */}
        <circle
          className="scissors-pivot"
          cx="55"
          cy="76"
          r="3"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
        />

        {/* Cut pieces that separate after drawing completes */}
        <g className="scissors-cut">
          {/* Left piece */}
          <rect
            className="scissors-piece-left"
            x="20" y="128" width="35" height="24" rx="2"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="4,5"
          />
          {/* Right piece */}
          <rect
            className="scissors-piece-right"
            x="65" y="128" width="35" height="24" rx="2"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="4,5"
          />
          {/* Cut line */}
          <line
            className="scissors-cut-line"
            x1="25" y1="140" x2="95" y2="140"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4,6"
            opacity="0.4"
          />
        </g>
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
          animation: fadeIn 0.3s ease-out 1.8s forwards;
        }

        .scissors-cut {
          opacity: 0;
          animation: fadeIn 0.3s ease-out 3.1s forwards;
        }

        .scissors-piece-left {
          transform-origin: 55px 140px;
          animation: snipLeft 0.5s ease-out 3.3s forwards;
        }

        .scissors-piece-right {
          transform-origin: 55px 140px;
          animation: snipRight 0.5s ease-out 3.3s forwards;
        }

        @keyframes drawPath {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes fadeIn {
          to { opacity: 1; }
        }

        @keyframes snipLeft {
          0%   { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(-6px, 4px) rotate(-5deg); }
        }

        @keyframes snipRight {
          0%   { transform: translate(0, 0) rotate(0deg); }
          100% { transform: translate(6px, 4px) rotate(5deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingScissors;
