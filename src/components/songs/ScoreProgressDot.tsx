"use client";

import { useId } from "react";
import type { Game } from "@/App";
import { WORLDS_END_COLORS, type ProgressDotVariant } from "@/lib/chart-colors";

const ULTIMA_DARK = "#09090C";
const ULTIMA_RED = "#E32655";

/** maimaid: the hollow ring fills between 97% and 100%, the centre between 100% and 101%. */
const MAIMAID_RING_START = 97;
const MAIMAID_RING_END = 100;
const MAIMAID_RING_SPAN = MAIMAID_RING_END - MAIMAID_RING_START;

/** CHUNITHM: the same shape, driven by the absolute score. */
const CHUNITHMD_RING_START = 975_000;
const CHUNITHMD_RING_END = 1_000_000;
const CHUNITHMD_RING_SPAN = CHUNITHMD_RING_END - CHUNITHMD_RING_START;
const CHUNITHMD_DOT_SPAN = 1_010_000 - CHUNITHMD_RING_END;

const OUTER_RADIUS = 3.4;
const OUTER_CIRCUMFERENCE = 2 * Math.PI * OUTER_RADIUS;
const INNER_RADIUS = 1.2;
const INNER_CIRCUMFERENCE = 2 * Math.PI * INNER_RADIUS;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/**
 * Difficulty progress dot, ported from both native clients
 * (`SongScoreProgressDot`): a hollow ring that fills towards the top grade and
 * a centre that becomes solid at the maximum. Without a score only the 30%
 * track ring is drawn.
 */
export function ScoreProgressDot({
  game,
  achievement,
  score,
  color,
  variant = "solid",
  className,
}: {
  game: Game;
  /** maimaid achievement percentage (e.g. 100.5). */
  achievement?: number | null;
  /** chunithm absolute score (e.g. 1_002_500). */
  score?: number | null;
  /** Difficulty accent colour (solid variant). */
  color: string;
  /** WORLD'S END / ULTIMA use their gradient paints instead of the accent colour. */
  variant?: ProgressDotVariant;
  className?: string;
}) {
  const uniqueId = useId().replace(/[^a-zA-Z0-9_-]/gu, "");
  const paint = variant === "solid" ? color : `url(#${variant}-${uniqueId})`;
  const ring =
    game === "maimaid"
      ? clamp01(((achievement ?? 0) - MAIMAID_RING_START) / MAIMAID_RING_SPAN)
      : clamp01(((score ?? 0) - CHUNITHMD_RING_START) / CHUNITHMD_RING_SPAN);
  const dot =
    game === "maimaid"
      ? clamp01((achievement ?? 0) - MAIMAID_RING_END)
      : clamp01(((score ?? 0) - CHUNITHMD_RING_END) / CHUNITHMD_DOT_SPAN);

  return (
    <svg
      viewBox="0 0 8 8"
      className={className ?? "size-2 shrink-0"}
      aria-hidden
      focusable="false"
    >
      {variant === "worlds-end" ? (
        <defs>
          <linearGradient
            id={`worlds-end-${uniqueId}`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            {WORLDS_END_COLORS.map((stop, index) => (
              <stop
                key={stop}
                offset={`${(index / (WORLDS_END_COLORS.length - 1)) * 100}%`}
                stopColor={stop}
              />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      {variant === "ultima" ? (
        <defs>
          <pattern
            id={`ultima-${uniqueId}`}
            width="3"
            height="3"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(135)"
          >
            <rect width="3" height="3" fill={ULTIMA_DARK} />
            <rect width="1.4" height="3" fill={ULTIMA_RED} />
          </pattern>
        </defs>
      ) : null}
      <g transform="rotate(-90 4 4)">
        <circle
          cx="4"
          cy="4"
          r={OUTER_RADIUS}
          fill="none"
          stroke={paint}
          strokeOpacity={0.3}
          strokeWidth={1.2}
        />
        {ring > 0 ? (
          <circle
            cx="4"
            cy="4"
            r={OUTER_RADIUS}
            fill="none"
            stroke={paint}
            strokeWidth={1.2}
            strokeDasharray={`${(ring * OUTER_CIRCUMFERENCE).toFixed(3)} ${OUTER_CIRCUMFERENCE.toFixed(3)}`}
          />
        ) : null}
        {dot > 0 ? (
          <circle
            cx="4"
            cy="4"
            r={INNER_RADIUS}
            fill="none"
            stroke={paint}
            strokeWidth={2.4}
            strokeDasharray={`${(dot * INNER_CIRCUMFERENCE).toFixed(3)} ${INNER_CIRCUMFERENCE.toFixed(3)}`}
          />
        ) : null}
      </g>
    </svg>
  );
}
