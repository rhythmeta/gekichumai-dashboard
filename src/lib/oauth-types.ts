/**
 * Shared OAuth developer-platform types, scope catalogue and validators.
 *
 * The field names mirror the backend contract (`/auth/v1/oauth/*` and `/oauth/v1/*`)
 * exactly; see `/tmp/rhythmeta-oauth/contract.md` (contract v1).
 */

export const OAUTH_APP_LIMIT = 5;
export const OAUTH_NAME_MAX = 60;
export const OAUTH_DESCRIPTION_MAX = 600;
export const OAUTH_WEBSITE_MAX = 300;
export const OAUTH_REDIRECT_URI_MAX = 512;
export const OAUTH_REDIRECT_URI_LIMIT = 5;
export const OAUTH_REVIEW_NOTE_MAX = 1000;
/** Backend rejects icon data URLs longer than this. */
export const OAUTH_ICON_DATA_URL_MAX = 262144;
/** Upload picker limit shown to developers. */
export const OAUTH_ICON_MAX_BYTES = 256 * 1024;

export const OAUTH_ICON_DATA_URL_PATTERN =
	/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/u;

/** Fixed scope order shared by backend and dashboard. */
export const OAUTH_SCOPES = [
	"openid",
	"profile",
	"backup.read.maimaid",
	"backup.read.chunithmd",
	"backup.write.maimaid",
	"backup.write.chunithmd",
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export type OAuthGame = "maimaid" | "chunithmd";

/** i18n namespaces that carry the shared scope catalogue. */
export type OAuthI18nNamespace =
	| "developer"
	| "oauthApps"
	| "oauthConsent"
	| "oauthDevice";

export const OAUTH_GAMES: readonly OAuthGame[] = ["maimaid", "chunithmd"];

export type ScopeGroupId = "identity" | "api";

export const SCOPE_GROUP: Record<OAuthScope, ScopeGroupId> = {
	openid: "identity",
	// "Read your profile" belongs to the API access group (user decision).
	profile: "api",
	"backup.read.maimaid": "api",
	"backup.read.chunithmd": "api",
	"backup.write.maimaid": "api",
	"backup.write.chunithmd": "api",
};

export const SCOPE_GROUP_ORDER: readonly ScopeGroupId[] = ["identity", "api"];

export const SCOPE_GROUP_I18N_KEY: Record<ScopeGroupId, string> = {
	identity: "scopeGroup.identity",
	api: "scopeGroup.api",
};

/** i18n key segments: dots inside scope ids would be read as nesting by i18next. */
export const SCOPE_I18N_KEY: Record<OAuthScope, string> = {
	openid: "scope.openid",
	profile: "scope.profile",
	"backup.read.maimaid": "scope.backupReadMaimaid",
	"backup.read.chunithmd": "scope.backupReadChunithmd",
	"backup.write.maimaid": "scope.backupWriteMaimaid",
	"backup.write.chunithmd": "scope.backupWriteChunithmd",
};

/** `backup.write.<game>` implies `backup.read.<game>`. */
export const scopeDependencies: Record<OAuthScope, readonly OAuthScope[]> = {
	openid: [],
	profile: [],
	"backup.read.maimaid": [],
	"backup.read.chunithmd": [],
	"backup.write.maimaid": ["backup.read.maimaid"],
	"backup.write.chunithmd": ["backup.read.chunithmd"],
};

const OAUTH_SCOPE_LOOKUP: ReadonlySet<string> = new Set(OAUTH_SCOPES);

export function isOAuthScope(value: string): value is OAuthScope {
	return OAUTH_SCOPE_LOOKUP.has(value);
}

export function parseScopeList(input: Iterable<string> | string): OAuthScope[] {
	const values =
		typeof input === "string" ? input.split(/[\s,]+/u) : Array.from(input);
	return normalizeScopes(values);
}

/**
 * De-duplicates, expands write -> read and sorts into the canonical scope order.
 * Unknown scopes are dropped so the UI never renders an undefined permission.
 */
export function normalizeScopes(input: Iterable<string>): OAuthScope[] {
	const wanted = new Set<OAuthScope>();
	for (const raw of input) {
		const value = raw.trim();
		if (!isOAuthScope(value)) continue;
		wanted.add(value);
		for (const dependency of scopeDependencies[value]) {
			wanted.add(dependency);
		}
	}
	return OAUTH_SCOPES.filter((scope) => wanted.has(scope));
}

export function hasScope(
	scopes: Iterable<string>,
	scope: OAuthScope,
): boolean {
	for (const value of scopes) {
		if (value === scope) return true;
	}
	return false;
}

export function hasAnyScope(
	scopes: Iterable<string>,
	candidates: readonly OAuthScope[],
): boolean {
	return candidates.some((scope) => hasScope(scopes, scope));
}

export function readScopeGames(scopes: Iterable<string>): OAuthGame[] {
	return OAUTH_GAMES.filter((game) => hasScope(scopes, `backup.read.${game}`));
}

export function writeScopeGames(scopes: Iterable<string>): OAuthGame[] {
	return OAUTH_GAMES.filter((game) =>
		hasScope(scopes, `backup.write.${game}`),
	);
}

export function isWriteScope(scope: OAuthScope): boolean {
	return scope.startsWith("backup.write.");
}

/**
 * Adds/removes a scope (and its implied scopes) while keeping the canonical order.
 * Removing `backup.read.<game>` also clears `backup.write.<game>` because the
 * write scope cannot be held without read.
 */
export function toggleScopeSelection(
	current: Iterable<string>,
	scope: OAuthScope,
	selected: boolean,
): OAuthScope[] {
	const next = new Set<OAuthScope>(normalizeScopes(current));
	if (selected) {
		next.add(scope);
		for (const dependency of scopeDependencies[scope]) {
			next.add(dependency);
		}
	} else {
		next.delete(scope);
		for (const candidate of OAUTH_SCOPES) {
			if (scopeDependencies[candidate].includes(scope)) {
				next.delete(candidate);
			}
		}
	}
	return OAUTH_SCOPES.filter((value) => next.has(value));
}

export function groupScopesByCategory(
	scopes: Iterable<string>,
): Array<{ group: ScopeGroupId; scopes: OAuthScope[] }> {
	const normalized = normalizeScopes(scopes);
	return SCOPE_GROUP_ORDER.map((group) => ({
		group,
		scopes: normalized.filter((scope) => SCOPE_GROUP[scope] === group),
	})).filter((entry) => entry.scopes.length > 0);
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export type OAuthAppStatus = "pending" | "approved" | "rejected";

export type OAuthApp = {
	id: string;
	clientId: string;
	clientSecret: string;
	name: string;
	description: string;
	websiteUrl: string | null;
	iconDataUrl: string | null;
	redirectUris: string[];
	scopes: OAuthScope[];
	status: OAuthAppStatus;
	reviewNote: string | null;
	reviewedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type OAuthAppInput = {
	name: string;
	description?: string;
	websiteUrl?: string | null;
	iconDataUrl?: string | null;
	redirectUris: string[];
	scopes: OAuthScope[];
};

export type OAuthDeveloper = {
	id: string;
	handle: string;
	email: string;
};

export type AdminReviewRecord = {
	decision: "approved" | "rejected";
	note: string | null;
	reviewerHandle: string | null;
	createdAt: string;
};

/** Owner shape minus the secret, plus reviewer/developer metadata. */
export type AdminReviewApp = Omit<OAuthApp, "clientSecret"> & {
	developer: OAuthDeveloper;
	reviewedByHandle?: string | null;
	/** Latest review trail (newest first, up to 10 entries). */
	reviews?: AdminReviewRecord[];
};

export type OAuthReviewDecision = "approve" | "reject";

export type PublicOAuthApp = {
	clientId: string;
	name: string;
	description: string;
	websiteUrl: string | null;
	iconDataUrl: string | null;
	developerHandle: string;
};

export type OAuthAuthorizationApp = {
	id: string;
	clientId: string;
	name: string;
	description: string;
	websiteUrl: string | null;
	iconDataUrl: string | null;
	developerHandle: string;
};

export type ProfileRestrictions = Partial<Record<OAuthGame, string[]>>;

export type OAuthAuthorization = {
	id: string;
	scopes: OAuthScope[];
	profileRestrictions: ProfileRestrictions;
	createdAt: string;
	updatedAt: string;
	lastUsedAt: string | null;
	app: OAuthAuthorizationApp;
};

export type AuthorizeInfo = {
	app: PublicOAuthApp;
	redirectUri: string;
	scopes: OAuthScope[];
	state: string | null;
};

export type AuthorizeDecision = "approve" | "deny";

export type AuthorizeDecisionInput = {
	clientId: string;
	redirectUri: string;
	scopes: OAuthScope[];
	state: string | null;
	codeChallenge: string;
	codeChallengeMethod: "S256";
	decision: AuthorizeDecision;
	profileRestrictions?: ProfileRestrictions;
};

export type AuthorizeDecisionResponse = {
	redirectUrl: string;
};

// ---------------------------------------------------------------------------
// Device authorization (RFC 8628, no-callback apps)
// ---------------------------------------------------------------------------

export type DeviceAuthorizationStatus = "pending" | "approved" | "denied";

export type DeviceAuthorizationInfo = {
	userCode: string;
	status: DeviceAuthorizationStatus;
	expiresAt: string;
	createdAt: string;
	app: PublicOAuthApp;
	scopes: OAuthScope[];
};

export type DeviceDecisionInput = {
	userCode: string;
	decision: "approve" | "deny";
	profileRestrictions?: ProfileRestrictions;
};

export type DeviceDecisionResponse = {
	status: "approved" | "denied";
	userCode: string;
};

const USER_CODE_LENGTH = 8;
const USER_CODE_GROUP = 4;

/** Backend device-code alphabet: uppercase, no ambiguous I/O/0/1. */
export const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const USER_CODE_ALLOWED: ReadonlySet<string> = new Set(
	USER_CODE_ALPHABET.split(""),
);

export type UserCodeSanitization = {
	/** Canonical `ABCD-EFGH` form built only from allowed characters. */
	code: string;
	/** True when the raw input contained characters outside the alphabet. */
	hasInvalidCharacters: boolean;
};

/**
 * Canonicalises user input for the device flow: case-insensitive, tolerates
 * spaces and hyphens, drops characters outside the backend alphabet and
 * reports whether anything invalid was typed (so the UI can warn instead of
 * silently producing a lookup that can never match).
 */
export function sanitizeUserCodeInput(value: string): UserCodeSanitization {
	const raw = value.toUpperCase().replace(/[\s-]+/gu, "");
	let allowed = "";
	let hasInvalidCharacters = false;
	for (const char of raw) {
		if (USER_CODE_ALLOWED.has(char)) {
			allowed += char;
		} else {
			hasInvalidCharacters = true;
		}
	}
	const compact = allowed.slice(0, USER_CODE_LENGTH);
	const code =
		compact.length <= USER_CODE_GROUP
			? compact
			: `${compact.slice(0, USER_CODE_GROUP)}-${compact.slice(USER_CODE_GROUP)}`;
	return { code, hasInvalidCharacters };
}

/** Canonical `ABCD-EFGH` form; invalid characters are dropped. */
export function normalizeUserCode(value: string): string {
	return sanitizeUserCodeInput(value).code;
}

export function isCompleteUserCode(value: string): boolean {
	return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/u.test(
		value,
	);
}

export type BackupProfileSummary = {
	id: string;
	name: string;
	playerRating: number | null;
	active: boolean;
};

export type LatestBackupProfiles = {
	game: OAuthGame;
	backupId: string;
	committedAt: string | null;
	profiles: BackupProfileSummary[];
};

export type OAuthAppsResponse = { apps: OAuthApp[] };
export type AdminReviewAppsResponse = { apps: AdminReviewApp[] };

export type OAuthReviewStatusFilter = "all" | "approved" | "rejected";

export type AdminReviewHistoryResponse = {
	apps: AdminReviewApp[];
	total: number;
};

/** Page size used for the admin review history (contract default). */
export const OAUTH_REVIEW_HISTORY_PAGE_SIZE = 20;
export type OAuthAuthorizationsResponse = {
	authorizations: OAuthAuthorization[];
};

// ---------------------------------------------------------------------------
// Client-side validation (mirrors the backend rules in the contract)
// ---------------------------------------------------------------------------

export type RedirectUriIssue =
	| "empty"
	| "invalidUri"
	| "fragment"
	| "userinfo"
	| "tooLong"
	| "blockedScheme";

/**
 * Schemes that would let a redirect target execute script or read local data.
 * Custom app schemes (e.g. `myapp://`) stay allowed; these never do.
 */
export const BLOCKED_REDIRECT_SCHEMES: readonly string[] = [
	"javascript",
	"vbscript",
	"data",
	"blob",
	"file",
	"about",
];

const BLOCKED_REDIRECT_SCHEME_SET: ReadonlySet<string> = new Set(
	BLOCKED_REDIRECT_SCHEMES,
);

/** Decodes once (when possible) and strips whitespace/control characters. */
function normalizeSchemeProbe(value: string): string {
	let decoded = value;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		decoded = value;
	}
	return decoded.replace(/[\s\u0000-\u001f\u007f]+/gu, "");
}

/** True when the URL uses a scheme that must never be navigated to. */
export function hasBlockedRedirectScheme(value: string): boolean {
	const normalized = normalizeSchemeProbe(value);
	const match = /^([a-z][a-z0-9+.-]*):/iu.exec(normalized);
	if (!match) return false;
	return BLOCKED_REDIRECT_SCHEME_SET.has(match[1].toLowerCase());
}

/**
 * Defence in depth for the consent redirect: the backend-provided `redirectUrl`
 * must stay on the registered redirect URI (with only `?`/`&` query parameters
 * appended) and must not use a dangerous scheme.
 */
export function isSafeRedirectTarget(
	candidate: string,
	registeredRedirectUri: string,
): boolean {
	const value = candidate.trim();
	const expected = registeredRedirectUri.trim();
	if (!value || !expected) return false;
	if (hasBlockedRedirectScheme(value)) return false;
	if (value === expected) return true;
	return (
		value.startsWith(`${expected}?`) || value.startsWith(`${expected}&`)
	);
}

export function validateRedirectUri(value: string): RedirectUriIssue | null {
	const trimmed = value.trim();
	if (!trimmed) return "empty";
	if (hasBlockedRedirectScheme(trimmed)) return "blockedScheme";
	if (trimmed.length > OAUTH_REDIRECT_URI_MAX) return "tooLong";
	if (trimmed.includes("#")) return "fragment";
	if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)) return "invalidUri";
	try {
		const url = new URL(trimmed);
		if (url.username || url.password) return "userinfo";
		if (url.hash) return "fragment";
		return null;
	} catch {
		return "invalidUri";
	}
}

export type WebsiteIssue = "invalid" | "tooLong";

export function validateWebsiteUrl(value: string): WebsiteIssue | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > OAUTH_WEBSITE_MAX) return "tooLong";
	try {
		const url = new URL(trimmed);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return "invalid";
		}
		return null;
	} catch {
		return "invalid";
	}
}

export function normalizeRedirectUriList(uris: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const uri of uris) {
		const trimmed = uri.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

export function isValidIconDataUrl(value: string): boolean {
	return (
		value.length > 0 &&
		value.length <= OAUTH_ICON_DATA_URL_MAX &&
		OAUTH_ICON_DATA_URL_PATTERN.test(value)
	);
}
