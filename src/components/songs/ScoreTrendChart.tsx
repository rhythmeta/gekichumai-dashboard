"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TrendDetail = { label: string; value: string };

export type TrendPoint = {
  value: number;
  /** Unix ms, 0 when the client did not record a timestamp. */
  at: number;
  /** Extra tooltip rows (rank, lamps, …) shown under the series values. */
  details?: TrendDetail[];
};

export type TrendSeries = {
  label: string;
  /** Samples oldest → newest. */
  points: TrendPoint[];
  format: (value: number) => string;
  tone: TrendTone;
};

const TONE_COLORS = {
  sky: "#0ea5e9",
  amber: "#f59e0b",
  emerald: "#10b981",
  violet: "#8b5cf6",
} as const;

export type TrendTone = keyof typeof TONE_COLORS;

const CHART_WIDTH = 240;
const CHART_HEIGHT = 64;
const PAD_Y = 6;
const DISPLAY_RANGE_QUANTILE = 0.1;

type Geometry = {
  minimum: number;
  maximum: number;
  line: string;
  points: Array<{ percent: number; y: number; x: number; point: TrendPoint }>;
};

function quantile(sortedValues: number[], ratio: number): number {
  const position = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const fraction = position - lower;
  return (
    sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction
  );
}

function buildGeometry(points: TrendPoint[]): Geometry | null {
  if (points.length === 0) return null;
  const values = points.map((point) => point.value);
  const actualMinimum = Math.min(...values);
  const actualMaximum = Math.max(...values);
  const sortedValues = [...values].sort((left, right) => left - right);
  // Keep isolated low/high samples from flattening the rest of the trend.
  // The raw value remains available in the tooltip while its marker is
  // clamped to the displayed range.
  const trimmedMinimum = quantile(sortedValues, DISPLAY_RANGE_QUANTILE);
  const trimmedMaximum = quantile(sortedValues, 1 - DISPLAY_RANGE_QUANTILE);
  const useTrimmedRange = trimmedMaximum > trimmedMinimum;
  const minimum = useTrimmedRange ? trimmedMinimum : actualMinimum;
  const maximum = useTrimmedRange ? trimmedMaximum : actualMaximum;
  const span = maximum - minimum || 1;
  const step = points.length > 1 ? (CHART_WIDTH - 2) / (points.length - 1) : 0;
  const x = (index: number) => 1 + index * step;
  const y = (value: number) => {
    const displayValue = Math.min(Math.max(value, minimum), maximum);
    return (
      CHART_HEIGHT -
      PAD_Y -
      ((displayValue - minimum) / span) * (CHART_HEIGHT - PAD_Y * 2)
    );
  };
  const drawn = points.map((point, index) => ({
    x: x(index),
    y: y(point.value),
    percent: points.length > 1 ? (index / (points.length - 1)) * 100 : 50,
    point,
  }));
  const line = drawn
    .map(
      (entry, index) =>
        `${index === 0 ? "M" : "L"}${entry.x.toFixed(2)},${entry.y.toFixed(2)}`,
    )
    .join(" ");
  return { minimum, maximum, line, points: drawn };
}

function formatAxisDate(at: number): string {
  if (!(at > 0)) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

function formatTooltipDate(at: number): string {
  if (!(at > 0)) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Two series on one time axis: the left vertical axis belongs to `primary`
 * (achievement / score) and the right one to `secondary` (DX score / OVER
 * POWER). Each series is scaled independently, which keeps both shapes legible
 * when their magnitudes differ by orders of magnitude. Every sample gets its
 * own date label, and hovering a point reveals the full record.
 */
export function ScoreTrendChart({
  primary,
  secondary,
  emptyLabel,
  className,
  renderTooltip,
}: {
  primary: TrendSeries;
  secondary: TrendSeries | null;
  emptyLabel: string;
  className?: string;
  /** Custom tooltip body for the sample at `index` (oldest = 0). */
  renderTooltip?: (index: number) => ReactNode;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const primaryGeometry = useMemo(
    () => buildGeometry(primary.points),
    [primary.points],
  );
  const secondaryGeometry = useMemo(
    () => (secondary ? buildGeometry(secondary.points) : null),
    [secondary],
  );

  const latest = (series: TrendSeries) =>
    series.points.length > 0
      ? series.format(series.points[series.points.length - 1].value)
      : "-";

  const seriesList = [primary, secondary].filter(
    (series): series is TrendSeries => Boolean(series),
  );
  const activeIndex =
    hovered !== null && hovered < primary.points.length ? hovered : null;
  const activePoint = activeIndex !== null ? primary.points[activeIndex] : null;
  const activePercent =
    primaryGeometry && activeIndex !== null
      ? primaryGeometry.points[activeIndex]?.percent
      : null;
  // Keep the tooltip inside the plot column instead of spilling over the axes.
  const tooltipPercent =
    activePercent === null ? null : Math.min(Math.max(activePercent, 16), 84);

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg bg-card px-2.5 py-2 ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {seriesList.map((series) => (
          <span
            key={series.label}
            className="inline-flex items-baseline gap-1.5"
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 translate-y-[-1px] rounded-full"
              style={{ backgroundColor: TONE_COLORS[series.tone] }}
            />
            <span className="text-[0.65rem] text-muted-foreground">
              {series.label}
            </span>
            <span className="text-xs leading-none font-semibold tabular-nums">
              {latest(series)}
            </span>
          </span>
        ))}
      </div>

      {primaryGeometry && primary.points.length > 1 ? (
        <>
          <div className="flex items-stretch gap-1.5">
            <div className="flex w-11 shrink-0 flex-col justify-between overflow-hidden text-right text-[0.55rem] text-muted-foreground tabular-nums">
              <span>{primary.format(primaryGeometry.maximum)}</span>
              <span>{primary.format(primaryGeometry.minimum)}</span>
            </div>

            <div
              className="relative min-w-0 flex-1"
              onMouseLeave={() => setHovered(null)}
            >
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                preserveAspectRatio="none"
                className="h-16 w-full"
                role="img"
                aria-label={seriesList
                  .map(
                    (series) =>
                      `${series.label}: ${series.points
                        .map((point) => series.format(point.value))
                        .join(", ")}`,
                  )
                  .join("; ")}
              >
                {[0.5, 0].map((ratio) => (
                  <line
                    key={ratio}
                    x1={0}
                    x2={CHART_WIDTH}
                    y1={PAD_Y + ratio * (CHART_HEIGHT - PAD_Y * 2)}
                    y2={PAD_Y + ratio * (CHART_HEIGHT - PAD_Y * 2)}
                    stroke="currentColor"
                    strokeWidth={0.5}
                    className="text-foreground/10"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path
                  d={primaryGeometry.line}
                  fill="none"
                  stroke={TONE_COLORS[primary.tone]}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {secondaryGeometry && secondary ? (
                  <path
                    d={secondaryGeometry.line}
                    fill="none"
                    stroke={TONE_COLORS[secondary.tone]}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="3 2"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {primaryGeometry.points.map((entry, index) => (
                  <circle
                    key={`p-${entry.point.at}-${index}`}
                    cx={entry.x}
                    cy={entry.y}
                    r={activeIndex === index ? 2.6 : 1.6}
                    fill={TONE_COLORS[primary.tone]}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(index)}
                  />
                ))}
                {secondaryGeometry && secondary
                  ? secondaryGeometry.points.map((entry, index) => (
                      <circle
                        key={`s-${entry.point.at}-${index}`}
                        cx={entry.x}
                        cy={entry.y}
                        r={activeIndex === index ? 2.6 : 1.6}
                        fill={TONE_COLORS[secondary.tone]}
                        className="cursor-pointer"
                        onMouseEnter={() => setHovered(index)}
                      />
                    ))
                  : null}
              </svg>

              {activePoint && tooltipPercent !== null ? (
                <div
                  className="pointer-events-none absolute top-0 z-20 w-max max-w-[16rem] -translate-x-1/2 rounded-md bg-popover px-2 py-1.5 text-[0.65rem] leading-tight shadow-md ring-1 ring-foreground/10"
                  style={{ left: `${tooltipPercent}%` }}
                >
                  <p className="font-medium tabular-nums">
                    {formatTooltipDate(activePoint.at)}
                  </p>
                  {renderTooltip ? renderTooltip(activeIndex ?? 0) : null}
                  {!renderTooltip &&
                    seriesList.map((series) => {
                      const point = series.points[activeIndex ?? 0];
                      if (!point) return null;
                      return (
                        <p
                          key={series.label}
                          className="flex items-baseline gap-1.5 tabular-nums"
                        >
                          <span
                            aria-hidden
                            className="size-1.5 shrink-0 translate-y-[-1px] rounded-full"
                            style={{
                              backgroundColor: TONE_COLORS[series.tone],
                            }}
                          />
                          <span className="text-muted-foreground">
                            {series.label}
                          </span>
                          <span className="font-semibold">
                            {series.format(point.value)}
                          </span>
                        </p>
                      );
                    })}
                  {!renderTooltip &&
                    activePoint.details?.map((detail) => (
                      <p
                        key={detail.label}
                        className="flex items-baseline gap-1.5"
                      >
                        <span className="text-muted-foreground">
                          {detail.label}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {detail.value}
                        </span>
                      </p>
                    ))}
                </div>
              ) : null}
            </div>

            <div className="flex w-12 shrink-0 flex-col justify-between overflow-hidden text-[0.55rem] text-muted-foreground tabular-nums">
              {secondaryGeometry && secondary ? (
                <>
                  <span>{secondary.format(secondaryGeometry.maximum)}</span>
                  <span>{secondary.format(secondaryGeometry.minimum)}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex gap-1.5">
            <span className="w-11 shrink-0" />
            <div className="relative h-3 min-w-0 flex-1">
              {primaryGeometry.points.map((entry, index) => (
                <span
                  key={`d-${entry.point.at}-${index}`}
                  className={cn(
                    "absolute top-0 -translate-x-1/2 text-[0.55rem] whitespace-nowrap tabular-nums",
                    activeIndex === index
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                  style={{ left: `${entry.percent}%` }}
                >
                  {formatAxisDate(entry.point.at)}
                </span>
              ))}
            </div>
            <span className="w-12 shrink-0" />
          </div>
        </>
      ) : (
        <p className="py-4 text-[0.65rem] text-muted-foreground">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}
