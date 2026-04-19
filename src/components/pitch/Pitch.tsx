/**
 * SVG football pitch with click-to-tag.
 * Coordinates are 0-100 for both x (length) and y (width).
 * Goal at x=100 (right) is the home team's attacking goal in this view.
 */
import { useRef } from "react";

const PITCH_W = 100;
const PITCH_H = 64;

export interface PitchProps {
  children?: React.ReactNode;
  onClick?: (x: number, y: number) => void;
  className?: string;
  interactive?: boolean;
}

export function Pitch({ children, onClick, className, interactive = true }: PitchProps) {
  const ref = useRef<SVGSVGElement>(null);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onClick || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * PITCH_W;
    const y = ((e.clientY - rect.top) / rect.height) * PITCH_H;
    onClick(
      Math.max(0, Math.min(100, x)),
      Math.max(0, Math.min(100, (y / PITCH_H) * 100))
    );
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${PITCH_W} ${PITCH_H}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      onClick={interactive ? handleClick : undefined}
      style={{ cursor: interactive ? "crosshair" : undefined }}
    >
      {/* grass */}
      <defs>
        <linearGradient id="pitchGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.46 0.13 145)" />
          <stop offset="100%" stopColor="oklch(0.38 0.12 145)" />
        </linearGradient>
        <pattern id="stripes" width="10" height="64" patternUnits="userSpaceOnUse">
          <rect width="10" height="64" fill="url(#pitchGrad)" />
          <rect width="5" height="64" fill="oklch(0.42 0.13 145 / 0.5)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={PITCH_W} height={PITCH_H} fill="url(#stripes)" />

      {/* lines */}
      <g
        fill="none"
        stroke="oklch(1 0 0 / 0.55)"
        strokeWidth="0.25"
      >
        {/* outer */}
        <rect x="1" y="1" width={PITCH_W - 2} height={PITCH_H - 2} />
        {/* halfway */}
        <line x1={PITCH_W / 2} y1="1" x2={PITCH_W / 2} y2={PITCH_H - 1} />
        <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r="6" />
        <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r="0.4" fill="oklch(1 0 0 / 0.55)" />

        {/* left penalty area */}
        <rect x="1" y={PITCH_H / 2 - 13} width="13" height="26" />
        <rect x="1" y={PITCH_H / 2 - 5} width="4.5" height="10" />
        <circle cx="9" cy={PITCH_H / 2} r="0.4" fill="oklch(1 0 0 / 0.55)" />
        <path d={`M 14 ${PITCH_H / 2 - 5} A 6 6 0 0 1 14 ${PITCH_H / 2 + 5}`} />

        {/* right penalty area */}
        <rect x={PITCH_W - 14} y={PITCH_H / 2 - 13} width="13" height="26" />
        <rect x={PITCH_W - 5.5} y={PITCH_H / 2 - 5} width="4.5" height="10" />
        <circle cx={PITCH_W - 9} cy={PITCH_H / 2} r="0.4" fill="oklch(1 0 0 / 0.55)" />
        <path d={`M ${PITCH_W - 14} ${PITCH_H / 2 - 5} A 6 6 0 0 0 ${PITCH_W - 14} ${PITCH_H / 2 + 5}`} />
      </g>

      {/* overlay layer */}
      <g style={{ pointerEvents: "none" }}>{children}</g>
    </svg>
  );
}

/** Convert app y (0-100) to svg y (0-PITCH_H). */
export function yToSvg(y: number) {
  return (y / 100) * PITCH_H;
}
export const PITCH_HEIGHT = PITCH_H;
export const PITCH_WIDTH = PITCH_W;
