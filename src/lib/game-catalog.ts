import type { Game } from "@/App";
import { compactSearchText, normalizeSearchText } from "@/lib/app-helpers";

/** Static asset hosts for the public song catalogs. */
export const GAME_STATIC_BASE: Record<Game, string> = {
  maimaid: (
    process.env.NEXT_PUBLIC_MAIMAID_STATIC_URL ??
    "https://maimaid-assets.rhythmeta.org"
  ).replace(/\/+$/u, ""),
  chunithmd: (
    process.env.NEXT_PUBLIC_CHUNITHMD_STATIC_URL ??
    "https://chunithmd-assets.rhythmeta.org"
  ).replace(/\/+$/u, ""),
};

export type CatalogNoteCounts = {
  tap: number | null;
  hold: number | null;
  slide: number | null;
  touch: number | null;
  break: number | null;
  air: number | null;
  flick: number | null;
  total: number | null;
};

export type CatalogChart = {
  id: string;
  type: string;
  difficulty: string;
  level: string;
  levelValue: number | null;
  internalLevel: string | null;
  internalLevelValue: number | null;
  noteDesigner: string | null;
  noteCounts: CatalogNoteCounts;
  regions: { jp: boolean; intl: boolean; usa: boolean; cn: boolean };
  isSpecial: boolean;
  version: string | null;
  releaseDate: string | null;
  /** maimaid numeric song id for this chart family (DX/STD ids differ). */
  songNumber: string | null;
  /** Community-fitted difficulty (maimaid `chart_fit`), when available. */
  fitDifficulty: number | null;
  /** Level recorded when the fit data was collected (for constant changes). */
  fitLevel: string | null;
  fitSamples: number | null;
  /** `multiverInternalLevelValue`: chart constant per game version (maimaid). */
  constantHistory: Array<{
    version: string;
    constant: number;
    change: number | null;
  }>;
};

export type CatalogSong = {
  id: string;
  title: string;
  artist: string;
  category: string | null;
  version: string | null;
  releaseDate: string | null;
  bpm: number | null;
  isNew: boolean;
  isLocked: boolean;
  comment: string | null;
  coverUrl: string | null;
  aliases: string[];
  charts: CatalogChart[];
  /** Normalized haystack for instant search (title/artist/aliases/id/charts). */
  searchText: string;
  /** Same haystack with every whitespace removed, for compact queries. */
  searchTextCompact: string;
};

/**
 * Level a chart is filtered/sorted by, mirroring each client:
 * - maimaid uses `internalLevelValue` (the 定数) and only falls back to the
 *   printed `levelValue` (ServerChartPolicy.ratingLevel);
 * - chunithmd filters on `levelValue` (the displayed constant) like CatalogQuery.
 */
export function chartRatingLevel(
  game: Game,
  chart: CatalogChart,
): number | null {
  const positive = (value: number | null): number | null =>
    value !== null && value > 0 ? value : null;
  if (game === "maimaid") {
    return positive(chart.internalLevelValue) ?? positive(chart.levelValue);
  }
  return positive(chart.levelValue) ?? positive(chart.internalLevelValue);
}

export type CatalogOption = {
  value: string;
  label: string;
  /** Difficulty colour from the bundle (hex for maimaid, CSS name for chunithmd). */
  color?: string | null;
};

export type CatalogVersionOption = CatalogOption & {
  releaseDate: string | null;
};

export type GameCatalog = {
  game: Game;
  songs: CatalogSong[];
  categories: CatalogOption[];
  versions: CatalogVersionOption[];
  types: CatalogOption[];
  difficulties: CatalogOption[];
  /** Highest regular chart level (special/WORLD'S END sentinels excluded). */
  maxLevel: number;
  fetchedAt: number;
};

type JsonRecord = Record<string, unknown>;

const MAX_REGULAR_LEVEL = 16;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The clients display DX songs with their `1xxxx` provider id, but the static
 * bundle stores a handful of new songs with the raw `xxxx` id (2025 for 12025),
 * so mirror the client: DX ids below 10000 get the ten-thousand prefix.
 */
function maimaidSongNumber(value: number | null, type: string): string | null {
  if (value === null) return null;
  const normalized = type === "dx" && value < 10000 ? value + 10000 : value;
  return String(normalized);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

/** Parses `multiverInternalLevelValue` into a newest-first change list. */
function readConstantHistory(value: unknown): CatalogChart["constantHistory"] {
  const record = asRecord(value);
  if (!record) return [];
  const entries = Object.entries(record)
    .map(([version, constant]) => ({
      version: version.trim(),
      constant: typeof constant === "number" ? constant : Number(constant),
    }))
    .filter(
      (entry) => entry.version.length > 0 && Number.isFinite(entry.constant),
    )
    .sort((a, b) => a.version.localeCompare(b.version));
  // Keep only versions where the constant actually changed.
  const changes: Array<{
    version: string;
    constant: number;
    change: number | null;
  }> = [];
  for (const entry of entries) {
    const previous = changes[changes.length - 1];
    if (previous && previous.constant === entry.constant) continue;
    changes.push({
      version: entry.version,
      constant: entry.constant,
      change:
        previous === undefined
          ? null
          : Math.round((entry.constant - previous.constant) * 10) / 10,
    });
  }
  if (new Set(changes.map((entry) => entry.constant)).size < 2) return [];
  return changes.reverse();
}

function readNoteCounts(value: unknown): CatalogNoteCounts {
  const record = asRecord(value);
  return {
    tap: asNumber(record?.tap),
    hold: asNumber(record?.hold),
    slide: asNumber(record?.slide),
    touch: asNumber(record?.touch),
    break: asNumber(record?.break),
    air: asNumber(record?.air),
    flick: asNumber(record?.flick),
    total: asNumber(record?.total),
  };
}

function readRegions(value: unknown): CatalogChart["regions"] {
  const record = asRecord(value);
  return {
    jp: asBoolean(record?.jp),
    intl: asBoolean(record?.intl),
    usa: asBoolean(record?.usa),
    cn: asBoolean(record?.cn),
  };
}

function readStringList(value: unknown): string[] {
  return asArray(value)
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function buildSearchText(
  song: Pick<CatalogSong, "id" | "title" | "artist" | "aliases"> & {
    songNumbers?: Array<string | null>;
    noteDesigners?: Array<string | null>;
  },
  extraKeywords: string[],
): string {
  // Mirrors the clients' matcher: title, artist, aliases, ids, chart designers
  // and the per-song acronyms all take part in one normalized haystack.
  return normalizeSearchText(
    [
      song.title,
      song.artist,
      song.id,
      ...song.aliases,
      ...extraKeywords,
      ...(song.songNumbers ?? []).filter((value): value is string =>
        Boolean(value),
      ),
      ...(song.noteDesigners ?? []).filter((value): value is string =>
        Boolean(value),
      ),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）：${url}`);
  }
  return response.json();
}

type CommunityIndex = {
  aliasesByTitle: Map<string, string[]>;
  coverByTitle: Map<string, string>;
};

function parseCommunityIndex(raw: unknown): CommunityIndex {
  const record = asRecord(raw);
  const aliasesByTitle = new Map<string, string[]>();
  const coverByTitle = new Map<string, string>();
  for (const [key, value] of Object.entries(asRecord(record?.songs) ?? {})) {
    const aliases = readStringList(value);
    if (aliases.length > 0) {
      aliasesByTitle.set(key, aliases);
    }
  }
  for (const entry of asArray(record?.catalog)) {
    const row = asRecord(entry);
    const identifier = asString(row?.songIdentifier) ?? asString(row?.id);
    const cover = asString(row?.coverUrl);
    if (identifier && cover) {
      coverByTitle.set(identifier, cover);
    }
  }
  return { aliasesByTitle, coverByTitle };
}

function mergeAliases(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const alias of group ?? []) {
      const trimmed = alias.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function readCoverBase(manifest: JsonRecord): {
  primary: string | null;
  fallback: string | null;
} {
  const assets = asRecord(manifest.assets);
  return {
    primary: asString(assets?.coverBaseUrl) ?? asString(assets?.jacketBaseUrl),
    fallback:
      asString(assets?.coverFallbackBaseUrl) ??
      asString(assets?.jacketFallbackBaseUrl),
  };
}

function joinAssetUrl(
  base: string | null,
  fileName: string | null,
): string | null {
  if (!base || !fileName) return null;
  return `${base.replace(/\/+$/u, "")}/${fileName.replace(/^\/+/u, "")}`;
}

function sortOptions(values: Iterable<string>): CatalogOption[] {
  return [...new Set(values)]
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right, "ja"))
    .map((value) => ({ value, label: value }));
}

type NormalizeInput = {
  game: Game;
  manifest: JsonRecord;
  bundle: JsonRecord;
  community: CommunityIndex;
};

function normalizeMaimaid({
  bundle,
  community,
  manifest,
}: NormalizeInput): GameCatalog {
  const resources = asRecord(asRecord(bundle.payload)?.resources);
  const data = asRecord(resources?.data_json) ?? {};
  const fitBySongNumber =
    asRecord(asRecord(resources?.chart_fit)?.charts) ?? {};
  const coverBase = readCoverBase(manifest);
  const songs: CatalogSong[] = [];
  const versionDates = new Map<string, string | null>();
  const categoryValues = new Set<string>();

  for (const entry of asArray(data.versions)) {
    const row = asRecord(entry);
    const version = asString(row?.version);
    if (version) versionDates.set(version, asString(row?.releaseDate));
  }
  for (const entry of asArray(data.songs)) {
    const row = asRecord(entry);
    const title = asString(row?.title) ?? asString(row?.songId);
    if (!title) continue;
    const id = asString(row?.songId) ?? title;
    const category = asString(row?.category);
    const version = asString(row?.version);
    const imageName = asString(row?.imageName);
    const aliases = mergeAliases(community.aliasesByTitle.get(title));
    const acronyms = readStringList(row?.searchAcronyms);
    const charts: CatalogChart[] = [];
    asArray(row?.sheets).forEach((sheetEntry, index) => {
      const sheet = asRecord(sheetEntry);
      const type = asString(sheet?.type) ?? "std";
      const difficulty = asString(sheet?.difficulty) ?? "unknown";
      charts.push({
        id: `${id}:${index}`,
        type,
        difficulty,
        level: asString(sheet?.level) ?? "",
        levelValue: asNumber(sheet?.levelValue),
        internalLevel: null,
        internalLevelValue: asNumber(sheet?.internalLevelValue),
        noteDesigner: asString(sheet?.noteDesigner),
        noteCounts: readNoteCounts(sheet?.noteCounts),
        regions: readRegions(sheet?.regions),
        isSpecial: asBoolean(sheet?.isSpecial) || type === "utage",
        version: asString(sheet?.version) ?? version,
        releaseDate: asString(sheet?.releaseDate),
        songNumber: maimaidSongNumber(asNumber(sheet?.internalId), type),
        fitDifficulty: null,
        fitLevel: null,
        fitSamples: null,
        constantHistory: readConstantHistory(sheet?.multiverInternalLevelValue),
      });
    });
    // Attach community fit data: `chart_fit.charts[songNumber][i]` aligns with
    // the charts of that DX/STD family (index order preserved).
    const searchText = buildSearchText(
      {
        id,
        title,
        artist: asString(row?.artist) ?? "",
        aliases,
        songNumbers: charts.map((chart) => chart.songNumber),
        noteDesigners: charts.map((chart) => chart.noteDesigner),
      },
      acronyms,
    );
    const chartsByNumber = new Map<string, CatalogChart[]>();
    for (const chart of charts) {
      if (!chart.songNumber) continue;
      const group = chartsByNumber.get(chart.songNumber) ?? [];
      group.push(chart);
      chartsByNumber.set(chart.songNumber, group);
    }
    for (const [songNumber, group] of chartsByNumber) {
      const entries = asArray(fitBySongNumber[songNumber]);
      if (entries.length !== group.length) continue;
      group.forEach((chart, index) => {
        const entry = asRecord(entries[index]);
        chart.fitDifficulty = asNumber(entry?.fit_diff);
        chart.fitLevel = asString(entry?.diff);
        chart.fitSamples = asNumber(entry?.cnt);
      });
    }
    if (category) categoryValues.add(category);
    const coverUrl =
      community.coverByTitle.get(title) ??
      joinAssetUrl(coverBase.primary, imageName) ??
      joinAssetUrl(coverBase.fallback, imageName);
    songs.push({
      id,
      title,
      artist: asString(row?.artist) ?? "",
      category,
      version,
      releaseDate: asString(row?.releaseDate),
      bpm: asNumber(row?.bpm),
      isNew: asBoolean(row?.isNew),
      isLocked: asBoolean(row?.isLocked),
      comment: asString(row?.comment),
      coverUrl,
      aliases,
      charts,
      searchText,
      searchTextCompact: compactSearchText(searchText),
    });
  }

  return finalizeCatalog({
    game: "maimaid",
    songs,
    categories: sortOptions(categoryValues),
    versions: buildVersionOptions(asArray(data.versions), versionDates),
    types: buildTypeOptions(asArray(data.types)),
    difficulties: buildDifficultyOptions(asArray(data.difficulties)),
  });
}

function normalizeChunithmd({
  bundle,
  community,
  manifest,
}: NormalizeInput): GameCatalog {
  const catalog = asRecord(bundle.catalog) ?? {};
  const coverBase = readCoverBase(manifest);
  const bundleAliases = asRecord(bundle.aliases) ?? {};
  const songs: CatalogSong[] = [];
  const versionDates = new Map<string, string | null>();
  const categoryValues = new Set<string>();

  for (const entry of asArray(catalog.versions)) {
    const row = asRecord(entry);
    const version = asString(row?.version);
    if (version) versionDates.set(version, asString(row?.releaseDate));
  }
  for (const entry of asArray(catalog.songs)) {
    const row = asRecord(entry);
    const title = asString(row?.title) ?? asString(row?.songId);
    if (!title) continue;
    const id = asString(row?.songId) ?? title;
    const category = asString(row?.category);
    const version = asString(row?.version);
    const imageName = asString(row?.imageName);
    const aliases = mergeAliases(
      community.aliasesByTitle.get(title),
      readStringList(bundleAliases[title]),
    );
    const charts: CatalogChart[] = [];
    asArray(row?.sheets).forEach((sheetEntry, index) => {
      const sheet = asRecord(sheetEntry);
      const type = asString(sheet?.type) ?? "std";
      const difficulty = asString(sheet?.difficulty) ?? "unknown";
      charts.push({
        id: `${id}:${index}`,
        type,
        difficulty,
        level: asString(sheet?.level) ?? "",
        levelValue: asNumber(sheet?.levelValue),
        internalLevel: asString(sheet?.internalLevel),
        internalLevelValue: asNumber(sheet?.internalLevelValue),
        noteDesigner: asString(sheet?.noteDesigner),
        noteCounts: readNoteCounts(sheet?.noteCounts),
        regions: readRegions(sheet?.regions),
        isSpecial: asBoolean(sheet?.isSpecial) || type === "we",
        version: version,
        releaseDate: null,
        songNumber: null,
        fitDifficulty: null,
        fitLevel: null,
        fitSamples: null,
        constantHistory: [],
      });
    });
    if (category) categoryValues.add(category);
    const coverUrl =
      community.coverByTitle.get(title) ??
      joinAssetUrl(coverBase.primary, imageName) ??
      joinAssetUrl(coverBase.fallback, imageName);
    const searchText = buildSearchText(
      {
        id,
        title,
        artist: asString(row?.artist) ?? "",
        aliases,
        noteDesigners: charts.map((chart) => chart.noteDesigner),
      },
      [],
    );
    songs.push({
      id,
      title,
      artist: asString(row?.artist) ?? "",
      category,
      version,
      releaseDate: asString(row?.releaseDate),
      bpm: asNumber(row?.bpm),
      isNew: asBoolean(row?.isNew),
      isLocked: asBoolean(row?.isLocked),
      comment: asString(row?.comment),
      coverUrl,
      aliases,
      charts,
      searchText,
      searchTextCompact: compactSearchText(searchText),
    });
  }

  return finalizeCatalog({
    game: "chunithmd",
    songs,
    categories: sortOptions(categoryValues),
    versions: buildVersionOptions(asArray(catalog.versions), versionDates),
    types: buildTypeOptions(asArray(catalog.types)),
    difficulties: buildDifficultyOptions(asArray(catalog.difficulties)),
  });
}

function buildVersionOptions(
  rows: unknown[],
  dates: Map<string, string | null>,
): CatalogVersionOption[] {
  const options = new Map<string, CatalogVersionOption>();
  for (const entry of rows) {
    const row = asRecord(entry);
    const value = asString(row?.version);
    if (!value) continue;
    options.set(value, {
      value,
      label: asString(row?.abbr) ?? value,
      releaseDate: asString(row?.releaseDate) ?? dates.get(value) ?? null,
    });
  }
  return [...options.values()].sort((left, right) => {
    const leftTime = left.releaseDate ? Date.parse(left.releaseDate) : NaN;
    const rightTime = right.releaseDate ? Date.parse(right.releaseDate) : NaN;
    const leftHasDate = !Number.isNaN(leftTime);
    const rightHasDate = !Number.isNaN(rightTime);
    if (!leftHasDate && !rightHasDate) return 0;
    if (!leftHasDate) return 1;
    if (!rightHasDate) return -1;
    return rightTime - leftTime;
  });
}

function buildTypeOptions(rows: unknown[]): CatalogOption[] {
  const options = new Map<string, CatalogOption>();
  for (const entry of rows) {
    const row = asRecord(entry);
    const value = asString(row?.type);
    if (!value) continue;
    options.set(value, {
      value,
      label: asString(row?.abbr) ?? asString(row?.name) ?? value,
    });
  }
  return [...options.values()];
}

function buildDifficultyOptions(rows: unknown[]): CatalogOption[] {
  const options = new Map<string, CatalogOption>();
  for (const entry of rows) {
    const row = asRecord(entry);
    const value = asString(row?.difficulty);
    if (!value) continue;
    options.set(value, {
      value,
      label: asString(row?.name) ?? value,
      color: asString(row?.color) ?? null,
    });
  }
  return [...options.values()];
}

function finalizeCatalog(
  partial: Omit<GameCatalog, "maxLevel" | "fetchedAt">,
): GameCatalog {
  let maxLevel = 1;
  for (const song of partial.songs) {
    for (const chart of song.charts) {
      const level = chartRatingLevel(partial.game, chart);
      if (level !== null && level <= MAX_REGULAR_LEVEL) {
        maxLevel = Math.max(maxLevel, level);
      }
    }
  }
  return {
    ...partial,
    maxLevel: Math.ceil(Math.max(maxLevel, 10)),
    fetchedAt: Date.now(),
  };
}

const catalogCache = new Map<Game, Promise<GameCatalog>>();

/**
 * Loads manifest → bundle → community index once per game and normalizes the
 * result. The promise is cached so tab switches/game flips do not re-download
 * the ~3–6 MB bundle; failures are evicted so the retry button works.
 */
export function loadGameCatalog(
  game: Game,
  options: { force?: boolean } = {},
): Promise<GameCatalog> {
  if (options.force) catalogCache.delete(game);
  const cached = catalogCache.get(game);
  if (cached) return cached;
  const pending = (async () => {
    const base = GAME_STATIC_BASE[game];
    const [manifestRaw, communityRaw] = await Promise.all([
      fetchJson(`${base}/manifest.json`),
      fetchJson(`${base}/community-index.json`).catch(() => null),
    ]);
    const manifest = asRecord(manifestRaw);
    const bundlePath = asString(manifest?.bundle);
    if (!manifest || !bundlePath) {
      throw new Error("manifest.json 缺少 bundle 路径。");
    }
    const bundle = asRecord(
      await fetchJson(
        `${base}${bundlePath.startsWith("/") ? "" : "/"}${bundlePath}`,
      ),
    );
    if (!bundle) {
      throw new Error("曲库 bundle 格式无效。");
    }
    const input: NormalizeInput = {
      game,
      manifest,
      bundle,
      community: parseCommunityIndex(communityRaw),
    };
    return game === "maimaid"
      ? normalizeMaimaid(input)
      : normalizeChunithmd(input);
  })().catch((error: unknown) => {
    catalogCache.delete(game);
    throw error;
  });
  catalogCache.set(game, pending);
  return pending;
}

export function clearGameCatalogCache(game?: Game): void {
  if (game) {
    catalogCache.delete(game);
    return;
  }
  catalogCache.clear();
}
