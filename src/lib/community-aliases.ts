import type { Game, RequestFn } from "@/App";
import type {
  ApprovedAliasRow,
  ApprovedAliasesResponse,
} from "@/lib/app-types";

/**
 * Approved community aliases (Rhythmeta's own curation board), cached per game.
 * These are *not* the LXNS aliases that ship inside the static catalog bundle:
 * the dialog shows the bundle ones solid and these dashed.
 *
 * The sync endpoint is public and allows 120 requests/min/IP, so one fetch per
 * game and session is enough.
 */
const cache = new Map<Game, ApprovedAliasRow[]>();
const inFlight = new Map<Game, Promise<ApprovedAliasRow[]>>();

export function readCachedCommunityAliases(
  game: Game,
): ApprovedAliasRow[] | null {
  return cache.get(game) ?? null;
}

export async function loadCommunityAliases(
  request: RequestFn,
  game: Game,
): Promise<ApprovedAliasRow[]> {
  const cached = cache.get(game);
  if (cached) return cached;
  let pending = inFlight.get(game);
  if (!pending) {
    pending = request<ApprovedAliasesResponse>(
      `${game}/v1/community/aliases:sync`,
      { auth: false },
    )
      .then((payload) => {
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];
        cache.set(game, rows);
        return rows;
      })
      .finally(() => {
        inFlight.delete(game);
      });
    inFlight.set(game, pending);
  }
  return pending;
}

/** Alias texts approved for one song, minus the ones already shipped in the bundle. */
export function communityAliasesForSong(
  rows: ApprovedAliasRow[],
  songId: string,
  knownAliases: string[],
): string[] {
  const known = new Set(
    knownAliases.map((alias) => alias.trim().toLowerCase()),
  );
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    if (row.songIdentifier !== songId) continue;
    const text = row.aliasText.trim();
    const normalized = text.toLowerCase();
    if (!text || known.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(text);
  }
  return result;
}
