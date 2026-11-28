"use client";

import { useEffect, useState } from "react";
import type { Game, RequestFn } from "@/App";
import type {
	LatestBackupProfilesResponse,
	ProfileAvatarResponse,
} from "@/lib/app-types";

const CACHE_TTL_MS = 10 * 60 * 1000;
const SELECTION_CACHE_KEY_PREFIX = "rhythmeta.profileAvatar.selection.v2";
const IMAGE_CACHE_KEY_PREFIX = "rhythmeta.profileAvatar.image.v1";

type AvatarSelection = {
	game: Game;
	backupId: string;
	profileId: string;
	hasAvatar: boolean;
	avatarUrl: string | null;
	cachedAt: number;
};

type CachedImage = {
	avatarDataUrl: string | null;
	avatarUrl: string | null;
	cachedAt: number;
};

export type ProfileAvatarResult = {
	avatarDataUrl: string | null;
	avatarUrl: string | null;
};

const EMPTY_AVATAR: ProfileAvatarResult = {
	avatarDataUrl: null,
	avatarUrl: null,
};

/**
 * Only absolute http(s) URLs are rendered as an image source. LXNS avatar links
 * are the intended case; any other scheme is ignored.
 */
function sanitizeAvatarUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return url.href;
	} catch {
		return null;
	}
}

const avatarInFlight = new Map<string, Promise<string | null>>();

function getSessionStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function readJson<T>(key: string): T | null {
	const storage = getSessionStorage();
	if (!storage) return null;
	try {
		const raw = storage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeJson(key: string, value: unknown) {
	const storage = getSessionStorage();
	if (!storage) return;
	try {
		storage.setItem(key, JSON.stringify(value));
	} catch {
		// Quota or privacy mode: the avatar simply is not cached.
	}
}

function removeKey(key: string) {
	const storage = getSessionStorage();
	if (!storage) return;
	try {
		storage.removeItem(key);
	} catch {
		// noop
	}
}

function isFresh(cachedAt: number): boolean {
	return Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_TTL_MS;
}

function imageCacheKey(selection: Pick<AvatarSelection, "game" | "backupId" | "profileId">): string {
	return `${IMAGE_CACHE_KEY_PREFIX}.${selection.game}.${selection.backupId}.${selection.profileId}`;
}

function selectionCacheKey(game: Game): string {
	return `${SELECTION_CACHE_KEY_PREFIX}.${game}`;
}

function readSelection(game: Game): AvatarSelection | null {
	const cached = readJson<AvatarSelection>(selectionCacheKey(game));
	if (!cached || !cached.game || !cached.backupId || !cached.profileId) {
		return null;
	}
	if (cached.game !== game) return null;
	return { ...cached, avatarUrl: sanitizeAvatarUrl(cached.avatarUrl) };
}

function readImage(selection: AvatarSelection): CachedImage | null {
	const cached = readJson<CachedImage>(imageCacheKey(selection));
	if (!cached) return null;
	return { ...cached, avatarUrl: sanitizeAvatarUrl(cached.avatarUrl) };
}

function readCachedAvatar(game: Game): ProfileAvatarResult | undefined {
	const selection = readSelection(game);
	if (!selection || !isFresh(selection.cachedAt)) {
		return undefined;
	}
	const image = readImage(selection);
	if (!image || !isFresh(image.cachedAt)) {
		return undefined;
	}
	return {
		avatarDataUrl: image.avatarDataUrl,
		avatarUrl: image.avatarUrl ?? selection.avatarUrl,
	};
}

function chooseSelection(
	game: Game,
	payload: LatestBackupProfilesResponse,
): AvatarSelection | null {
	const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
	const profile =
		profiles.find((entry) => entry.active) ?? profiles[0] ?? null;
	if (!profile || !payload.backup?.id) return null;
	return {
		game,
		backupId: payload.backup.id,
		profileId: profile.id,
		hasAvatar: profile.hasAvatar !== false,
		avatarUrl: sanitizeAvatarUrl(profile.avatarUrl),
		cachedAt: Date.now(),
	};
}

const selectionInFlight = new Map<Game, Promise<AvatarSelection | null>>();

async function resolveSelection(
	request: RequestFn,
	game: Game,
): Promise<AvatarSelection | null> {
	const cached = readSelection(game);
	if (cached && isFresh(cached.cachedAt)) {
		return cached;
	}
	const existing = selectionInFlight.get(game);
	if (existing) return existing;
	const pending = (async () => {
		try {
			const payload = await request<LatestBackupProfilesResponse>(
				`${game}/v1/backups/latest/profiles`,
			);
			const selection = chooseSelection(game, payload);
			if (!selection) {
				removeKey(selectionCacheKey(game));
				return null;
			}
			writeJson(selectionCacheKey(game), selection);
			return selection;
		} catch {
			// 404 (no backup) and transient failures both keep the letter fallback.
			return null;
		}
	})().finally(() => {
		selectionInFlight.delete(game);
	});
	selectionInFlight.set(game, pending);
	return pending;
}

async function fetchAvatarDataUrl(
	request: RequestFn,
	selection: AvatarSelection,
): Promise<string | null> {
	const key = imageCacheKey(selection);
	const existing = avatarInFlight.get(key);
	if (existing) return existing;
	const pending = (async () => {
		try {
			const payload = await request<ProfileAvatarResponse>(
				`${selection.game}/v1/backups/latest/profiles/${encodeURIComponent(selection.profileId)}/avatar`,
			);
			const dataUrl =
				typeof payload?.avatarDataUrl === "string" ? payload.avatarDataUrl : "";
			// Only inline data URLs are rendered; third-party avatar links stay hidden.
			return dataUrl.startsWith("data:image/") ? dataUrl : null;
		} catch {
			return null;
		}
	})().finally(() => {
		avatarInFlight.delete(key);
	});
	avatarInFlight.set(key, pending);
	return pending;
}

async function resolveProfileAvatar(
	request: RequestFn,
	game: Game,
): Promise<ProfileAvatarResult> {
	const selection = await resolveSelection(request, game);
	if (!selection) return EMPTY_AVATAR;
	const cachedImage = readImage(selection);
	if (cachedImage && isFresh(cachedImage.cachedAt)) {
		return {
			avatarDataUrl: cachedImage.avatarDataUrl,
			avatarUrl: cachedImage.avatarUrl ?? selection.avatarUrl,
		};
	}
	// Raw avatar bytes win; the LXNS avatar URL is only a fallback source.
	const avatarDataUrl = selection.hasAvatar
		? await fetchAvatarDataUrl(request, selection)
		: null;
	const result: ProfileAvatarResult = {
		avatarDataUrl,
		avatarUrl: selection.avatarUrl,
	};
	const cacheEntry: CachedImage = {
		avatarDataUrl: result.avatarDataUrl,
		avatarUrl: result.avatarUrl,
		cachedAt: Date.now(),
	};
	writeJson(imageCacheKey(selection), cacheEntry);
	return result;
}

/**
 * Avatar of the profile selected in the newest backup (`active` profiles win),
 * cached for 10 minutes in sessionStorage because the profile endpoints share a
 * 60/hour rate limit. Prefers the raw avatar endpoint and falls back to the LXNS
 * `avatarUrl`; failures are silent and fall back to the account initial.
 */
export function useProfileAvatar(
	request: RequestFn,
	game: Game,
): ProfileAvatarResult {
	const [state, setState] = useState<{ game: Game; avatar: ProfileAvatarResult }>(
		() => ({ game, avatar: readCachedAvatar(game) ?? EMPTY_AVATAR }),
	);

	useEffect(() => {
		setState({ game, avatar: readCachedAvatar(game) ?? EMPTY_AVATAR });
		let cancelled = false;
		void resolveProfileAvatar(request, game)
			.then((result) => {
				if (!cancelled) setState({ game, avatar: result });
			})
			.catch(() => {
				// Silent: the account initial stays as the fallback.
			});
		return () => {
			cancelled = true;
		};
	}, [request, game]);

	if (state.game !== game) {
		return readCachedAvatar(game) ?? EMPTY_AVATAR;
	}
	return state.avatar;
}

