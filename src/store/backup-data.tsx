"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Game, RequestFn } from "@/App";
import type {
  LatestBackupProfileSummary,
  LatestBackupProfilesResponse,
} from "@/lib/app-types";
import {
  decodeBackupSnapshot,
  type BackupProfile,
  type BackupScore,
  type BackupSnapshot,
} from "@/lib/backup-snapshot";
import {
  persistSelectedProfileId,
  readSelectedProfileId,
} from "@/lib/profile-selection";
import { PREVIEW_MODE_ENABLED } from "@/lib/preview-request";

/**
 * Backup data layer for the signed-in dashboard.
 *
 * The newest cloud backup is the only place where a profile's full score list
 * and play history are available: `GET {game}/v1/backups/latest/profiles`
 * returns the profile summaries plus a public `downloadUrl` of a gzipped
 * protobuf snapshot. This provider downloads + decodes that file once per game
 * (5 minute in-memory cache, concurrent loads deduped) and exposes:
 *
 *  - the profiles to pick from (`profiles`, `selectedProfile`, `selectProfile`),
 *  - the best score of the selected profile for a chart (`scoreFor`),
 *  - the play history of the selected profile for a chart (`playsFor`).
 *
 * Chart keys are the native apps' stable keys (`backupChartKey` in
 * `src/lib/backup-snapshot.ts`), e.g. `7:1234567|master|master` for maimaid and
 * `1234:master:master` for chunithmd.
 *
 * Avatars decoded from the backup live in memory only: they are exposed as
 * `data:image/...;base64,...` URLs and never written to `localStorage`.
 */

export type BackupProfileView = {
  id: string;
  name: string;
  server: string | null;
  active: boolean;
  playerRating: number | null;
  plate: string | null;
  title: string | null;
  avatarDataUrl: string | null;
  avatarUrl: string | null;
};

export type BackupScoreView = {
  profileId: string;
  chartKey: string;
  achievement: number;
  rank: string;
  dxScore: number;
  score: number;
  fc: string | null;
  fs: string | null;
  clear: string | null;
  /** Unix milliseconds; `0` when the backup does not carry a timestamp. */
  achievedAt: number;
};

export type BackupPlayView = BackupScoreView & { id: string };

export type BackupDataValue = {
  status: "loading" | "ready" | "empty" | "error";
  game: Game;
  backupId: string | null;
  committedAt: string | null;
  profiles: BackupProfileView[];
  selectedProfileId: string | null;
  selectedProfile: BackupProfileView | null;
  selectProfile: (profileId: string) => void;
  /** Best (latest) score of the selected profile for a chart key. */
  scoreFor: (chartKey: string) => BackupScoreView | null;
  /** Play history of the selected profile for a chart key, newest first. */
  playsFor: (chartKey: string) => BackupPlayView[];
  /** Song ids the client marked as favourites (maimaid: numeric ids, chunithmd: bundle ids). */
  favoriteSongIds: Set<string>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

/**
 * Shape of the `backup` object as far as this layer needs it. The response type
 * in `app-types.ts` does not (yet) declare `downloadUrl`, so the extra field is
 * read defensively.
 */
type BackupReference = {
  id?: unknown;
  committedAt?: unknown;
  downloadUrl?: unknown;
};

type ChartIndex<T> = Map<string, T[]>;

type LoadedBackup = {
  game: Game;
  backupId: string;
  committedAt: string | null;
  profiles: BackupProfileView[];
  scoresByChart: ChartIndex<BackupScoreView>;
  playsByChart: ChartIndex<BackupPlayView>;
  favoriteSongIds: Set<string>;
  /** Dev/preview only: chart entries are generated on demand (see below). */
  preview: boolean;
};

type ProviderState = {
  status: BackupDataValue["status"];
  game: Game;
  backupId: string | null;
  committedAt: string | null;
  profiles: BackupProfileView[];
  data: LoadedBackup | null;
};

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toPositiveNumber(value: unknown): number | null {
  const number = toFiniteNumber(value, 0);
  return number > 0 ? number : null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveBackupDownloadUrl(downloadUrl: string): string {
	if (typeof window === "undefined") return downloadUrl;

	try {
		const url = new URL(downloadUrl, window.location.origin);
		const backupOrigin = new URL(
			process.env.NEXT_PUBLIC_BACKUP_BASE_URL ?? "https://backups.rhythmeta.org",
		).origin;
		if (url.origin !== backupOrigin || !url.pathname.startsWith("/backups/")) {
			return url.href;
		}
		return `${window.location.origin}${url.pathname}${url.search}`;
	} catch {
		return downloadUrl;
	}
}

/** Only absolute http(s) URLs are rendered as `<img src>` fallbacks. */
function sanitizeAvatarUrl(value: unknown): string | null {
  const trimmed = toNonEmptyString(value);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Protobuf varint timestamps are written in milliseconds by the native apps,
 * but some builds only have second resolution. Values that cannot be
 * milliseconds for any plausible play (`< 1e11`, i.e. before 1973) are treated
 * as seconds. Missing / zero timestamps stay `0`.
 */
function toEpochMs(value: unknown): number {
  const raw = toFiniteNumber(value, 0);
  if (raw <= 0) return 0;
  return raw < 100_000_000_000 ? Math.round(raw * 1000) : Math.round(raw);
}

function base64FromBytes(bytes: Uint8Array): string | null {
  if (typeof btoa !== "function") return null;
  let binary = "";
  const chunkSize = 0x2000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  try {
    return btoa(binary);
  } catch {
    return null;
  }
}

/** Image type sniffing on the magic bytes; PNG is the default. */
function detectImageMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

/** `data:` URL for non-empty avatar bytes from the backup; `null` otherwise. */
function avatarDataUrlFromBytes(
  avatar: Uint8Array | null | undefined,
): string | null {
  if (!avatar || avatar.length === 0) return null;
  const base64 = base64FromBytes(avatar);
  if (!base64) return null;
  return `data:${detectImageMime(avatar)};base64,${base64}`;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

function snapshotProfileToView(profile: BackupProfile): BackupProfileView {
  return {
    id: profile.id,
    name: toNonEmptyString(profile.name) ?? profile.id,
    server: toNonEmptyString(profile.server),
    active: profile.active === true,
    playerRating: toPositiveNumber(profile.playerRating),
    plate: toNonEmptyString(profile.plate),
    title: toNonEmptyString(profile.title),
    avatarDataUrl: avatarDataUrlFromBytes(profile.avatar),
    avatarUrl: sanitizeAvatarUrl(profile.avatarUrl),
  };
}

/**
 * JSON summaries keep their order; the decoded snapshot is authoritative for
 * every field it carries (avatar bytes, `active`, rating, plate, title), while
 * the summary supplies the LXNS `avatarUrl` fallback. Profiles that only exist
 * in the snapshot are appended in snapshot order.
 */
function mergeProfiles(
  summaries: LatestBackupProfileSummary[],
  snapshotProfiles: BackupProfile[] | null,
): BackupProfileView[] {
  const snapshotById = new Map<string, BackupProfileView>();
  for (const profile of snapshotProfiles ?? []) {
    const id = toNonEmptyString(profile?.id);
    if (!id) continue;
    snapshotById.set(id, snapshotProfileToView(profile));
  }

  const merged: BackupProfileView[] = [];
  const seen = new Set<string>();
  for (const summary of summaries) {
    const id = toNonEmptyString(summary?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const fromSnapshot = snapshotById.get(id) ?? null;
    merged.push({
      id,
      name: fromSnapshot?.name ?? toNonEmptyString(summary.name) ?? id,
      server: fromSnapshot?.server ?? toNonEmptyString(summary.server),
      active: fromSnapshot ? fromSnapshot.active : summary.active === true,
      playerRating:
        fromSnapshot?.playerRating ?? toPositiveNumber(summary.playerRating),
      plate: fromSnapshot?.plate ?? toNonEmptyString(summary.plate),
      title: fromSnapshot?.title ?? toNonEmptyString(summary.title),
      avatarDataUrl: fromSnapshot?.avatarDataUrl ?? null,
      avatarUrl:
        fromSnapshot?.avatarUrl ?? sanitizeAvatarUrl(summary.avatarUrl),
    });
  }

  for (const [id, view] of snapshotById) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(view);
  }

  return merged;
}

type ProfileSelection = { id: string; persist: boolean };

/**
 * Default profile: the remembered choice while it still exists in the newest
 * backup, else the backup's `active` profile, else the first profile.
 *
 * The dashboard remembers an explicit choice, so someone who switched to a
 * non-active profile keeps it across reloads; without a remembered choice the
 * `active` profile of the backup wins. A remembered id that disappeared from
 * the newest backup falls back to the backup's `active` profile and is
 * persisted again so a stale id does not survive another reload.
 */
function resolveProfileSelection(
  profiles: BackupProfileView[],
  storedId: string | null,
): ProfileSelection | null {
  if (profiles.length === 0) return null;
  const stored = storedId
    ? (profiles.find((profile) => profile.id === storedId) ?? null)
    : null;
  const active = profiles.find((profile) => profile.active) ?? null;
  const chosen = stored ?? active ?? profiles[0];
  return {
    id: chosen.id,
    persist: storedId !== null && stored === null && chosen.id !== storedId,
  };
}

// ---------------------------------------------------------------------------
// Scores and play records
// ---------------------------------------------------------------------------

/** Composite key so lookups stay O(1) once the selected profile is known. */
function chartIndexKey(profileId: string, chartKey: string): string {
  return `${profileId}\u0001${chartKey}`;
}

function newestFirst(
  a: { achievedAt: number },
  b: { achievedAt: number },
): number {
  return b.achievedAt - a.achievedAt;
}

function toScoreView(score: BackupScore): BackupScoreView {
  return {
    profileId: toNonEmptyString(score?.profileId) ?? "",
    chartKey: toNonEmptyString(score?.chartKey) ?? "",
    achievement: toFiniteNumber(score?.achievement),
    rank: typeof score?.rank === "string" ? score.rank : "",
    dxScore: toFiniteNumber(score?.dxScore),
    score: toFiniteNumber(score?.score),
    fc: toNonEmptyString(score?.fc),
    fs: toNonEmptyString(score?.fs),
    clear: toNonEmptyString(score?.clear),
    achievedAt: toEpochMs(score?.achievedAt),
  };
}

function pushIndexed<T>(index: ChartIndex<T>, key: string, value: T): void {
  const list = index.get(key);
  if (list) {
    list.push(value);
  } else {
    index.set(key, [value]);
  }
}

function buildIndexes(snapshot: BackupSnapshot): {
  scoresByChart: ChartIndex<BackupScoreView>;
  playsByChart: ChartIndex<BackupPlayView>;
} {
  const scoresByChart: ChartIndex<BackupScoreView> = new Map();
  for (const score of snapshot.scores ?? []) {
    const view = toScoreView(score);
    if (!view.profileId || !view.chartKey) continue;
    pushIndexed(
      scoresByChart,
      chartIndexKey(view.profileId, view.chartKey),
      view,
    );
  }
  for (const list of scoresByChart.values()) list.sort(newestFirst);

  const playsByChart: ChartIndex<BackupPlayView> = new Map();
  for (const play of snapshot.playRecords ?? []) {
    if (!play?.result) continue;
    const view: BackupPlayView = {
      ...toScoreView(play.result),
      id: toNonEmptyString(play.id) ?? "",
    };
    if (!view.profileId || !view.chartKey) continue;
    pushIndexed(
      playsByChart,
      chartIndexKey(view.profileId, view.chartKey),
      view,
    );
  }
  for (const list of playsByChart.values()) list.sort(newestFirst);

  return { scoresByChart, playsByChart };
}

// ---------------------------------------------------------------------------
// Dev/preview-only pseudo scores
//
// `NEXT_PUBLIC_PREVIEW_MODE=1` answers every request from the fixtures in
// `src/lib/preview-request.ts`; there is no byte-compatible backup file to
// download, so the real snapshot (and therefore every score) is missing. These
// helpers derive stable pseudo scores from a small hash of the chart key so the
// description/score dialogs can still be demoed. This block never runs in a
// production build (the env var is inlined at build time) and must never be
// used for real data.
// ---------------------------------------------------------------------------

function hashString(value: string): number {
  let hash = 0x811c9dc5; // FNV-1a, 32 bit
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Stable for a whole calendar day, so repeated demos show the same dates. */
function previewTodayMs(): number {
  return Math.floor(Date.now() / DAY_MS) * DAY_MS;
}

/** Favourites shown in preview mode (real ids so the filter has something to match). */
const PREVIEW_FAVOURITES: Record<Game, readonly string[]> = {
  maimaid: ["12025", "10181", "181", "1639", "11639"],
  chunithmd: ["B.B.K.K.B.K.K.", "初音ミクの消失", "千本桜"],
};

const PREVIEW_MAIMAID_FC = [null, "fc", "fcp", "ap"] as const;
const PREVIEW_MAIMAID_FS = [null, "fs", "fsp", "fsd"] as const;
/** CHUNITHM only has FC / AJ / AJC lamps — there is no FSD, and the chain field
 *  uses the same vocabulary. */
const PREVIEW_CHUNITHMD_LAMPS = [null, "FC", "AJ", "AJC"] as const;

function previewRank(achievement: number): string {
  if (achievement >= 100.5) return "SSS+";
  if (achievement >= 100) return "SSS";
  if (achievement >= 99) return "SS+";
  if (achievement >= 98) return "SS";
  if (achievement >= 97) return "S+";
  if (achievement >= 95) return "S";
  return "A";
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildPreviewChart(
  game: Game,
  profileId: string,
  chartKey: string,
): { scores: BackupScoreView[]; plays: BackupPlayView[] } {
  const seed = hashString(`${profileId}\u0001${chartKey}`);
  const today = previewTodayMs();
  // Three plays spread over the last ~90 days; the newest one is the current
  // best, so older plays always score a little lower (like a real best-score
  // entry that survives later attempts).
  const daysAgo = [
    seed % 25,
    30 + ((seed >>> 5) % 30),
    60 + ((seed >>> 10) % 30),
  ];
  const best = 95.5 + (seed % 500_000) / 100_000;
  const plays: BackupPlayView[] = daysAgo.map((days, index) => {
    const playSeed = hashString(`${chartKey}\u0002${profileId}\u0002${index}`);
    const achievement = Math.max(
      95,
      Math.min(100.5, round4(best - index * 0.42 - (playSeed % 40) / 100)),
    );
    const ratio = (achievement - 95) / 5.5;
    const fc =
      game === "maimaid"
        ? PREVIEW_MAIMAID_FC[(playSeed >>> 3) % PREVIEW_MAIMAID_FC.length]
        : PREVIEW_CHUNITHMD_LAMPS[
            (playSeed >>> 3) % PREVIEW_CHUNITHMD_LAMPS.length
          ];
    const fs =
      game === "maimaid"
        ? PREVIEW_MAIMAID_FS[(playSeed >>> 7) % PREVIEW_MAIMAID_FS.length]
        : PREVIEW_CHUNITHMD_LAMPS[
            (playSeed >>> 7) % PREVIEW_CHUNITHMD_LAMPS.length
          ];
    return {
      id: `preview-play-${playSeed.toString(36)}-${index}`,
      profileId,
      chartKey,
      achievement,
      rank: previewRank(achievement),
      dxScore: Math.round(1500 + ratio * 400),
      score: Math.round(950_000 + ratio * 60_000),
      fc,
      fs,
      clear: "clear",
      achievedAt: today - days * DAY_MS,
    };
  });
  plays.sort(newestFirst);
  // The best score mirrors the newest play, like a real backup would.
  const { id: _playId, ...bestScore } = plays[0];
  void _playId;
  return { scores: [bestScore], plays };
}

/** Fills both indexes for a chart on first use (preview only). */
function ensurePreviewChart(
  data: LoadedBackup,
  profileId: string,
  chartKey: string,
): void {
  if (!data.preview) return;
  const key = chartIndexKey(profileId, chartKey);
  if (data.scoresByChart.has(key) && data.playsByChart.has(key)) return;
  const generated = buildPreviewChart(data.game, profileId, chartKey);
  data.scoresByChart.set(key, generated.scores);
  data.playsByChart.set(key, generated.plays);
}

// ---------------------------------------------------------------------------
// Loading (module-level cache + concurrent-load dedupe)
// ---------------------------------------------------------------------------

const cache = new Map<Game, { at: number; data: LoadedBackup }>();
const inFlight = new Map<Game, Promise<LoadedBackup | null>>();

function readCached(game: Game): LoadedBackup | null {
  const entry = cache.get(game);
  if (!entry) return null;
  if (Date.now() - entry.at >= CACHE_TTL_MS) {
    cache.delete(game);
    return null;
  }
  return entry.data;
}

/** Drops the in-memory cache (e.g. when the signed-in account changes). */
export function clearBackupDataCache(): void {
  cache.clear();
  inFlight.clear();
}

async function loadGameBackup(
  game: Game,
  request: RequestFn,
): Promise<LoadedBackup | null> {
  let payload: LatestBackupProfilesResponse;
  try {
    payload = await request<LatestBackupProfilesResponse>(
      `${game}/v1/backups/latest/profiles`,
    );
  } catch {
    // No backup yet (404), expired session, offline: the UI shows "empty".
    return null;
  }

  const summaries = Array.isArray(payload?.profiles) ? payload.profiles : [];
  const backup: BackupReference = payload?.backup ?? {};
  const backupId = toNonEmptyString(backup.id);
  if (!backupId) return null;
  const committedAt = toNonEmptyString(backup.committedAt);

  // Preview mode has no real backup file: skip the download + decode entirely.
  if (PREVIEW_MODE_ENABLED) {
    return {
      game,
      backupId,
      committedAt,
      profiles: mergeProfiles(summaries, null),
      scoresByChart: new Map(),
      playsByChart: new Map(),
      favoriteSongIds: new Set(PREVIEW_FAVOURITES[game]),
      preview: true,
    };
  }

  const downloadUrl = toNonEmptyString(backup.downloadUrl);
  let snapshot: BackupSnapshot | null = null;
  if (downloadUrl) {
    try {
      // Public object storage: plain fetch, never through `request` (which
      // prefixes the API base URL and attaches the access token).
      const response = await fetch(resolveBackupDownloadUrl(downloadUrl), {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`backup download failed (${response.status})`);
      }
      snapshot = await decodeBackupSnapshot(await response.arrayBuffer());
    } catch {
      // Keep the JSON profile summaries; only the scores are missing.
      snapshot = null;
    }
  }

  const profiles = mergeProfiles(summaries, snapshot?.profiles ?? null);
  const indexes = snapshot
    ? buildIndexes(snapshot)
    : { scoresByChart: new Map(), playsByChart: new Map() };

  return {
    game,
    backupId,
    committedAt,
    favoriteSongIds: new Set(snapshot?.favoriteSongIds ?? []),
    profiles,
    scoresByChart: indexes.scoresByChart,
    playsByChart: indexes.playsByChart,
    preview: false,
  };
}

function loadShared(
  game: Game,
  request: RequestFn,
): Promise<LoadedBackup | null> {
  const cached = readCached(game);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(game);
  if (pending) return pending;
  const promise = loadGameBackup(game, request)
    .then((data) => {
      // Only successful loads are cached: "empty" must be re-checked when
      // the user creates the first backup.
      if (data) cache.set(game, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      if (inFlight.get(game) === promise) inFlight.delete(game);
    });
  inFlight.set(game, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Provider + hook
// ---------------------------------------------------------------------------

function loadingState(game: Game): ProviderState {
  return {
    status: "loading",
    game,
    backupId: null,
    committedAt: null,
    profiles: [],
    data: null,
  };
}

function emptyState(game: Game): ProviderState {
  return {
    status: "empty",
    game,
    backupId: null,
    committedAt: null,
    profiles: [],
    data: null,
  };
}

function errorState(game: Game): ProviderState {
  return {
    status: "error",
    game,
    backupId: null,
    committedAt: null,
    profiles: [],
    data: null,
  };
}

const EMPTY_PLAYS: BackupPlayView[] = [];

const EMPTY_FAVORITES: Set<string> = new Set();

const SAFE_EMPTY_VALUE: BackupDataValue = {
  status: "empty",
  game: "maimaid",
  backupId: null,
  committedAt: null,
  profiles: [],
  selectedProfileId: null,
  selectedProfile: null,
  selectProfile: () => {},
  scoreFor: () => null,
  playsFor: () => EMPTY_PLAYS,
  favoriteSongIds: EMPTY_FAVORITES,
};

const BackupDataContext = createContext<BackupDataValue | null>(null);

export function BackupDataProvider({
  game,
  request,
  children,
}: {
  game: Game;
  request: RequestFn;
  children: ReactNode;
}): ReactElement {
  const [state, setState] = useState<ProviderState>(() => loadingState(game));
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setState(loadingState(game));
    setSelectedProfileId(null);

    void loadShared(game, request)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState(emptyState(game));
          return;
        }
        const storedId = readSelectedProfileId(game);
        const selection = resolveProfileSelection(data.profiles, storedId);
        if (selection?.persist) {
          persistSelectedProfileId(game, selection.id);
        }
        setSelectedProfileId(selection?.id ?? null);
        setState({
          // A backup without profiles cannot be picked from; treat it
          // like "no backup" so the UI can show its empty state.
          status: data.profiles.length > 0 ? "ready" : "empty",
          game,
          backupId: data.backupId,
          committedAt: data.committedAt,
          profiles: data.profiles,
          data,
        });
      })
      .catch(() => {
        // Defensive: an unexpected failure must never crash the app.
        if (!cancelled) setState(errorState(game));
      });

    return () => {
      cancelled = true;
    };
  }, [game, request]);

  const selectProfile = useCallback(
    (profileId: string) => {
      const trimmed = typeof profileId === "string" ? profileId.trim() : "";
      if (!trimmed) return;
      setSelectedProfileId(trimmed);
      persistSelectedProfileId(game, trimmed);
    },
    [game],
  );

  // Ignore the previous game's data for the one render between a `game`
  // change and the loading effect.
  const current = state.game === game ? state : loadingState(game);
  const currentProfileId = state.game === game ? selectedProfileId : null;

  const selectedProfile = useMemo(
    () =>
      current.profiles.find((profile) => profile.id === currentProfileId) ??
      null,
    [current.profiles, currentProfileId],
  );

  const scoreFor = useCallback(
    (chartKey: string): BackupScoreView | null => {
      const data = current.data;
      if (!data || !currentProfileId || !chartKey) return null;
      // Dev/preview only (see the pseudo-score block above).
      ensurePreviewChart(data, currentProfileId, chartKey);
      const list = data.scoresByChart.get(
        chartIndexKey(currentProfileId, chartKey),
      );
      if (!list || list.length === 0) return null;
      let best = list[0];
      for (const candidate of list) {
        if (candidate.achievedAt > best.achievedAt) best = candidate;
      }
      return best;
    },
    [current.data, currentProfileId],
  );

  const playsFor = useCallback(
    (chartKey: string): BackupPlayView[] => {
      const data = current.data;
      if (!data || !currentProfileId || !chartKey) return EMPTY_PLAYS;
      // Dev/preview only (see the pseudo-score block above).
      ensurePreviewChart(data, currentProfileId, chartKey);
      // Newest first; treat the returned list as read-only.
      return (
        data.playsByChart.get(chartIndexKey(currentProfileId, chartKey)) ??
        EMPTY_PLAYS
      );
    },
    [current.data, currentProfileId],
  );

  const value = useMemo<BackupDataValue>(
    () => ({
      status: current.status,
      game: current.game,
      backupId: current.backupId,
      committedAt: current.committedAt,
      profiles: current.profiles,
      selectedProfileId: currentProfileId,
      selectedProfile,
      selectProfile,
      scoreFor,
      playsFor,
      favoriteSongIds: current.data?.favoriteSongIds ?? EMPTY_FAVORITES,
    }),
    [
      current,
      currentProfileId,
      selectedProfile,
      selectProfile,
      scoreFor,
      playsFor,
    ],
  );

  return (
    <BackupDataContext.Provider value={value}>
      {children}
    </BackupDataContext.Provider>
  );
}

/**
 * Backup data of the signed-in dashboard. Safe outside the provider (renders
 * the "empty" value instead of throwing) so components can be reused in
 * stories/tests without the provider.
 */
export function useBackupData(): BackupDataValue {
  return useContext(BackupDataContext) ?? SAFE_EMPTY_VALUE;
}
