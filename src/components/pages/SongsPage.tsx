"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  LayoutGridIcon,
  ListIcon,
  LockIcon,
  MusicIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Game, RequestFn } from "@/App";
import { chartVisual } from "@/lib/chart-colors";
import {
  ChartBadge,
  SongGridCard,
  type DifficultyLookup,
} from "@/components/songs/SongGridCard";
import { MarqueeText } from "@/components/songs/MarqueeText";
import { SongCover } from "@/components/songs/SongCover";
import { SongDetailDialog } from "@/components/songs/SongDetailDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { compactSearchText, normalizeSearchText } from "@/lib/app-helpers";
import {
  chartRatingLevel,
  loadGameCatalog,
  clearGameCatalogCache,
  type CatalogChart,
  type CatalogOption,
  type CatalogSong,
  type GameCatalog,
} from "@/lib/game-catalog";
import { useBackupData } from "@/store/backup-data";
import { useTablePagination } from "@/lib/use-table-pagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const LEVEL_STEP = 0.1;
const SPECIAL_LEVEL_THRESHOLD = 16;

type SortKey = "default" | "versionDate" | "difficulty";
type SortDirection = "asc" | "desc";
type ViewMode = "grid" | "list";

const SONGS_SETTINGS_KEY_PREFIX = "rhythmeta.dashboard.songs.v1";

type StoredSongSettings = {
  category: string;
  version: string;
  types: string[];
  difficulties: string[];
  levelRange: [number, number] | null;
  sort: SortKey;
  sortDirection: SortDirection;
  hideLocked: boolean;
  favoritesOnly: boolean;
  playableOnly: boolean;
  hideDeleted: boolean;
  pageSize: number;
};

const SORT_KEYS: readonly SortKey[] = ["default", "versionDate", "difficulty"];

function readSongSettings(game: Game): Partial<StoredSongSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      `${SONGS_SETTINGS_KEY_PREFIX}.${game}`,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredSongSettings>;
    const settings: Partial<StoredSongSettings> = {};
    if (typeof parsed.category === "string")
      settings.category = parsed.category;
    if (typeof parsed.version === "string") settings.version = parsed.version;
    if (Array.isArray(parsed.types)) {
      settings.types = parsed.types.filter(
        (value): value is string => typeof value === "string",
      );
    }
    if (Array.isArray(parsed.difficulties)) {
      settings.difficulties = parsed.difficulties.filter(
        (value): value is string => typeof value === "string",
      );
    }
    if (
      Array.isArray(parsed.levelRange) &&
      parsed.levelRange.length === 2 &&
      parsed.levelRange.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      settings.levelRange = [parsed.levelRange[0], parsed.levelRange[1]];
    }
    if (parsed.sort && SORT_KEYS.includes(parsed.sort))
      settings.sort = parsed.sort;
    if (parsed.sortDirection === "asc" || parsed.sortDirection === "desc") {
      settings.sortDirection = parsed.sortDirection;
    }
    if (typeof parsed.hideLocked === "boolean")
      settings.hideLocked = parsed.hideLocked;
    if (typeof parsed.favoritesOnly === "boolean")
      settings.favoritesOnly = parsed.favoritesOnly;
    if (typeof parsed.playableOnly === "boolean")
      settings.playableOnly = parsed.playableOnly;
    if (typeof parsed.hideDeleted === "boolean")
      settings.hideDeleted = parsed.hideDeleted;
    if (
      typeof parsed.pageSize === "number" &&
      PAGE_SIZE_OPTIONS.includes(parsed.pageSize)
    ) {
      settings.pageSize = parsed.pageSize;
    }
    return settings;
  } catch {
    return {};
  }
}

function persistSongSettings(game: Game, settings: StoredSongSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${SONGS_SETTINGS_KEY_PREFIX}.${game}`,
      JSON.stringify(settings),
    );
  } catch {
    // Private mode/quota: filters simply are not remembered.
  }
}

/** Any region where the chart is still available. */
function hasAnyRegion(chart: CatalogChart): boolean {
  return (
    chart.regions.jp ||
    chart.regions.intl ||
    chart.regions.usa ||
    chart.regions.cn
  );
}

type SongMatch = {
  song: CatalogSong;
  charts: CatalogChart[];
  order: number;
};

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={index}
          className="flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
        >
          <div className="aspect-square w-full animate-pulse bg-muted" />
          <div className="flex flex-col gap-2 p-2.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SongsPage({
  game,
  request,
}: {
  game: Game;
  request: RequestFn;
}) {
  const { t } = useTranslation("songs");
  const [catalog, setCatalog] = useState<GameCatalog | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [initialSettings] = useState(() => readSongSettings(game));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialSettings.category ?? "all");
  const [version, setVersion] = useState(initialSettings.version ?? "all");
  const [types, setTypes] = useState<string[]>(initialSettings.types ?? []);
  const [difficulties, setDifficulties] = useState<string[]>(
    initialSettings.difficulties ?? [],
  );
  const [levelRange, setLevelRange] = useState<[number, number] | null>(
    initialSettings.levelRange ?? null,
  );
  const [sort, setSort] = useState<SortKey>(initialSettings.sort ?? "default");
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    initialSettings.sortDirection ?? "asc",
  );
  const [hideLocked, setHideLocked] = useState(
    initialSettings.hideLocked ?? false,
  );
  const [favoritesOnly, setFavoritesOnly] = useState(
    initialSettings.favoritesOnly ?? false,
  );
  const [playableOnly, setPlayableOnly] = useState(
    initialSettings.playableOnly ?? false,
  );
  const [hideDeleted, setHideDeleted] = useState(
    initialSettings.hideDeleted ?? false,
  );
  const { favoriteSongIds } = useBackupData();
  const [view, setView] = useState<ViewMode>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<CatalogSong | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorMessage("");
    void loadGameCatalog(game)
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage((error as Error).message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [game, reloadToken]);

  useEffect(() => {
    if (!catalog) return;
    if (
      category !== "all" &&
      !catalog.categories.some((option) => option.value === category)
    ) {
      setCategory("all");
    }
    if (
      version !== "all" &&
      !catalog.versions.some((option) => option.value === version)
    ) {
      setVersion("all");
    }
    setTypes((previous) => {
      const next = previous.filter((value) =>
        catalog.types.some((option) => option.value === value),
      );
      return next.length === previous.length ? previous : next;
    });
    setDifficulties((previous) => {
      const next = previous.filter((value) =>
        catalog.difficulties.some((option) => option.value === value),
      );
      return next.length === previous.length ? previous : next;
    });
    setLevelRange((previous) => {
      if (!previous) return previous;
      const clamped: [number, number] = [
        Math.min(previous[0], catalog.maxLevel),
        Math.min(previous[1], catalog.maxLevel),
      ];
      return clamped[0] === previous[0] && clamped[1] === previous[1]
        ? previous
        : clamped;
    });
  }, [catalog, category, version]);

  const retry = useCallback(() => {
    clearGameCatalogCache(game);
    setReloadToken((token) => token + 1);
  }, [game]);

  const difficultyOptions = useMemo(
    () =>
      new Map<string, CatalogOption>(
        (catalog?.difficulties ?? []).map((option) => [option.value, option]),
      ),
    [catalog],
  );
  const typeOptions = useMemo(
    () =>
      new Map<string, CatalogOption>(
        (catalog?.types ?? []).map((option) => [option.value, option]),
      ),
    [catalog],
  );
  const versionDates = useMemo(
    () =>
      new Map<string, string | null>(
        (catalog?.versions ?? []).map((option) => [
          option.value,
          option.releaseDate,
        ]),
      ),
    [catalog],
  );
  const versionLabels = useMemo(
    () =>
      new Map<string, string>(
        (catalog?.versions ?? []).map((option) => [option.value, option.label]),
      ),
    [catalog],
  );
  const versionLabel = useCallback(
    (value: string | null) =>
      value ? (versionLabels.get(value) ?? value) : null,
    [versionLabels],
  );
  const displayCharts = useCallback((row: SongMatch) => {
    const dxCharts = row.song.charts.filter((chart) => chart.type === "dx");
    return dxCharts.length > 0 ? dxCharts : row.charts;
  }, []);
  const lookup = useMemo<DifficultyLookup>(
    () => ({
      label: (value) => difficultyOptions.get(value)?.label ?? value,
      color: (value) => difficultyOptions.get(value)?.color ?? null,
      typeLabel: (value) => typeOptions.get(value)?.label ?? value,
      visual: (chart) =>
        chartVisual(
          game,
          chart,
          difficultyOptions.get(chart.difficulty)?.color ?? null,
        ),
    }),
    [difficultyOptions, typeOptions, game],
  );

  const maxLevel = catalog?.maxLevel ?? 15;
  const effectiveRange = useMemo<[number, number]>(
    () => levelRange ?? [1, maxLevel],
    [levelRange, maxLevel],
  );
  const rangeActive = effectiveRange[0] > 1 || effectiveRange[1] < maxLevel;
  const hasChartFilters =
    types.length > 0 || difficulties.length > 0 || rangeActive;

  /**
   * maimaid stores favourites as numeric song ids (per DX/STD family); chunithmd
   * stores the bundle song id. Both are compared against the backup's list.
   */
  const isFavoriteSong = useCallback(
    (song: CatalogSong) =>
      favoriteSongIds.size > 0 &&
      (favoriteSongIds.has(song.id) ||
        song.charts.some(
          (chart) =>
            chart.songNumber !== null && favoriteSongIds.has(chart.songNumber),
        )),
    [favoriteSongIds],
  );

  const filtered = useMemo<SongMatch[]>(() => {
    if (!catalog) return [];
    const query = normalizeSearchText(search.trim());
    const compactQuery = compactSearchText(search.trim());
    const typeSet = new Set(types);
    const difficultySet = new Set(difficulties);
    const [min, max] = effectiveRange;
    const rows: SongMatch[] = [];

    catalog.songs.forEach((song, order) => {
      if (hideLocked && song.isLocked) return;
      // Quick filters mirror the clients: favourites come from the backup, and a
      // song's region flags decide whether it is still playable anywhere.
      if (favoritesOnly && !isFavoriteSong(song)) return;
      if (playableOnly && !song.charts.some((chart) => chart.regions.jp))
        return;
      if (hideDeleted && !song.charts.some(hasAnyRegion)) return;
      if (category !== "all" && song.category !== category) return;
      if (version !== "all" && song.version !== version) return;
      if (
        query &&
        !song.searchText.includes(query) &&
        !(compactQuery && song.searchTextCompact.includes(compactQuery))
      ) {
        return;
      }
      const charts = song.charts.filter((chart) => {
        if (typeSet.size > 0 && !typeSet.has(chart.type)) return false;
        if (difficultySet.size > 0 && !difficultySet.has(chart.difficulty)) {
          return false;
        }
        // Filter on the chart's actual constant (定数), like the clients do:
        // maimaid prefers internalLevelValue, chunithmd uses levelValue.
        const ratingLevel = chartRatingLevel(game, chart);
        if (
          ratingLevel !== null &&
          ratingLevel <= SPECIAL_LEVEL_THRESHOLD &&
          (ratingLevel < min || ratingLevel > max)
        ) {
          return false;
        }
        return true;
      });
      if (hasChartFilters && charts.length === 0) return;
      rows.push({ song, charts, order });
    });

    const direction = sortDirection === "asc" ? 1 : -1;
    if (sort === "versionDate") {
      rows.sort((left, right) => {
        const time = (row: SongMatch) => {
          const date = row.song.version
            ? versionDates.get(row.song.version)
            : null;
          const parsed = date ? Date.parse(date) : Number.NaN;
          return Number.isNaN(parsed) ? 0 : parsed;
        };
        return (
          direction * (time(left) - time(right)) ||
          left.song.title.localeCompare(right.song.title, "ja")
        );
      });
    } else if (sort === "difficulty") {
      rows.sort((left, right) => {
        const level = (row: SongMatch) =>
          row.charts.reduce((maximum, chart) => {
            const ratingLevel = chartRatingLevel(game, chart);
            return ratingLevel !== null &&
              ratingLevel <= SPECIAL_LEVEL_THRESHOLD &&
              ratingLevel > maximum
              ? ratingLevel
              : maximum;
          }, 0);
        return (
          direction * (level(left) - level(right)) || left.order - right.order
        );
      });
    } else if (sortDirection === "desc") {
      rows.reverse();
    }
    return rows;
  }, [
    catalog,
    search,
    category,
    version,
    types,
    difficulties,
    effectiveRange,
    hasChartFilters,
    sort,
    sortDirection,
    hideLocked,
    favoritesOnly,
    playableOnly,
    hideDeleted,
    isFavoriteSong,
    game,
    versionDates,
  ]);

  const { page, pageCount, pageSize, pagedItems, setPage, setPageSize } =
    useTablePagination(filtered, {
      initialPageSize: initialSettings.pageSize ?? PAGE_SIZE,
    });

  useEffect(() => {
    persistSongSettings(game, {
      category,
      version,
      types,
      difficulties,
      levelRange,
      sort,
      sortDirection,
      hideLocked,
      favoritesOnly,
      playableOnly,
      hideDeleted,
      pageSize,
    });
  }, [
    game,
    category,
    version,
    types,
    difficulties,
    levelRange,
    sort,
    sortDirection,
    hideLocked,
    favoritesOnly,
    playableOnly,
    hideDeleted,
    pageSize,
  ]);

  const filterKey = JSON.stringify({
    search,
    category,
    version,
    types,
    difficulties,
    range: effectiveRange,
    sort,
    hideLocked,
  });
  useEffect(() => {
    setPage(1);
  }, [filterKey, setPage]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setCategory("all");
    setVersion("all");
    setTypes([]);
    setDifficulties([]);
    setLevelRange(null);
    setSort("default");
    setSortDirection("asc");
    setHideLocked(false);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("loadingHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SkeletonGrid />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error" || !catalog) {
    return (
      <Card size="sm">
        <CardContent>
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{t("loadFailedTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span className="break-all">{errorMessage}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={retry}
              >
                <RefreshCwIcon data-icon="inline-start" />
                {t("retry")}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const filteredEmpty = filtered.length === 0;

  const paginationBar = (className?: string) =>
    !filteredEmpty && filtered.length > pageSize ? (
      <TablePagination
        className={className}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
          <CardAction>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(value) => {
                if (value === "grid" || value === "list") setView(value);
              }}
            >
              <ToggleGroupItem value="grid" aria-label={t("viewGrid")}>
                <LayoutGridIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label={t("viewList")}>
                <ListIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                className="pl-8"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:ml-auto">
              {t("counts", {
                filtered: filtered.length,
                total: catalog.songs.length,
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="md:hidden"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontalIcon data-icon="inline-start" />
              {t("filtersToggle")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
            >
              <RotateCcwIcon data-icon="inline-start" />
              {t("reset")}
            </Button>
          </div>

          <div
            className={cn(
              "flex-col gap-4 rounded-lg border p-3",
              filtersOpen ? "flex" : "hidden md:flex",
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("categoryLabel")}
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">{t("categoryAll")}</SelectItem>
                      {catalog.categories.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("versionLabel")}
                </Label>
                <Select value={version} onValueChange={setVersion}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">{t("versionAll")}</SelectItem>
                      {catalog.versions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("sortLabel")}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={sort}
                    onValueChange={(value) => {
                      const next = value as SortKey;
                      setSort(next);
                      setSortDirection(next === "default" ? "asc" : "desc");
                    }}
                  >
                    <SelectTrigger size="sm" className="w-full flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="default">
                          {t("sortDefault")}
                        </SelectItem>
                        <SelectItem value="versionDate">
                          {t("sortVersionDate")}
                        </SelectItem>
                        <SelectItem value="difficulty">
                          {t("sortDifficulty")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={
                      sortDirection === "asc"
                        ? t("sortAscending")
                        : t("sortDescending")
                    }
                    title={
                      sortDirection === "asc"
                        ? t("sortAscending")
                        : t("sortDescending")
                    }
                    onClick={() =>
                      setSortDirection((previous) =>
                        previous === "asc" ? "desc" : "asc",
                      )
                    }
                  >
                    {sortDirection === "asc" ? (
                      <ArrowUpIcon />
                    ) : (
                      <ArrowDownIcon />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("levelLabel")}
                </Label>
                <Slider
                  min={1}
                  max={maxLevel}
                  step={LEVEL_STEP}
                  minStepsBetweenThumbs={1}
                  value={effectiveRange}
                  onValueChange={(value) => {
                    const [min, max] = value;
                    if (typeof min === "number" && typeof max === "number") {
                      setLevelRange([min, max]);
                    }
                  }}
                />
                <p className="text-[0.7rem] text-muted-foreground tabular-nums">
                  {t("levelValue", {
                    min: effectiveRange[0].toFixed(1),
                    max: effectiveRange[1].toFixed(1),
                  })}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("difficultyLabel")}
                </Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  className="flex-wrap justify-start"
                  value={difficulties}
                  onValueChange={setDifficulties}
                >
                  {catalog.difficulties.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("typeLabel")}
                </Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  className="flex-wrap justify-start"
                  value={types}
                  onValueChange={setTypes}
                >
                  {catalog.types.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("quickFilters")}
              </Label>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="songs-hide-locked"
                    checked={hideLocked}
                    onCheckedChange={setHideLocked}
                  />
                  <Label
                    htmlFor="songs-hide-locked"
                    className="text-sm text-muted-foreground"
                  >
                    {t("hideLocked")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="songs-favorites-only"
                    checked={favoritesOnly}
                    onCheckedChange={setFavoritesOnly}
                  />
                  <Label
                    htmlFor="songs-favorites-only"
                    className="text-sm text-muted-foreground"
                  >
                    {t("favoritesOnly")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="songs-playable-only"
                    checked={playableOnly}
                    onCheckedChange={setPlayableOnly}
                  />
                  <Label
                    htmlFor="songs-playable-only"
                    className="text-sm text-muted-foreground"
                  >
                    {t("playableOnly")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="songs-hide-deleted"
                    checked={hideDeleted}
                    onCheckedChange={setHideDeleted}
                  />
                  <Label
                    htmlFor="songs-hide-deleted"
                    className="text-sm text-muted-foreground"
                  >
                    {t("hideDeleted")}
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {paginationBar()}

      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          {filteredEmpty ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MusicIcon />
                </EmptyMedia>
                <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
                <EmptyDescription>{t("emptyDesc")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" variant="outline" onClick={resetFilters}>
                  <RotateCcwIcon data-icon="inline-start" />
                  {t("reset")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {pagedItems.map((row) => (
                <SongGridCard
                  key={row.song.id}
                  song={row.song}
                  charts={displayCharts(row)}
                  lookup={lookup}
                  versionLabel={versionLabel}
                  onSelect={setSelected}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{t("colCover")}</TableHead>
                    <TableHead>{t("colSong")}</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t("colCategory")}
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("colVersion")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("colBpm")}
                    </TableHead>
                    <TableHead>{t("colCharts")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((row) => (
                    <TableRow
                      key={row.song.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(row.song)}
                    >
                      <TableCell>
                        <SongCover
                          src={row.song.coverUrl}
                          alt={row.song.title}
                          className="size-10 rounded-md"
                          iconClassName="size-4"
                        />
                      </TableCell>
                      <TableCell className="w-64 max-w-64">
                        <button
                          type="button"
                          className="group/row flex w-full min-w-0 flex-col overflow-hidden text-left hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(row.song);
                          }}
                        >
                          <MarqueeText
                            text={row.song.title}
                            className="text-sm font-medium"
                            hoverClassName="group-hover/row:animate-[marquee-scroll_7s_linear_infinite]"
                          />
                          <MarqueeText
                            text={row.song.artist}
                            className="text-xs text-muted-foreground"
                            hoverClassName="group-hover/row:animate-[marquee-scroll_7s_linear_infinite]"
                          />
                        </button>
                        <span className="mt-1 flex gap-1">
                          {row.song.isNew ? (
                            <Badge
                              variant="default"
                              className="h-4 px-1 text-[0.6rem]"
                            >
                              <SparklesIcon />
                              NEW
                            </Badge>
                          ) : null}
                          {row.song.isLocked ? (
                            <Badge
                              variant="secondary"
                              className="h-4 px-1 text-[0.6rem]"
                            >
                              <LockIcon />
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-32 truncate lg:table-cell text-xs text-muted-foreground">
                        {row.song.category ?? "-"}
                      </TableCell>
                      <TableCell className="hidden max-w-40 whitespace-nowrap sm:table-cell">
                        {versionLabel(row.song.version) ? (
                          <Badge
                            variant="outline"
                            className="h-5 max-w-full truncate px-1.5 text-[0.65rem]"
                            title={row.song.version ?? undefined}
                          >
                            {versionLabel(row.song.version)}
                          </Badge>
                        ) : (
                          <span className="text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs tabular-nums md:table-cell">
                        {row.song.bpm ?? "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {displayCharts(row)
                            .slice(0, 6)
                            .map((chart) => (
                              <ChartBadge
                                key={chart.id}
                                chart={chart}
                                songId={row.song.id}
                                lookup={lookup}
                              />
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {paginationBar()}

      <SongDetailDialog
        song={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        game={game}
        request={request}
        lookup={lookup}
        versionDates={versionDates}
      />
    </div>
  );
}
