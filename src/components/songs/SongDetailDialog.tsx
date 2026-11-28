"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  LockIcon,
  MusicIcon,
  SparklesIcon,
} from "lucide-react";
import type { Game, RequestFn } from "@/App";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backupChartKey } from "@/lib/backup-snapshot";
import {
  difficultyDotVariant,
  isWorldsEndChart,
  type ChartVisual,
} from "@/lib/chart-colors";
import type { CatalogChart, CatalogSong } from "@/lib/game-catalog";
import {
  calculateTolerance,
  MAX_TARGET,
  RANK_PRESETS,
  rankForTarget,
} from "@/lib/score-tolerance";
import {
  chartConstant,
  chartRating,
  chunithmdOverPower,
  displayFullCombo,
} from "@/lib/song-rating";
import {
  readSongDetailPrefs,
  writeSongDetailPrefs,
  type SongDetailPrefs,
} from "@/lib/song-detail-prefs";
import {
  communityAliasesForSong,
  loadCommunityAliases,
} from "@/lib/community-aliases";
import { cn } from "@/lib/utils";
import { useBackupData, type BackupPlayView } from "@/store/backup-data";
import { chartLevelText, type DifficultyLookup } from "./SongGridCard";
import { ScoreProgressDot } from "./ScoreProgressDot";
import { ScoreTrendChart, type TrendSeries } from "./ScoreTrendChart";
import { SongCover } from "./SongCover";

const EMPTY_CHARTS: CatalogChart[] = [];

type NoteField =
  "tap" | "hold" | "slide" | "touch" | "break" | "air" | "flick" | "total";

const NOTE_LABEL_KEYS: Record<NoteField, string> = {
  tap: "noteTap",
  hold: "noteHold",
  slide: "noteSlide",
  touch: "noteTouch",
  break: "noteBreak",
  air: "noteAir",
  flick: "noteFlick",
  total: "noteTotal",
};

const NOTE_COLORS: Partial<Record<NoteField, string>> = {
  tap: "#0ea5e9",
  hold: "#10b981",
  slide: "#f59e0b",
  touch: "#8b5cf6",
  break: "#f43f5e",
  air: "#22d3ee",
  flick: "#facc15",
};

const GAME_NOTE_FIELDS: Record<Game, NoteField[]> = {
  maimaid: ["tap", "hold", "slide", "touch", "break", "total"],
  chunithmd: ["tap", "hold", "slide", "air", "flick", "total"],
};

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("en-US");
}

/**
 * Client DX-star thresholds: the ratio of earned to maximum DX score decides
 * how many of the five stars are lit.
 */
const DX_STAR_THRESHOLDS: ReadonlyArray<readonly [number, number]> = [
  [0.97, 5],
  [0.95, 4],
  [0.93, 3],
  [0.9, 2],
  [0.85, 1],
];

function dxStarCount(dxScore: number, maxDxScore: number): number {
  if (!(maxDxScore > 0)) return 0;
  const ratio = dxScore / maxDxScore;
  for (const [threshold, stars] of DX_STAR_THRESHOLDS) {
    if (ratio >= threshold) return stars;
  }
  return 0;
}

/** maimaid FULL COMBO lamps, normalised to the labels shown in-game. */
const MAIMAID_FC_LAMPS: Record<string, string> = {
  fc: "FC",
  "fc+": "FC+",
  // The native clients also serialise the "+" variant as `fcp`.
  fcp: "FC+",
  ap: "AP",
  app: "AP",
};

/** maimaid FULL SYNC lamps (also used for the CHUNITHM chain field). */
const MAIMAID_FS_LAMPS: Record<string, string> = {
  fs: "FS",
  "fs+": "FS+",
  fsp: "FS+",
  fsd: "FSD",
};

function lampLabel(
  value: string | null,
  labels: Record<string, string>,
): string | null {
  return labels[(value ?? "").trim().toLowerCase()] ?? null;
}

/** `achievedAt` is a millisecond timestamp; 0 means the client did not record one. */
function formatAchievedAt(achievedAt: number): string | null {
  if (!(achievedAt > 0)) return null;
  const date = new Date(achievedAt);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

/**
 * Aliases approved through Rhythmeta's community board. They are drawn with a
 * dashed outline so they read differently from the LXNS aliases that ship with
 * the static catalog bundle.
 */
function CommunityAliasBadges({
  game,
  songId,
  knownAliases,
  request,
}: {
  game: Game;
  songId: string;
  knownAliases: string[];
  request: RequestFn;
}) {
  const { t } = useTranslation("songs");
  const [aliases, setAliases] = useState<string[] | null>(null);
  const knownKey = knownAliases.join("\u0001");

  useEffect(() => {
    let cancelled = false;
    loadCommunityAliases(request, game)
      .then((rows) => {
        if (cancelled) return;
        setAliases(
          communityAliasesForSong(
            rows,
            songId,
            knownKey ? knownKey.split("\u0001") : [],
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setAliases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [game, knownKey, request, songId]);

  if (!aliases) return null;
  if (aliases.length === 0) {
    return knownAliases.length === 0 ? (
      <p className="text-xs text-muted-foreground">{t("detailNoAliases")}</p>
    ) : null;
  }
  return (
    <>
      {aliases.map((alias) => (
        <Badge
          key={alias}
          variant="outline"
          title={t("aliasCommunitySource")}
          className="max-w-full truncate border-dashed"
        >
          {alias}
        </Badge>
      ))}
    </>
  );
}

/** Daily alias submission limit enforced by the backend. */
const ALIAS_DAILY_LIMIT = 5;

type MyAliasCandidate = {
  id: string;
  aliasText: string;
  status: "voting" | "approved" | "rejected";
  rejectionSource?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

const ALIAS_STATUS_TONES: Record<
  MyAliasCandidate["status"],
  { tone: TintTone; labelKey: string }
> = {
  voting: { tone: "amber", labelKey: "aliasStatusVoting" },
  approved: { tone: "emerald", labelKey: "aliasStatusApproved" },
  rejected: { tone: "rose", labelKey: "aliasStatusRejected" },
};

/**
 * Community alias tools for the song on screen: the daily quota, the signed-in
 * user's own submissions with their review status, and the submission form.
 * Living in the detail dialog means the song never has to be picked twice.
 */
function AliasSection({
  game,
  songId,
  request,
}: {
  game: Game;
  songId: string;
  request: RequestFn;
}) {
  const { t } = useTranslation("songs");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dailyCount, setDailyCount] = useState<number | null>(null);
  const [myRows, setMyRows] = useState<MyAliasCandidate[]>([]);

  useEffect(() => {
    setText("");
  }, [songId]);

  const load = useCallback(async () => {
    try {
      const [counter, mine] = await Promise.all([
        request<{ count: number }>(
          `${game}/v1/community/candidates:dailyCount`,
        ),
        request<{ rows: MyAliasCandidate[] }>(
          `${game}/v1/community/candidates:my?songIdentifier=${encodeURIComponent(songId)}`,
        ),
      ]);
      setDailyCount(typeof counter?.count === "number" ? counter.count : null);
      setMyRows(Array.isArray(mine?.rows) ? mine.rows : []);
    } catch {
      // Quota and history are informational; the form still works without them.
      setMyRows([]);
    }
  }, [game, request, songId]);

  useEffect(() => {
    void load();
  }, [load]);

  const quotaReached = dailyCount !== null && dailyCount >= ALIAS_DAILY_LIMIT;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const aliasText = text.trim();
    if (!aliasText || submitting || quotaReached) return;
    setSubmitting(true);
    try {
      const result = await request<{
        status: string;
        message?: string;
        quotaRemaining?: number;
      }>(`${game}/v1/community/candidates`, {
        method: "POST",
        body: { songIdentifier: songId, aliasText },
      });
      if (
        result.status === "rejected_duplicate" ||
        result.status === "quota_exceeded"
      ) {
        throw new Error(result.message ?? t("aliasSubmitFailed"));
      }
      setText("");
      toast.success(t("aliasSubmitSuccess"));
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <form
        onSubmit={submit}
        className="flex flex-wrap items-center gap-2"
        aria-label={t("aliasSubmitTitle")}
      >
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("aliasSubmitPlaceholder")}
          aria-label={t("aliasSubmitPlaceholder")}
          maxLength={64}
          className="h-8 w-full text-xs sm:w-56"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={submitting || text.trim().length === 0 || quotaReached}
        >
          {t("aliasSubmitAction")}
        </Button>
        {dailyCount !== null ? (
          <span
            className={cn(
              "text-[0.7rem] tabular-nums",
              quotaReached
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {t("aliasSubmitQuota", {
              count: dailyCount,
              limit: ALIAS_DAILY_LIMIT,
            })}
          </span>
        ) : null}
      </form>

      {myRows.length > 0 ? (
        <ul
          className="flex flex-col gap-1"
          aria-label={t("aliasMySubmissions")}
        >
          <li className="text-[0.65rem] text-muted-foreground">
            {t("aliasMySubmissions")}
          </li>
          {myRows.map((row) => {
            const status =
              ALIAS_STATUS_TONES[row.status] ?? ALIAS_STATUS_TONES.voting;
            const at = formatAliasDate(row.createdAt ?? row.updatedAt);
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-1.5 text-xs"
              >
                <span className="min-w-0 truncate">{row.aliasText}</span>
                <TintBadge tone={status.tone}>{t(status.labelKey)}</TintBadge>
                {at ? (
                  <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                    {at}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function formatAliasDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

/** Union of regions where at least one chart is playable (song-level metadata). */ /** Union of regions where at least one chart is playable (song-level metadata). */
function songRegions(charts: CatalogChart[]): string[] {
  const regions: string[] = [];
  if (charts.some((chart) => chart.regions.jp)) regions.push("JP");
  if (charts.some((chart) => chart.regions.intl)) regions.push("INTL");
  if (charts.some((chart) => chart.regions.usa)) regions.push("USA");
  if (charts.some((chart) => chart.regions.cn)) regions.push("CN");
  return regions;
}

/**
 * Paints a chart's difficulty colour — or the WE/ULTIMA gradient — into the
 * border while keeping the interior opaque, so radius and layout stay identical
 * to ordinary cards. `tint` mixes a faint amount of the difficulty colour into
 * the interior; that is what makes the selected difficulty read at a glance.
 */
function difficultySurface(
  visual: ChartVisual,
  {
    borderWidth = 1,
    tint = null,
  }: { borderWidth?: number; tint?: number | null } = {},
): CSSProperties {
  const interior =
    tint === null
      ? "var(--color-card)"
      : `color-mix(in oklab, ${visual.color} ${tint}%, var(--color-card))`;
  const interiorLayer = `linear-gradient(${interior}, ${interior})`;
  const borderLayer =
    visual.background ?? `linear-gradient(${visual.color}, ${visual.color})`;
  return {
    borderColor: "transparent",
    borderWidth,
    backgroundImage: `${interiorLayer}, ${borderLayer}`,
    backgroundClip: "padding-box, border-box",
    backgroundOrigin: "border-box",
  };
}

/** Solid difficulty dot, or the gradient itself for WE/ULTIMA. */
function difficultyDotStyle(visual: ChartVisual): CSSProperties {
  return visual.dotBackground
    ? { background: visual.dotBackground }
    : { backgroundColor: visual.color };
}

/**
 * 定数 (constant) when the catalog has one, otherwise the printed level. WORLD'S
 * END charts have no constant — they show their star rating (`☆☆☆☆`) instead.
 */
function chartConstantText(chart: CatalogChart): string {
  if (chart.internalLevel) return chart.internalLevel;
  if (chart.internalLevelValue !== null && chart.internalLevelValue > 0) {
    return chart.internalLevelValue.toFixed(1);
  }
  return chartLevelText(chart);
}

const JUDGEMENT_LABELS: Record<Game, [string, string, string]> = {
  maimaid: ["toleranceGreat", "toleranceGood", "toleranceMiss"],
  chunithmd: ["toleranceJustice", "toleranceAttack", "toleranceMiss"],
};

/**
 * One difficulty of the active chart type, rendered as a badge that is a little
 * bigger than the ones in the song grid. The whole badge is the selector, so the
 * chart switcher lives among the song metadata instead of in its own dropdown.
 */
function DifficultyChoice({
  chart,
  songId,
  game,
  selected,
  onSelect,
  lookup,
}: {
  chart: CatalogChart;
  songId: string;
  game: Game;
  selected: boolean;
  onSelect: () => void;
  lookup: DifficultyLookup;
}) {
  const visual = lookup.visual(chart);
  const { scoreFor } = useBackupData();
  const score = scoreFor(
    backupChartKey(game, songId, chart.type, chart.difficulty),
  );
  const scoreLabel = score
    ? game === "maimaid"
      ? ` · ${score.achievement.toFixed(4)}%`
      : ` · ${score.score.toLocaleString("en-US")}`
    : "";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      title={`${lookup.typeLabel(chart.type)} · ${lookup.label(chart.difficulty)}${scoreLabel}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 leading-none transition focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "shadow-xs" : "hover:ring-2 hover:ring-foreground/10",
      )}
      style={difficultySurface(visual, {
        borderWidth: selected ? 2 : 1,
        tint: selected ? 16 : null,
      })}
    >
      <ScoreProgressDot
        game={game}
        color={visual.color}
        variant={difficultyDotVariant(game, chart)}
        achievement={score?.achievement ?? null}
        score={score?.score ?? null}
      />
      <span
        className={cn(
          "text-xs font-medium",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {lookup.label(chart.difficulty)}
      </span>
      <span
        className={cn(
          "text-[0.8rem] font-semibold tabular-nums",
          selected ? "text-foreground" : "text-foreground/70",
        )}
      >
        {chartLevelText(chart)}
      </span>
    </button>
  );
}

/**
 * Everything below the song metadata: the chart itself and the tolerance
 * calculator share one difficulty-coloured card, so the difficulty that the
 * numbers belong to is always visible around them.
 */
function ChartPanel({
  songId,
  chart,
  game,
  lookup,
  noteFields,
  target,
  onTargetChange,
  versionDates,
}: {
  /** Catalog song id, needed to look up the personal score of this chart. */
  songId: string;
  chart: CatalogChart;
  game: Game;
  lookup: DifficultyLookup;
  noteFields: NoteField[];
  target: number;
  onTargetChange: (target: number) => void;
  versionDates?: Map<string, string | null>;
}) {
  const { t } = useTranslation("songs");
  const visual = lookup.visual(chart);
  const noteEntries = noteFields
    .filter((field) => field !== "total")
    // Chunithm BASIC/ADVANCED/EXPERT charts have no FLICK notes;
    // a null count means the judgement does not exist on this chart.
    .filter((field) => chart.noteCounts[field] !== null)
    .map((field) => ({
      field,
      value: chart.noteCounts[field] ?? 0,
      color: NOTE_COLORS[field] ?? "#94a3b8",
    }));
  const noteSum = noteEntries.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={difficultySurface(visual, { borderWidth: 2, tint: 6 })}
    >
      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={difficultyDotStyle(visual)}
          />
          <span className="text-base font-semibold">
            {lookup.label(chart.difficulty)}
          </span>
          <span className="text-2xl leading-none font-semibold tabular-nums">
            {chartConstantText(chart)}
          </span>
          {chart.isSpecial && !visual.background && chart.type !== "utage" ? (
            <Badge variant="outline" className="h-4 px-1 text-[0.6rem]">
              {t("detailSpecial")}
            </Badge>
          ) : null}
          {chart.noteCounts.total !== null ? (
            <span className="ml-auto inline-flex items-baseline gap-1 text-[0.65rem] text-muted-foreground">
              {t("noteTotal")}
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {formatNumber(chart.noteCounts.total)}
              </span>
            </span>
          ) : null}
        </div>

        {noteEntries.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={noteEntries
                .map(
                  (entry) =>
                    `${t(NOTE_LABEL_KEYS[entry.field])} ${entry.value}`,
                )
                .join(", ")}
            >
              {noteSum > 0
                ? noteEntries
                    .filter((entry) => entry.value > 0)
                    .map((entry) => (
                      <span
                        key={entry.field}
                        className="h-full"
                        style={{
                          width: `${(entry.value / noteSum) * 100}%`,
                          backgroundColor: entry.color,
                        }}
                        title={`${t(NOTE_LABEL_KEYS[entry.field])} ${entry.value}`}
                      />
                    ))
                : null}
            </div>
            <div className="flex items-center gap-x-2.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {noteEntries.map((entry) => (
                <span
                  key={entry.field}
                  className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {t(NOTE_LABEL_KEYS[entry.field])}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatNumber(chart.noteCounts[entry.field])}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("chartDesigner")}:{" "}
            <span className="font-medium text-foreground">
              {chart.noteDesigner ?? "-"}
            </span>
          </span>
          {chart.fitDifficulty !== null ? (
            <span>
              {t("fitDifficulty")}{" "}
              <span className="font-medium text-foreground tabular-nums">
                {chart.fitDifficulty.toFixed(2)}
              </span>
              {chart.fitSamples !== null ? (
                <span className="ml-1">
                  ({t("fitSamples", { amount: chart.fitSamples })})
                </span>
              ) : null}
            </span>
          ) : null}
          {chart.fitLevel && chart.fitLevel !== chart.level ? (
            <span className="text-amber-600 dark:text-amber-400">
              {t("levelChange", {
                from: chart.fitLevel,
                to: chart.level || "-",
              })}
            </span>
          ) : null}
        </div>
      </div>

      <MyScoreSection chart={chart} game={game} songId={songId} />

      <ChartCalculator
        chart={chart}
        game={game}
        target={target}
        onTargetChange={onTargetChange}
        hasNoteStats={noteEntries.length > 0}
        versionDates={versionDates}
      />
    </div>
  );
}

/** Soft tinted badge used by the personal-score row. */
const TINT_TONES = {
  amber: "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  emerald:
    "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  sky: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  violet:
    "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  rose: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  slate: "bg-foreground/6 text-muted-foreground ring-foreground/10",
} as const;

type TintTone = keyof typeof TINT_TONES;

function TintBadge({
  tone,
  title,
  children,
}: {
  tone: TintTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-2 text-[0.7rem] leading-none font-semibold whitespace-nowrap ring-1",
        TINT_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Rank pills reuse the tint vocabulary so they match the other score badges. */
function rankTone(rank: string | null | undefined): TintTone {
  const value = (rank ?? "").trim().toUpperCase();
  if (value.startsWith("SSS")) return "amber";
  if (value.startsWith("SS")) return "violet";
  if (value.startsWith("S")) return "sky";
  return "slate";
}

/** Lamp → tint, keyed by the normalised label shown in-game. */
const LAMP_TONES: Record<string, TintTone> = {
  FC: "emerald",
  "FC+": "amber",
  AP: "violet",
  FS: "sky",
  "FS+": "amber",
  FSD: "rose",
  AJ: "amber",
  AJC: "violet",
};

/** Maximum CHUNITHM score, used for the theoretical OVER POWER. */
const CHUNITHMD_MAX_SCORE = 1_010_000;

/**
 * The signed-in user's personal result for the chart on screen, decoded from
 * the latest backup. It sits inside the difficulty card, full-bleed between the
 * chart metadata and the tolerance calculator, so all three bands share the
 * same left edge.
 *
 * The store returns an empty value when no backup provider is mounted, so this
 * never throws outside the dashboard shell.
 */
function MyScoreSection({
  chart,
  game,
  songId,
}: {
  chart: CatalogChart;
  game: Game;
  songId: string;
}) {
  const { t } = useTranslation("songs");
  const { status, scoreFor, playsFor } = useBackupData();
  // Loading — and the "no backup" states — render nothing: a placeholder would
  // only make the card jump once the personal data arrives.
  if (status !== "ready") return null;

  const chartKey = backupChartKey(game, songId, chart.type, chart.difficulty);
  const score = scoreFor(chartKey);
  const isMaimai = game === "maimaid";

  if (!score) {
    return (
      <>
        <Separator />
        <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
          {t("myScoreEmpty")}
        </p>
      </>
    );
  }

  // WORLD'S END charts have no constant, so rating and OP stay unknown.
  const constant = isWorldsEndChart(chart)
    ? null
    : chartConstant(
        chart.internalLevel,
        chart.internalLevelValue,
        chart.levelValue,
      );
  const rating =
    constant === null
      ? null
      : isMaimai
        ? chartRating("maimaid", constant, score.achievement)
        : chartRating("chunithmd", constant, score.score);
  const overpower =
    constant === null
      ? null
      : chunithmdOverPower(constant, score.score, score.fc);
  const maxOverpower =
    constant === null
      ? null
      : chunithmdOverPower(constant, CHUNITHMD_MAX_SCORE, "AJC");
  const maxDxScore = (chart.noteCounts.total ?? 0) * 3;
  const stars = dxStarCount(score.dxScore, maxDxScore);
  const achievedLabel = formatAchievedAt(score.achievedAt);

  const lampsFor = (
    play: Pick<BackupPlayView, "fc" | "fs">,
  ): Array<{ label: string; tone: TintTone }> => {
    const rows: Array<{ label: string; tone: TintTone }> = [];
    if (isMaimai) {
      const fc = lampLabel(play.fc, MAIMAID_FC_LAMPS);
      const fs = lampLabel(play.fs, MAIMAID_FS_LAMPS);
      if (fc) rows.push({ label: fc, tone: LAMP_TONES[fc] ?? "slate" });
      if (fs) rows.push({ label: fs, tone: LAMP_TONES[fs] ?? "slate" });
    } else {
      // CHUNITHM has no FSD: the only lamps are FC / AJ / AJC, and the chain
      // field uses the same vocabulary.
      const combo = displayFullCombo(play.fc);
      const chain = displayFullCombo(play.fs);
      if (combo)
        rows.push({ label: combo, tone: LAMP_TONES[combo] ?? "slate" });
      if (chain && chain !== combo) {
        rows.push({ label: chain, tone: LAMP_TONES[chain] ?? "slate" });
      }
    }
    return rows;
  };
  const lamps = lampsFor(score);
  const ratingFor = (play: Pick<BackupPlayView, "achievement" | "score">) =>
    constant === null
      ? null
      : isMaimai
        ? chartRating("maimaid", constant, play.achievement)
        : chartRating("chunithmd", constant, play.score);
  const overPowerFor = (
    play: Pick<BackupPlayView, "achievement" | "score" | "fc">,
  ) =>
    constant === null
      ? null
      : chunithmdOverPower(constant, play.score, play.fc);

  // Plays arrive newest first; the charts read left → right, oldest first.
  const chronological = [...playsFor(chartKey)].reverse();
  const trendPoints = (pick: (play: BackupPlayView) => number) =>
    chronological.map((play) => ({ value: pick(play), at: play.achievedAt }));
  const formatScore = (value: number) =>
    Math.round(value).toLocaleString("en-US");
  const primarySeries: TrendSeries = isMaimai
    ? {
        label: t("scoreAchievement"),
        points: trendPoints((play) => play.achievement),
        format: (value: number) => `${value.toFixed(2)}%`,
        tone: "sky",
      }
    : {
        label: t("scoreScore"),
        points: trendPoints((play) => play.score),
        format: formatScore,
        tone: "emerald",
      };
  const secondarySeries: TrendSeries | null = isMaimai
    ? {
        label: t("scoreDxScore"),
        points: trendPoints((play) => play.dxScore),
        format: formatScore,
        tone: "amber",
      }
    : constant === null
      ? null
      : {
          label: t("scoreOp"),
          points: trendPoints((play) =>
            chunithmdOverPower(constant, play.score, play.fc),
          ),
          format: (value: number) => value.toFixed(2),
          tone: "violet",
        };

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("myScoreTitle")}
          </p>
          {achievedLabel ? (
            <p className="text-[0.7rem] text-muted-foreground tabular-nums">
              {t("scoreAchievedAt")} {achievedLabel}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <span
            className="mr-1 text-2xl leading-none font-semibold tabular-nums"
            title={isMaimai ? t("scoreAchievement") : t("scoreScore")}
          >
            {isMaimai
              ? `${score.achievement.toFixed(4)}%`
              : formatScore(score.score)}
          </span>

          {score.rank ? (
            <TintBadge tone={rankTone(score.rank)} title={t("scoreRank")}>
              <span className="tabular-nums">{score.rank}</span>
            </TintBadge>
          ) : null}

          {isMaimai ? (
            <TintBadge
              tone={stars > 0 ? "amber" : "slate"}
              title={`${t("scoreDxStar")} · ${t("scoreDxScore")} ${formatScore(score.dxScore)} / ${formatScore(maxDxScore)}`}
            >
              <span className="tracking-tight tabular-nums">
                {stars > 0 ? "★".repeat(stars) : "★ 0"}
              </span>
            </TintBadge>
          ) : (
            <TintBadge
              tone="violet"
              title={`${t("scoreOp")} / ${t("scoreOpMaximum")}`}
            >
              {t("scoreOp")}
              <span className="tabular-nums">
                {overpower !== null ? overpower.toFixed(2) : "-"}
              </span>
              <span className="font-medium opacity-60 tabular-nums">
                / {maxOverpower !== null ? maxOverpower.toFixed(2) : "-"}
              </span>
            </TintBadge>
          )}

          {lamps.map((lamp) => (
            <TintBadge key={lamp.label} tone={lamp.tone}>
              {lamp.label}
            </TintBadge>
          ))}

          <TintBadge tone="slate" title={t("ratingResult")}>
            <span className="font-medium opacity-70">{t("ratingResult")}</span>
            <span className="tabular-nums">
              {rating === null
                ? "-"
                : isMaimai
                  ? rating.toLocaleString("en-US")
                  : rating.toFixed(2)}
            </span>
          </TintBadge>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[0.65rem] text-muted-foreground">
            {t("scoreHistory")}
          </p>
          <ScoreTrendChart
            primary={primarySeries}
            secondary={secondarySeries}
            emptyLabel={t("scoreHistoryEmpty")}
            renderTooltip={(index) => {
              const play = chronological[index];
              if (!play) return null;
              const playRating = ratingFor(play);
              const playOverpower = overPowerFor(play);
              return (
                <div className="flex flex-col gap-1">
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-sm leading-none font-semibold tabular-nums">
                      {isMaimai
                        ? `${play.achievement.toFixed(4)}%`
                        : formatScore(play.score)}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                      {isMaimai
                        ? `${t("scoreDxScore")} ${formatScore(play.dxScore)}`
                        : `${t("scoreOp")} ${playOverpower !== null ? playOverpower.toFixed(2) : "-"}`}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {play.rank ? (
                      <TintBadge tone={rankTone(play.rank)}>
                        <span className="tabular-nums">{play.rank}</span>
                      </TintBadge>
                    ) : null}
                    {isMaimai ? (
                      <TintBadge
                        tone={
                          dxStarCount(play.dxScore, maxDxScore) > 0
                            ? "amber"
                            : "slate"
                        }
                      >
                        {dxStarCount(play.dxScore, maxDxScore) > 0
                          ? "★".repeat(dxStarCount(play.dxScore, maxDxScore))
                          : "★ 0"}
                      </TintBadge>
                    ) : (
                      <TintBadge tone="violet">
                        {t("scoreOp")}
                        <span className="tabular-nums">
                          {playOverpower !== null
                            ? playOverpower.toFixed(2)
                            : "-"}
                        </span>
                      </TintBadge>
                    )}
                    {lampsFor(play).map((lamp) => (
                      <TintBadge key={lamp.label} tone={lamp.tone}>
                        {lamp.label}
                      </TintBadge>
                    ))}
                    <TintBadge tone="slate">
                      <span className="font-medium opacity-70">
                        {t("ratingResult")}
                      </span>
                      <span className="tabular-nums">
                        {playRating === null
                          ? "-"
                          : isMaimai
                            ? playRating.toLocaleString("en-US")
                            : playRating.toFixed(2)}
                      </span>
                    </TintBadge>
                  </div>
                </div>
              );
            }}
          />
        </div>
      </div>
    </>
  );
}

function ChartCalculator({
  chart,
  game,
  target,
  onTargetChange,
  hasNoteStats,
  versionDates,
}: {
  chart: CatalogChart;
  game: Game;
  target: number;
  onTargetChange: (target: number) => void;
  /** Charts without note counts cannot produce a tolerance estimate. */
  hasNoteStats: boolean;
  versionDates?: Map<string, string | null>;
}) {
  const { t } = useTranslation("songs");
  const presets = RANK_PRESETS[game];
  const clampedTarget = Math.min(MAX_TARGET[game], Math.max(0, target));
  const rank = rankForTarget(game, clampedTarget);
  // WORLD'S END star ratings are encoded as 101–105 in `levelValue`, which must
  // not be mistaken for a chart constant.
  const constant = isWorldsEndChart(chart)
    ? null
    : chartConstant(
        chart.internalLevel,
        chart.internalLevelValue,
        chart.levelValue,
      );
  const rating =
    constant !== null ? chartRating(game, constant, clampedTarget) : null;
  const [historyOpen, setHistoryOpen] = useState(true);
  // Oldest first, so the current constant sits at the end of the strip.
  const constantHistoryOldestFirst = useMemo(() => {
    const rank = (version: string) => {
      const date = versionDates?.get(version) ?? null;
      const time = date ? Date.parse(date) : Number.NaN;
      return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
    };
    return [...chart.constantHistory].sort((a, b) => {
      const left = rank(a.version);
      const right = rank(b.version);
      if (left === right) return a.version.localeCompare(b.version);
      return left - right;
    });
  }, [chart.constantHistory, versionDates]);
  const tolerance = calculateTolerance(game, chart.noteCounts, clampedTarget);
  const [firstLabel, secondLabel, missLabel] = JUDGEMENT_LABELS[game];
  const results = [
    { key: "first", labelKey: firstLabel, value: tolerance.first },
    { key: "second", labelKey: secondLabel, value: tolerance.second },
    { key: "miss", labelKey: missLabel, value: tolerance.miss },
  ];

  return (
    <div className="flex flex-col gap-3 bg-muted/25 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("calcTitle")}
        </p>
        <p className="text-[0.7rem] text-muted-foreground tabular-nums">
          {t("ratingConstant")} {constant !== null ? constant.toFixed(1) : "-"}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1 sm:w-40">
          <Label className="text-xs text-muted-foreground">
            {t("calcRankPresets")}
          </Label>
          <Select
            value={String(clampedTarget)}
            onValueChange={(value) => onTargetChange(Number(value))}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[...presets].reverse().map((preset) => (
                  <SelectItem key={preset.label} value={String(preset.target)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{t("calcRank")}</p>
          <p className="text-base font-semibold tabular-nums">
            {rank} ·{" "}
            {game === "maimaid"
              ? `≥ ${clampedTarget.toFixed(clampedTarget % 1 === 0 ? 0 : 2)}%`
              : `≥ ${clampedTarget.toLocaleString("en-US")}`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {hasNoteStats ? (
          <p className="text-xs font-medium">{t("calcTolerance")}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {hasNoteStats
            ? results.map((result) => (
                <div
                  key={result.key}
                  className="rounded-md bg-card px-2 py-1.5 ring-1 ring-foreground/10"
                >
                  <p className="text-[0.65rem] text-muted-foreground">
                    {t(result.labelKey)}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {result.value.toLocaleString("en-US")}
                  </p>
                </div>
              ))
            : null}
          <div className="rounded-md bg-card px-2 py-1.5 ring-1 ring-foreground/10">
            <p className="text-[0.65rem] text-muted-foreground">
              {t("ratingResult")}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {rating !== null
                ? game === "maimaid"
                  ? rating.toLocaleString("en-US")
                  : rating.toFixed(2)
                : "-"}
            </p>
          </div>
        </div>
      </div>
      {chart.constantHistory.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex items-center gap-1.5 self-start text-xs font-medium"
          >
            <ChevronDownIcon
              className={historyOpen ? "size-3.5" : "size-3.5 -rotate-90"}
            />
            {t("constantHistory")} · {chart.constantHistory.length}
          </button>
          {historyOpen ? (
            <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {constantHistoryOldestFirst.map((entry, index) => {
                const isCurrent =
                  index === constantHistoryOldestFirst.length - 1;
                return (
                  <div
                    key={`${entry.version}:${index}`}
                    className={cn(
                      "flex min-w-[6rem] flex-col items-center gap-0.5 rounded-md border px-2 py-1 text-center",
                      isCurrent ? "bg-muted/60" : "bg-card",
                    )}
                  >
                    <span
                      className="w-full truncate text-[0.6rem] text-muted-foreground"
                      title={entry.version}
                    >
                      {entry.version}
                    </span>
                    <span className="flex items-center gap-0.5 text-sm leading-none font-semibold tabular-nums">
                      {entry.constant.toFixed(1)}
                      {entry.change !== null ? (
                        <span
                          title={`${entry.change > 0 ? "+" : ""}${entry.change.toFixed(1)}`}
                          className={
                            entry.change > 0
                              ? "text-red-500"
                              : "text-emerald-500"
                          }
                        >
                          {entry.change > 0 ? (
                            <ArrowUpIcon className="size-3" aria-hidden />
                          ) : (
                            <ArrowDownIcon className="size-3" aria-hidden />
                          )}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function SongDetailDialog({
  song,
  open,
  onOpenChange,
  game,
  request,
  lookup,
  versionDates,
}: {
  song: CatalogSong | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: Game;
  request: RequestFn;
  lookup: DifficultyLookup;
  /** Version → release date, used to order the constant history chronologically. */
  versionDates?: Map<string, string | null>;
}) {
  const { t } = useTranslation("songs");
  const noteFields = GAME_NOTE_FIELDS[game];
  const presets = RANK_PRESETS[game];
  // The dialog remembers the chart type, difficulty and calculator target per
  // game, so the next song opens on the same view.
  const [prefs, setPrefs] = useState<SongDetailPrefs>(() =>
    readSongDetailPrefs(game),
  );
  useEffect(() => {
    writeSongDetailPrefs(game, prefs);
  }, [game, prefs]);
  const defaultTarget = presets[presets.length - 1]?.target ?? 0;
  const target = presets.some((preset) => preset.target === prefs.target)
    ? (prefs.target as number)
    : defaultTarget;
  const chartGroups = useMemo(() => {
    if (!song) return [] as Array<{ type: string; charts: CatalogChart[] }>;
    const groups = new Map<string, CatalogChart[]>();
    for (const chart of song.charts) {
      const list = groups.get(chart.type) ?? [];
      list.push(chart);
      groups.set(chart.type, list);
    }
    return [...groups.entries()].map(([type, charts]) => ({ type, charts }));
  }, [song]);
  // Unknown remembered values simply fall back to the first group / chart, which
  // keeps the panel rendered without a state round-trip.
  const activeGroup =
    chartGroups.find((group) => group.type === prefs.type) ?? chartGroups[0];
  const activeTypeValue = activeGroup?.type ?? "";
  const activeCharts = activeGroup?.charts ?? EMPTY_CHARTS;
  const chartFor = (
    group: { type: string; charts: CatalogChart[] } | undefined,
  ) => {
    if (!group?.charts.length) return null;
    const charts = group.charts;
    const remembered = charts.find(
      (chart) => chart.difficulty === prefs.difficulty,
    );
    if (remembered) return remembered;
    // The remembered difficulty does not exist on this song: fall back to the
    // hardest chart instead of dropping back to BASIC.
    const fallback = prefs.difficulty ? charts[charts.length - 1] : charts[0];
    return fallback ?? null;
  };
  const activeChart = chartFor(activeGroup);
  const selectChart = (chart: CatalogChart) => {
    setPrefs((previous) => ({
      ...previous,
      type: chart.type,
      difficulty: chart.difficulty,
    }));
  };
  const selectType = (type: string) => {
    setPrefs((previous) => ({ ...previous, type }));
  };
  const selectTarget = (value: number) => {
    setPrefs((previous) => ({ ...previous, target: value }));
  };
  const activeReleaseDate =
    activeCharts.find((chart) => chart.releaseDate)?.releaseDate ??
    song?.releaseDate ??
    null;
  const activeVersion =
    activeCharts.find((chart) => chart.version)?.version ??
    song?.version ??
    null;
  const activeSongNumber =
    activeCharts.find((chart) => chart.songNumber)?.songNumber ??
    song?.id ??
    "-";
  const regions = song ? songRegions(activeCharts) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] grid-cols-1 overflow-y-auto sm:max-w-5xl lg:max-w-6xl">
        {song ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{song.title}</DialogTitle>
              <DialogDescription>{song.artist}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <SongCover
                  src={song.coverUrl}
                  alt={song.title}
                  className="aspect-square w-full max-w-40 self-start rounded-xl ring-1 ring-foreground/10"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {song.category ? (
                      <Badge variant="secondary">{song.category}</Badge>
                    ) : null}
                    {song.isNew ? (
                      <Badge>
                        <SparklesIcon />
                        {t("detailNew")}
                      </Badge>
                    ) : null}
                    {song.isLocked ? (
                      <Badge variant="outline">
                        <LockIcon />
                        {t("detailLocked")}
                      </Badge>
                    ) : null}
                  </div>

                  <dl className="grid w-fit max-w-full grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-muted-foreground">
                        {t("detailReleaseDate")}
                      </dt>
                      <dd className="font-medium">
                        {activeReleaseDate ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("detailBpm")}
                      </dt>
                      <dd className="font-medium">{song.bpm ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("detailVersion")}
                      </dt>
                      <dd className="truncate font-medium">
                        {activeVersion ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("detailSongId")}
                      </dt>
                      <dd className="truncate font-mono text-[0.7rem]">
                        {activeSongNumber}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("chartRegions")}
                      </dt>
                      <dd className="mt-0.5 flex flex-wrap gap-1">
                        {regions.length > 0 ? (
                          regions.map((region) => (
                            <Badge
                              key={region}
                              variant="outline"
                              className="h-4 px-1 text-[0.6rem]"
                            >
                              {region}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </dd>
                    </div>
                    {activeCharts.length > 0 ? (
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">
                          {t("chartDifficulty")}
                        </dt>
                        <dd
                          role="group"
                          aria-label={t("chartDifficulty")}
                          className="mt-0.5 flex flex-wrap items-center gap-1"
                        >
                          {activeCharts.map((chart) => (
                            <DifficultyChoice
                              key={chart.id}
                              chart={chart}
                              songId={song.id}
                              game={game}
                              lookup={lookup}
                              selected={chart.id === activeChart?.id}
                              onSelect={() => selectChart(chart)}
                            />
                          ))}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {song.comment ? (
                    <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs whitespace-pre-line text-muted-foreground">
                      {song.comment}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("detailAliases")}
                </p>
                <div className="flex flex-wrap gap-1">
                  {song.aliases.map((alias) => (
                    <Badge
                      key={alias}
                      variant="secondary"
                      title={t("aliasLxnsSource")}
                      className="max-w-full truncate"
                    >
                      {alias}
                    </Badge>
                  ))}
                  <CommunityAliasBadges
                    game={game}
                    songId={song.id}
                    knownAliases={song.aliases}
                    request={request}
                  />
                </div>
                <AliasSection game={game} songId={song.id} request={request} />
              </div>

              <div className="flex flex-col gap-1.5">
                {song.charts.length === 0 ? (
                  <>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t("detailCharts")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("detailNoCharts")}
                    </p>
                  </>
                ) : (
                  <Tabs
                    value={activeTypeValue}
                    onValueChange={selectType}
                    className="gap-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t("detailCharts")}
                      </p>
                      {chartGroups.length > 1 ? (
                        <TabsList
                          variant="line"
                          aria-label={t("chartType")}
                          className="justify-start overflow-x-auto"
                        >
                          {chartGroups.map((group) => (
                            <TabsTrigger key={group.type} value={group.type}>
                              {lookup.typeLabel(group.type)}
                              <span className="text-muted-foreground">
                                {group.charts.length}
                              </span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      ) : null}
                    </div>
                    {chartGroups.map((group) => {
                      const chart = chartFor(group);
                      return (
                        <TabsContent key={group.type} value={group.type}>
                          {chart ? (
                            <ChartPanel
                              songId={song.id}
                              chart={chart}
                              game={game}
                              lookup={lookup}
                              noteFields={noteFields}
                              target={target}
                              onTargetChange={selectTarget}
                              versionDates={versionDates}
                            />
                          ) : null}
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                )}
              </div>
            </div>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>{t("detailTitle")}</DialogTitle>
            <DialogDescription>
              <MusicIcon className="size-4" />
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
