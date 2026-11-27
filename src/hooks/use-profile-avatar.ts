"use client";

import { useEffect, useState } from "react";
import type { RequestFn } from "@/App";
import type {
	LatestBackupProfileSummary,
	LatestBackupProfilesResponse,
	ProfileAvatarResponse,
} from "@/lib/app-types";

const GAMES = ["maimaid", "chunithmd"] as const;
type Game = (typeof GAMES)[number];

const CACHE_TTL_MS = 10 * 60 * 1000;
const SELECTION_CACHE_KEY = "rhythmeta.profileAvatar.selection.v1";
const IMAGE_CACHE_KEY_PREFIX = "rhythmeta.profileAvatar.image.v1";

type Candidate = {
	game: Game;
	backupId: string;
	committedAt: string;
	profiles: LatestBackupProfileSummary[];
};

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

let discoveryInFlight: Promise<Candidate[]> | null = null;
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

function readSelection(): AvatarSelection | null {
	const cached = readJson<AvatarSelection>(SELECTION_CACHE_KEY);
	if (!cached || !cached.game || !cached.backupId || !cached.profileId) {
		return null;
	}
	return { ...cached, avatarUrl: sanitizeAvatarUrl(cached.avatarUrl) };
}

function readImage(selection: AvatarSelection): CachedImage | null {
	const cached = readJson<CachedImage>(imageCacheKey(selection));
	if (!cached) return null;
	return { ...cached, avatarUrl: sanitizeAvatarUrl(cached.avatarUrl) };
}

function readCachedAvatar(): ProfileAvatarResult | undefined {
	const selection = readSelection();
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

function commitTime(candidate: Candidate): number {
	const parsed = Date.parse(candidate.committedAt);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function chooseSelection(candidates: Candidate[]): AvatarSelection | null {
	if (candidates.length === 0) return null;
	const withActive = candidates.filter((candidate) =>
		candidate.profiles.some((profile) => profile.active),
	);
	const pool = [...(withActive.length > 0 ? withActive : candidates)].sort(
		(left, right) => commitTime(right) - commitTime(left),
	);
	const chosen = pool[0];
	if (!chosen) return null;
	const profile =
		chosen.profiles.find((entry) => entry.active) ?? chosen.profiles[0];
	if (!profile) return null;
	return {
		game: chosen.game,
		backupId: chosen.backupId,
		profileId: profile.id,
		hasAvatar: profile.hasAvatar !== false,
		avatarUrl: sanitizeAvatarUrl(profile.avatarUrl),
		cachedAt: Date.now(),
	};
}

async function discoverCandidates(request: RequestFn): Promise<Candidate[]> {
	if (!discoveryInFlight) {
		const pending = Promise.all(
			GAMES.map(async (game): Promise<Candidate | null> => {
				try {
					const payload = await request<LatestBackupProfilesResponse>(
						`${game}/v1/backups/latest/profiles`,
					);
					if (
						!payload?.backup?.id ||
						!Array.isArray(payload.profiles) ||
						payload.profiles.length === 0
					) {
						return null;
					}
					return {
						game,
						backupId: payload.backup.id,
						committedAt: payload.backup.committedAt ?? "",
						profiles: payload.profiles,
					};
				} catch {
					// 404 (no backup) and transient failures both keep the letter fallback.
					return null;
				}
			}),
		)
			.then((results) => results.filter((entry): entry is Candidate => entry !== null))
			.finally(() => {
				discoveryInFlight = null;
			});
		discoveryInFlight = pending;
	}
	return discoveryInFlight;
}

async function resolveSelection(request: RequestFn): Promise<AvatarSelection | null> {
	const cached = readSelection();
	if (cached && isFresh(cached.cachedAt)) {
		return cached;
	}
	const selection = chooseSelection(await discoverCandidates(request));
	if (!selection) {
		removeKey(SELECTION_CACHE_KEY);
		return null;
	}
	writeJson(SELECTION_CACHE_KEY, selection);
	return selection;
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
): Promise<ProfileAvatarResult> {
	const selection = await resolveSelection(request);
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
export function useProfileAvatar(request: RequestFn): ProfileAvatarResult {
	const [avatar, setAvatar] = useState<ProfileAvatarResult>(
		() => readCachedAvatar() ?? EMPTY_AVATAR,
	);

	useEffect(() => {
		let cancelled = false;
		void resolveProfileAvatar(request)
			.then((result) => {
				if (!cancelled) setAvatar(result);
			})
			.catch(() => {
				// Silent: the account initial stays as the fallback.
			});
		return () => {
			cancelled = true;
		};
	}, [request]);

	return avatar;
}

