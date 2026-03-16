import React from "react";

const LoadingScissors: React.FC = () => {
  return (
    <div className="flex items-center justify-center">
      <svg
        viewBox="0 0 200 300"
        className="scissors-loader"
        width="100"
        height="150"
        fill="transparent"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Left blade */}
        <path
          className="scissors-draw"
          d="M 90 130 L 60 30 Q 55 15 65 10 Q 75 5 80 20 L 105 115"
        />
        {/* Right blade */}
        <path
          className="scissors-draw"
          d="M 110 130 L 140 30 Q 145 15 135 10 Q 125 5 120 20 L 95 115"
        />
        {/* Pivot screw */}
        <circle
          className="scissors-draw"
          cx="100"
          cy="125"
          r="8"
        />
        {/* Left handle */}
        <path
          className="scissors-draw"
          d="M 92 133 Q 80 150 65 165 Q 40 190 35 210 Q 30 235 50 245 Q 70 255 80 240 Q 90 225 85 200 Q 82 185 88 165 Q 92 150 95 140"
        />
        {/* Right handle */}
        <path
          className="scissors-draw"
          d="M 108 133 Q 120 150 135 165 Q 160 190 165 210 Q 170 235 150 245 Q 130 255 120 240 Q 110 225 115 200 Q 118 185 112 165 Q 108 150 105 140"
        />

        {/* Cut line (appears after scissors are drawn) */}
        <line
          className="scissors-cut-line"
          x1="60"
          y1="270"
          x2="140"
          y2="270"
          strokeDasharray="4,6"
          strokeWidth="3"
        />

        {/* Left cut piece */}
        <path
          className="scissors-snip-left"
          d="M 70 260 L 60 290 L 90 290 L 95 260 Z"
          strokeWidth="3"
        />
        {/* Right cut piece */}
        <path
          className="scissors-snip-right"
          d="M 105 260 L 110 290 L 140 290 L 130 260 Z"
          strokeWidth="3"
        />
      </svg>

      <style>{`
        .scissors-loader {
          color: var(--foreground, #1a1a1a);
        }

        .scissors-draw {
          --path-length: 800;
          stroke-dashoffset: 800;
          stroke-dasharray: 0 800;
          animation: drawScissors 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        .scissors-cut-line {
          opacity: 0;
          animation: showCutLine 0.3s ease-out 2.6s forwards;
        }

        .scissors-snip-left {
          opacity: 0;
          animation: snipLeft 0.4s ease-out 2.8s forwards;
        }

        .scissors-snip-right {
          opacity: 0;
          animation: snipRight 0.4s ease-out 2.8s forwards;
        }

        @keyframes drawScissors {
          0% {
            stroke-dashoffset: 800;
            stroke-dasharray: 0 800;
          }
          100% {
            stroke-dashoffset: 0;
            stroke-dasharray: 800 0;
          }
        }

        @keyframes showCutLine {
          from {
            opacity: 0;
          }
          to {
            opacity: 0.5;
          }
        }

        @keyframes snipLeft {
          0% {
            opacity: 0;
            transform: translate(0, 0) rotate(0deg);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate(-8px, 6px) rotate(-8deg);
          }
        }

        @keyframes snipRight {
          0% {
            opacity: 0;
            transform: translate(0, 0) rotate(0deg);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate(8px, 6px) rotate(8deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingScissors;
