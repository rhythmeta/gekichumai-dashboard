/**
 * Per-game profile choice of the dashboard, persisted in `localStorage`.
 *
 * The backup data layer (`src/store/backup-data.tsx`) uses this to remember
 * which profile of the newest cloud backup the user is looking at. Only the
 * profile id is stored — never avatar bytes or scores.
 *
 * Storage is best-effort: private mode, disabled storage and quota errors all
 * degrade to "the choice is simply not remembered".
 */
const PROFILE_SELECTION_KEY_PREFIX = "rhythmeta.dashboard.profile.v1.";

/** `localStorage` key holding the selected profile id for one game. */
export function profileSelectionStorageKey(game: string): string {
  return `${PROFILE_SELECTION_KEY_PREFIX}${game}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Storage disabled (private mode / sandboxed iframe).
    return null;
  }
}

/** Stored profile id, or `null` when nothing (valid) is remembered. */
export function readSelectedProfileId(game: string): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const value = storage.getItem(profileSelectionStorageKey(game));
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/** Remembers `profileId`; an empty id clears the stored choice. */
export function persistSelectedProfileId(
  game: string,
  profileId: string | null,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const key = profileSelectionStorageKey(game);
    const trimmed = typeof profileId === "string" ? profileId.trim() : "";
    if (trimmed) {
      storage.setItem(key, trimmed);
    } else {
      storage.removeItem(key);
    }
  } catch {
    // Private mode or quota: the selection simply is not remembered.
  }
}
