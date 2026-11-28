import type { Game } from "@/App";

/**
 * Song detail preferences, remembered per game so that reopening the dialog —
 * or browsing another song — keeps the chart type, difficulty and calculator
 * target the user last picked.
 */
const STORAGE_KEY_PREFIX = "rhythmeta.dashboard.song-detail.v1";

export type SongDetailPrefs = {
  /** Chart type of the last shown chart ("std", "dx", "we", …). */
  type: string | null;
  /** Difficulty of the last shown chart ("basic" … "remaster", "【狂】", …). */
  difficulty: string | null;
  /** Achievement / score target of the tolerance calculator. */
  target: number | null;
};

const EMPTY_PREFS: SongDetailPrefs = {
  type: null,
  difficulty: null,
  target: null,
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readSongDetailPrefs(game: Game): SongDetailPrefs {
  if (typeof window === "undefined") return EMPTY_PREFS;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}.${game}`);
    if (!raw) return EMPTY_PREFS;
    const record = JSON.parse(raw) as Partial<
      Record<keyof SongDetailPrefs, unknown>
    > | null;
    const target = record?.target;
    return {
      type: readString(record?.type),
      difficulty: readString(record?.difficulty),
      target:
        typeof target === "number" && Number.isFinite(target) ? target : null,
    };
  } catch {
    // Malformed or unavailable storage: fall back to the defaults.
    return EMPTY_PREFS;
  }
}

export function writeSongDetailPrefs(game: Game, prefs: SongDetailPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${STORAGE_KEY_PREFIX}.${game}`,
      JSON.stringify(prefs),
    );
  } catch {
    // Private mode or quota exceeded: preferences simply are not remembered.
  }
}
