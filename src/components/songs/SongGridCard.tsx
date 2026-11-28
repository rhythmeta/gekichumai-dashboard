"use client";

import { LockIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CatalogChart, CatalogSong } from "@/lib/game-catalog";
import type { ChartVisual } from "@/lib/chart-colors";
import { backupChartKey } from "@/lib/backup-snapshot";
import { difficultyDotVariant } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { useBackupData } from "@/store/backup-data";
import { ScoreProgressDot } from "./ScoreProgressDot";
import { MarqueeText } from "./MarqueeText";
import { SongCover } from "./SongCover";

export type DifficultyLookup = {
  label: (value: string) => string;
  color: (value: string) => string | null;
  typeLabel: (value: string) => string;
  /** Full visual (solid colour or WE/ULTIMA gradient) for a chart. */
  visual: (chart: CatalogChart) => ChartVisual;
};

export function chartLevelText(chart: CatalogChart): string {
  if (chart.level) return chart.level;
  if (chart.levelValue !== null) return chart.levelValue.toFixed(1);
  return "-";
}

export function ChartBadge({
  chart,
  songId,
  lookup,
  className,
}: {
  chart: CatalogChart;
  /** Catalog song id, used to look up the signed-in profile's score. */
  songId: string;
  lookup: DifficultyLookup;
  className?: string;
}) {
  const visual = lookup.visual(chart);
  const { game, scoreFor } = useBackupData();
  const score = scoreFor(
    backupChartKey(game, songId, chart.type, chart.difficulty),
  );
  const progress = {
    achievement: score?.achievement ?? null,
    score: score?.score ?? null,
  };
  const dotVariant = difficultyDotVariant(game, chart);
  const titleSuffix = score
    ? game === "maimaid"
      ? ` · ${score.achievement.toFixed(4)}%`
      : ` · ${score.score.toLocaleString("en-US")}`
    : "";
  const isUtage =
    chart.isSpecial && chart.type === "utage" && !visual.background;
  // WE / ULTIMA keep the same badge shape as regular difficulties: a dot,
  // the level text, and a border. When the difficulty is a gradient, the
  // gradient is painted into a 1px border via a padded wrapper; the dot uses
  // the solid accent colour (including ULTIMA's red).
  if (visual.background) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.65rem] leading-none font-medium whitespace-nowrap",
          className,
        )}
        style={{
          // Gradient border + opaque card interior in one element, so the
          // corner radius is identical to every other badge.
          backgroundImage: `linear-gradient(var(--color-card), var(--color-card)), ${visual.background}`,
          backgroundClip: "padding-box, border-box",
          backgroundOrigin: "border-box",
          borderColor: "transparent",
          borderWidth: 1,
        }}
        title={`${lookup.typeLabel(chart.type)} · ${lookup.label(chart.difficulty)}${titleSuffix}`}
      >
        <ScoreProgressDot
          game={game}
          color={visual.color}
          variant={dotVariant}
          {...progress}
        />
        <span className="text-muted-foreground">{chartLevelText(chart)}</span>
      </span>
    );
  }
  if (isUtage) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-pink-500/60 px-1.5 py-0.5 text-[0.65rem] leading-none font-medium whitespace-nowrap text-pink-600 dark:text-pink-400",
          className,
        )}
        title={`${lookup.typeLabel(chart.type)} · ${lookup.label(chart.difficulty)}${titleSuffix}`}
      >
        <span className="font-semibold">{lookup.typeLabel(chart.type)}</span>
        <ScoreProgressDot game={game} color={visual.color} {...progress} />
        <span>{chartLevelText(chart)}</span>
      </span>
    );
  }
  if (chart.isSpecial) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[0.65rem] leading-none font-medium whitespace-nowrap text-muted-foreground",
          className,
        )}
        title={`${lookup.typeLabel(chart.type)} · ${lookup.label(chart.difficulty)}`}
      >
        <span className="font-semibold">{lookup.typeLabel(chart.type)}</span>
        <span>{chartLevelText(chart)}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.65rem] leading-none font-medium whitespace-nowrap",
        className,
      )}
      style={{ borderColor: visual.color }}
      title={`${lookup.typeLabel(chart.type)} · ${lookup.label(chart.difficulty)}${titleSuffix}`}
      aria-label={`${lookup.label(chart.difficulty)} ${chartLevelText(chart)}`}
    >
      <ScoreProgressDot
        game={game}
        color={visual.color}
        variant={dotVariant}
        {...progress}
      />
      <span className="text-muted-foreground">{chartLevelText(chart)}</span>
    </span>
  );
}

export function SongGridCard({
  song,
  charts,
  compact,
  lookup,
  versionLabel,
  onSelect,
}: {
  song: CatalogSong;
  charts: CatalogChart[];
  compact: boolean;
  lookup: DifficultyLookup;
  versionLabel: (version: string | null) => string | null;
  onSelect: (song: CatalogSong) => void;
}) {
  const version = versionLabel(song.version);
  const chartBadges = (
    <div
      className={cn(
        "flex flex-wrap gap-1",
        compact ? "absolute inset-x-1.5 bottom-1.5" : "mt-0.5",
      )}
    >
      {charts.slice(0, 6).map((chart) => (
        <ChartBadge
          key={chart.id}
          chart={chart}
          songId={song.id}
          lookup={lookup}
          className={compact ? "bg-card shadow-sm" : undefined}
        />
      ))}
    </div>
  );
  return (
    <button
      type="button"
      onClick={() => onSelect(song)}
      className="group/card flex min-w-0 flex-col overflow-hidden rounded-xl bg-card text-left ring-1 ring-foreground/10 transition hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="relative">
        <SongCover
          src={song.coverUrl}
          alt={song.title}
          className="aspect-square w-full"
          iconClassName="size-8"
        />
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          {song.isNew ? (
            <Badge variant="default" className="h-4 px-1 text-[0.6rem]">
              <SparklesIcon />
              NEW
            </Badge>
          ) : null}
          {song.isLocked ? (
            <Badge variant="secondary" className="h-4 px-1 text-[0.6rem]">
              <LockIcon />
            </Badge>
          ) : null}
        </div>
        {compact && chartBadges}
      </div>
      <div className="flex min-w-0 flex-col gap-1 p-2.5">
        <MarqueeText
          text={song.title}
          className="text-sm font-medium"
          hoverClassName="group-hover/card:animate-[marquee-scroll_7s_linear_infinite]"
        />
        <MarqueeText
          text={song.artist}
          className="text-xs text-muted-foreground"
          hoverClassName="group-hover/card:animate-[marquee-scroll_7s_linear_infinite]"
        />
        <div className="flex min-w-0 items-center gap-1.5 text-[0.7rem] text-muted-foreground">
          {version ? (
            <Badge
              variant="outline"
              className="h-4 max-w-[70%] truncate px-1 text-[0.6rem]"
              title={song.version ?? undefined}
            >
              {version}
            </Badge>
          ) : null}
          <span className="shrink-0 tabular-nums">BPM {song.bpm ?? "-"}</span>
        </div>
        {!compact && chartBadges}
      </div>
    </button>
  );
}
