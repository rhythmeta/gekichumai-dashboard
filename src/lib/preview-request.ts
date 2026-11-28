import type { RequestFn } from "@/App";
import type {
  AdminUserRow,
  ApprovedAliasesResponse,
  AdminCandidate,
  AdminDashboardStats,
  CommunityCandidate,
  LatestBackupProfileSummary,
  LatestBackupProfilesResponse,
  MfaSetup,
  MfaStatus,
  PasskeyCredential,
} from "@/lib/app-types";
import {
  BackendRequestError,
  type BackendRequestOptions,
} from "@/lib/backend-client";
import type {
  AdminReviewApp,
  AdminReviewHistoryResponse,
  AdminReviewRecord,
  AuthorizeInfo,
  DeviceAuthorizationInfo,
  LatestBackupProfiles,
  OAuthApp,
  OAuthAuthorization,
  OAuthReviewDecision,
} from "@/lib/oauth-types";
import type { AuthUser, Session } from "@/lib/session";

/**
 * Dev-only preview mode (`NEXT_PUBLIC_PREVIEW_MODE=1`).
 *
 * Boots the dashboard with a fake admin session and answers every request from
 * an in-memory fixture, so the UI can be demoed without the backend. Never
 * enabled in production builds because the env var is inlined at build time.
 */
export const PREVIEW_MODE_ENABLED =
  process.env.NEXT_PUBLIC_PREVIEW_MODE === "1";

const PREVIEW_USER: AuthUser = {
  id: "preview-user",
  email: "shiko@example.com",
  username: "Shiko",
  usernameDiscriminator: "1234",
  handle: "Shiko#1234",
  isAdmin: true,
};

export const PREVIEW_SESSION: Session = {
  accessToken: "preview-access-token",
  refreshToken: "preview-refresh-token",
  expiresAt: Number.MAX_SAFE_INTEGER,
  user: PREVIEW_USER,
};

const ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
/** Different bytes per game so the per-game avatar is visible while previewing. */
const CHUNITHM_AVATAR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

type Game = "maimaid" | "chunithmd";
type PreviewBackup = {
  id: string;
  deviceName: string;
  clientVersion: string;
  profileCount: number;
  size: number;
  committedAt: string;
  downloadUrl: string;
};

const iso = (minutesFromNow: number) =>
  new Date(Date.now() + minutesFromNow * 60_000).toISOString();

const delay = <T>(value: T, ms = 90): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });

function previewError(status: number, code: string, message: string): never {
  throw new BackendRequestError(status, code, message);
}

function parseBody<T>(options?: BackendRequestOptions): T {
  return (options?.body ?? {}) as T;
}

function buildApps(): OAuthApp[] {
  return [
    {
      id: "preview-app-1",
      clientId: "rhy_preview0000000001",
      clientSecret: "rhys_previewSecret000000000000000000000000000001",
      name: "Rhythmeta Player",
      description: "在桌面端同步 maimaid 成绩与收藏。",
      websiteUrl: "https://example.com",
      iconDataUrl: ICON_DATA_URL,
      redirectUris: ["https://example.com/oauth/callback"],
      scopes: [
        "openid",
        "profile",
        "backup.read.maimaid",
        "backup.write.maimaid",
      ],
      status: "approved",
      reviewNote: null,
      reviewedAt: iso(-60 * 24 * 3),
      createdAt: iso(-60 * 24 * 10),
      updatedAt: iso(-60 * 24 * 3),
    },
    {
      id: "preview-app-2",
      clientId: "rhy_preview0000000002",
      clientSecret: "rhys_previewSecret000000000000000000000000000002",
      name: "Scoreboard",
      description: "把 maimaid / chunithmd 成绩汇总成网页看板。",
      websiteUrl: "https://scoreboard.example.net",
      iconDataUrl: null,
      redirectUris: ["https://scoreboard.example.net/oauth/callback"],
      scopes: ["openid", "backup.read.maimaid", "backup.read.chunithmd"],
      status: "pending",
      reviewNote: null,
      reviewedAt: null,
      createdAt: iso(-60 * 24 * 2),
      updatedAt: iso(-60 * 24 * 2),
    },
    {
      id: "preview-app-3",
      clientId: "rhy_preview0000000003",
      clientSecret: "rhys_previewSecret000000000000000000000000000003",
      name: "CLI Sync Tool",
      description: "命令行工具，通过设备码授权同步备份。",
      websiteUrl: "https://cli.example.com",
      iconDataUrl: null,
      redirectUris: [],
      scopes: ["openid", "profile", "backup.read.maimaid"],
      status: "approved",
      reviewNote: null,
      reviewedAt: iso(-60 * 24 * 5),
      createdAt: iso(-60 * 24 * 12),
      updatedAt: iso(-60 * 24 * 5),
    },
  ];
}

function buildReviews(app: OAuthApp, index: number): AdminReviewRecord[] {
  const approved = app.status === "approved";
  return [
    {
      decision: approved ? "approved" : "rejected",
      note: approved ? null : "请补充隐私政策后再提交。",
      reviewerHandle: "Admin#0001",
      createdAt: app.reviewedAt ?? iso(-60),
    },
    {
      decision: "rejected",
      note: "首次审核：缺少应用说明。",
      reviewerHandle: "Admin#0002",
      createdAt: iso(-60 * 24 * (index + 8)),
    },
  ];
}

function toAdminReviewApp(app: OAuthApp, index: number): AdminReviewApp {
  const { clientSecret, ...rest } = app;
  void clientSecret;
  return {
    ...rest,
    developer: {
      id: "preview-developer",
      handle: index % 2 === 0 ? "Shiko#1234" : "Dev#0042",
      email: index % 2 === 0 ? "shiko@example.com" : "dev@example.com",
    },
    reviewedByHandle: app.reviewedAt ? "Admin#0001" : null,
    reviews: app.reviewedAt ? buildReviews(app, index) : [],
  };
}

function buildHistory(source: OAuthApp[]): AdminReviewApp[] {
  return Array.from({ length: 26 }, (_, index) => {
    const base = source[index % source.length];
    const approved = index % 3 !== 1;
    const reviewedAt = iso(-60 * (index * 5 + 2));
    const app: OAuthApp = {
      ...base,
      id: `preview-history-${index + 1}`,
      name: `${base.name} ${index + 1}`,
      status: approved ? "approved" : "rejected",
      reviewNote: approved ? null : "请补充隐私政策后再提交。",
      reviewedAt,
      createdAt: iso(-60 * (index * 5 + 60)),
      updatedAt: reviewedAt,
    };
    const record = toAdminReviewApp(app, index);
    return {
      ...record,
      developer: {
        id: `preview-developer-${index}`,
        handle: `Dev#${1000 + index}`,
        email: `dev${index}@example.com`,
      },
    };
  });
}

function buildBackups(game: Game): PreviewBackup[] {
  return [0, 1, 2].map((index) => ({
    id: `preview-${game}-backup-${index + 1}`,
    deviceName: index === 0 ? "iPhone 17 Pro" : "iPad Pro",
    clientVersion: game === "maimaid" ? "1.50.0" : "2.20.0",
    profileCount: index === 0 ? 2 : 1,
    size: 2_400_000 + index * 120_000,
    committedAt: iso(-60 * (index * 8 + 1)),
    downloadUrl: `https://example.com/preview/${game}/backup-${index + 1}.pb.gz`,
  }));
}

/** Bundle song identifiers that exist in the public catalogs (covers resolve). */
const PREVIEW_SONG_IDS: Record<Game, readonly string[]> = {
  maimaid: ["君の知らない物語", "Our Fighting", "毒占欲"],
  chunithmd: ["B.B.K.K.B.K.K.", "初音ミクの消失", "千本桜"],
};

function previewSongId(game: Game, index: number): string {
  const ids = PREVIEW_SONG_IDS[game];
  return ids[index % ids.length] ?? ids[0];
}

function buildCommunityCandidates(game: Game): CommunityCandidate[] {
  return [0, 1, 2].map((index) => ({
    candidateId: `preview-${game}-candidate-${index + 1}`,
    songIdentifier: previewSongId(game, index),
    aliasText:
      game === "maimaid" ? `Pandora ${index + 1}` : `Trill ${index + 1}`,
    status: "voting",
    supportCount: 12 + index * 5,
    opposeCount: 2 + index,
    submitterId: "preview-user",
    submitterHandle: "Shiko#1234",
    voteOpenAt: iso(-60 * 24 * 2),
    voteCloseAt: iso(60 * 24 * (3 + index)),
    myVote: index === 0 ? 1 : null,
    createdAt: iso(-60 * 24 * 2),
  }));
}

function buildAdminCandidates(game: Game): AdminCandidate[] {
  return [0, 1].map((index) => ({
    candidateId: `preview-${game}-admin-candidate-${index + 1}`,
    songIdentifier: game === "maimaid" ? `1100${index}` : `2200${index}`,
    aliasText: `${game} 别名 ${index + 1}`,
    status: index === 0 ? "voting" : "approved",
    supportCount: 20 + index,
    opposeCount: 3,
    submitterId: "preview-user",
    submitterHandle: "Shiko#1234",
    submitterEmail: "shiko@example.com",
    voteCloseAt: index === 0 ? iso(-10) : null,
    createdAt: iso(-60 * 24 * 4),
    updatedAt: iso(-60 * 60 * 2),
  }));
}

function buildApprovedAliases(game: Game): ApprovedAliasesResponse {
  const prefix = game === "maimaid" ? "maimai" : "chuni";
  return {
    complete: true,
    rows: Array.from({ length: 30 }, (_, index) => ({
      candidateId: `preview-${game}-alias-${index + 1}`,
      songIdentifier: previewSongId(game, index),
      aliasText: `${prefix} Alias ${index + 1}`,
      status: "approved",
      updatedAt: iso(-60 * (index * 6 + 30)),
      approvedAt: iso(-60 * (index * 6 + 30)),
    })),
  };
}

function buildLatestProfiles(game: Game): LatestBackupProfilesResponse {
  const profiles: LatestBackupProfileSummary[] =
    game === "maimaid"
      ? [
          {
            id: "preview-profile-m1",
            name: "Shiko",
            server: "jp",
            active: true,
            createdAt: iso(-60 * 24 * 30),
            playerRating: 15234,
            plate: "舞",
            title: "Legend",
            hasAvatar: true,
            avatarUrl: null,
          },
          {
            id: "preview-profile-m2",
            name: "Alt",
            server: "intl",
            active: false,
            createdAt: iso(-60 * 24 * 20),
            playerRating: 13210,
            plate: "",
            title: "Bronze",
            hasAvatar: false,
            avatarUrl: "https://assets2.lxns.net/maimai/icon/1939.png",
          },
        ]
      : [
          {
            id: "preview-profile-c1",
            name: "Shiko",
            server: "jp",
            active: true,
            createdAt: iso(-60 * 24 * 25),
            playerRating: 16020,
            plate: "",
            title: "Diamond",
            hasAvatar: true,
            avatarUrl: null,
          },
          {
            id: "preview-profile-c2",
            name: "Sub",
            server: "intl",
            active: false,
            createdAt: iso(-60 * 24 * 12),
            playerRating: 14250,
            plate: "虹",
            title: "Platinum",
            hasAvatar: false,
            avatarUrl: "https://assets2.lxns.net/chunithm/character/1.png",
          },
        ];
  return {
    backup: {
      id: `preview-${game}-backup-1`,
      game,
      committedAt: iso(-60),
    },
    profiles,
  };
}

function buildMfaStatus(): MfaStatus {
  return {
    mfaEnabled: true,
    totpEnabled: true,
    passkeyCount: 1,
    backupCodeCount: 5,
  };
}

function buildPasskeys(): PasskeyCredential[] {
  return [
    {
      credentialId: "preview-passkey-credential-id",
      name: "MacBook Pro",
      transports: ["internal", "hybrid"],
      createdAt: iso(-60 * 24 * 40),
      updatedAt: iso(-60 * 24 * 4),
    },
  ];
}

function buildUsers(): AdminUserRow[] {
  return [
    {
      id: "preview-user",
      email: "shiko@example.com",
      handle: "Shiko#1234",
      isAdmin: true,
      status: "active",
      createdAt: iso(-60 * 24 * 180),
      mfa: { enabled: true, totpEnabled: true, passkeyCount: 1 },
    },
    {
      id: "preview-user-2",
      email: "dev@example.com",
      handle: "Dev#0042",
      isAdmin: false,
      status: "active",
      createdAt: iso(-60 * 24 * 90),
      mfa: { enabled: false, totpEnabled: false, passkeyCount: 0 },
    },
    {
      id: "preview-user-3",
      email: "guest@example.com",
      handle: "Guest#7777",
      isAdmin: false,
      status: "disabled",
      createdAt: iso(-60 * 24 * 30),
      mfa: { enabled: true, totpEnabled: false, passkeyCount: 2 },
    },
  ];
}

function buildAuthorizations(apps: OAuthApp[]): OAuthAuthorization[] {
  return [
    {
      id: "preview-authorization-1",
      scopes: ["openid", "profile", "backup.read.maimaid"],
      profileRestrictions: { maimaid: ["preview-profile-m1"] },
      createdAt: iso(-60 * 24 * 6),
      updatedAt: iso(-60 * 24 * 2),
      lastUsedAt: iso(-60 * 3),
      app: {
        id: apps[0].id,
        clientId: apps[0].clientId,
        name: apps[0].name,
        description: apps[0].description,
        websiteUrl: apps[0].websiteUrl,
        iconDataUrl: apps[0].iconDataUrl,
        developerHandle: "Shiko#1234",
      },
    },
    {
      id: "preview-authorization-2",
      scopes: ["openid", "backup.read.chunithmd"],
      profileRestrictions: {},
      createdAt: iso(-60 * 24 * 3),
      updatedAt: iso(-60 * 24 * 3),
      lastUsedAt: null,
      app: {
        id: apps[2].id,
        clientId: apps[2].clientId,
        name: apps[2].name,
        description: apps[2].description,
        websiteUrl: apps[2].websiteUrl,
        iconDataUrl: apps[2].iconDataUrl,
        developerHandle: "Shiko#1234",
      },
    },
  ];
}

function readGame(pathname: string): Game | null {
  if (pathname.startsWith("/maimaid/")) return "maimaid";
  if (pathname.startsWith("/chunithmd/")) return "chunithmd";
  return null;
}

/**
 * Request handler used only when preview mode is enabled: every path resolves to
 * an in-memory fixture with the same shape as the production API.
 */
export function createPreviewRequest(): RequestFn {
  const apps = buildApps();
  const pending = [toAdminReviewApp(apps[1], 1), toAdminReviewApp(apps[2], 2)];
  const history = buildHistory(apps);
  const authorizations = buildAuthorizations(apps);
  const backups: Record<Game, PreviewBackup[]> = {
    maimaid: buildBackups("maimaid"),
    chunithmd: buildBackups("chunithmd"),
  };
  const users = buildUsers();
  // Alias submissions made in this preview session, so the quota and the
  // "my submissions" list react to what the user just did.
  const myCandidates: Record<Game, Array<Record<string, unknown>>> = {
    maimaid: [],
    chunithmd: [],
  };
  const dailyCounts: Record<Game, number> = { maimaid: 1, chunithmd: 0 };
  let currentUser: AuthUser = { ...PREVIEW_USER };

  function findReviewApp(appId: string): AdminReviewApp | null {
    return (
      pending.find((app) => app.id === appId) ??
      history.find((app) => app.id === appId) ??
      null
    );
  }

  return async function previewRequest<T>(
    path: string,
    options?: BackendRequestOptions,
  ): Promise<T> {
    const method = options?.method ?? "GET";
    const url = new URL(path, "https://preview.local");
    const pathname = url.pathname;
    const segments = pathname.split("/").filter(Boolean);
    const response = await handleRequest();
    return delay(response as T);

    async function handleRequest(): Promise<unknown> {
      // ----- account ------------------------------------------------------
      if (pathname === "/auth/v1/me") {
        if (method === "PATCH") {
          const body = parseBody<{ username?: string }>(options);
          const username = (body.username ?? currentUser.username).trim();
          currentUser = {
            ...currentUser,
            username,
            handle: `${username}#${currentUser.usernameDiscriminator}`,
          };
        }
        return currentUser;
      }
      if (pathname === "/auth/v1/logout") {
        return { ok: true };
      }

      // ----- MFA ----------------------------------------------------------
      if (pathname === "/auth/v1/mfa/status") return buildMfaStatus();
      if (pathname === "/auth/v1/mfa/passkeys") {
        return { passkeys: buildPasskeys() };
      }
      if (pathname === "/auth/v1/mfa/backup-codes") {
        return { activeCount: 5, latestGeneratedAt: iso(-60 * 24 * 15) };
      }
      if (pathname === "/auth/v1/mfa/backup-codes:regenerate") {
        return {
          activeCount: 8,
          latestGeneratedAt: iso(0),
          codes: Array.from(
            { length: 8 },
            (_, index) => `PREVIEW-${1000 + index}`,
          ),
          generatedAt: iso(0),
        };
      }
      if (pathname === "/auth/v1/mfa/totp:startSetup") {
        const setup: MfaSetup = {
          secretBase32: "JBSWY3DPEHPK3PXP",
          otpauthUrl:
            "otpauth://totp/Rhythmeta:shiko@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Rhythmeta",
        };
        return setup;
      }
      if (
        pathname === "/auth/v1/mfa/totp:confirmSetup" ||
        pathname === "/auth/v1/mfa/totp:disable"
      ) {
        return { ok: true };
      }
      if (pathname === "/auth/v1/mfa/passkeys:finishRegistration") {
        return { passkey: { credentialId: "preview-new-passkey" } };
      }
      if (pathname === "/auth/v1/mfa/passkeys:startRegistration") {
        previewError(
          400,
          "preview_unsupported",
          "预览模式不支持注册 Passkey（需要真实 WebAuthn 环境）。",
        );
      }
      if (
        segments[0] === "auth" &&
        segments[1] === "v1" &&
        segments[2] === "mfa" &&
        segments[3] === "passkey"
      ) {
        return { ok: true };
      }

      // ----- admin users --------------------------------------------------
      if (pathname === "/auth/v1/admin/users") {
        return { rows: users, total: users.length };
      }
      if (
        pathname === "/auth/v1/admin/users:start" ||
        pathname === "/auth/v1/admin/users:finish"
      ) {
        previewError(
          400,
          "preview_unsupported",
          "预览模式不支持创建管理员账号（OPAQUE 注册需要真实后端）。",
        );
      }
      if (
        segments[0] === "auth" &&
        segments[3] === "users" &&
        method === "DELETE"
      ) {
        return { deleted: true };
      }

      // ----- OAuth developer apps ----------------------------------------
      if (pathname === "/auth/v1/oauth/apps") {
        if (method === "POST") {
          const body = parseBody<Partial<OAuthApp>>(options);
          const created: OAuthApp = {
            id: `preview-app-${apps.length + 1}`,
            clientId: `rhy_previewnew${apps.length + 1}000000`,
            clientSecret: `rhys_previewnewsecret${apps.length + 1}`,
            name: body.name ?? "New App",
            description: body.description ?? "",
            websiteUrl: body.websiteUrl ?? null,
            iconDataUrl: body.iconDataUrl ?? null,
            redirectUris: body.redirectUris ?? [],
            scopes: body.scopes ?? ["openid"],
            status: "pending",
            reviewNote: null,
            reviewedAt: null,
            createdAt: iso(0),
            updatedAt: iso(0),
          };
          apps.unshift(created);
          return { app: created };
        }
        return { apps };
      }
      if (
        segments[0] === "auth" &&
        segments[2] === "oauth" &&
        segments[3] === "apps"
      ) {
        const appId = decodeURIComponent(segments[4] ?? "");
        const index = apps.findIndex((app) => app.id === appId);
        if (index === -1) {
          previewError(404, "app_not_found", "应用不存在。");
        }
        if (method === "DELETE") {
          apps.splice(index, 1);
          return { deleted: true };
        }
        if (method === "PATCH") {
          const body = parseBody<Partial<OAuthApp>>(options);
          const current = apps[index];
          const next: OAuthApp = {
            ...current,
            name: body.name ?? current.name,
            description: body.description ?? current.description,
            websiteUrl: body.websiteUrl ?? null,
            iconDataUrl: body.iconDataUrl ?? null,
            redirectUris: body.redirectUris ?? current.redirectUris,
            scopes: body.scopes ?? current.scopes,
            updatedAt: iso(0),
          };
          apps[index] = next;
          return { app: next };
        }
        return { app: apps[index] };
      }

      // ----- OAuth reviews ------------------------------------------------
      if (pathname === "/auth/v1/oauth/reviews/pending") {
        return { apps: pending };
      }
      if (pathname === "/auth/v1/oauth/reviews/history") {
        const status = url.searchParams.get("status") ?? "all";
        const limit = Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
          ),
        );
        const offset = Math.max(
          0,
          Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
        );
        const filtered = history.filter(
          (app) => status === "all" || app.status === status,
        );
        const response: AdminReviewHistoryResponse = {
          apps: filtered.slice(offset, offset + limit),
          total: filtered.length,
        };
        return response;
      }
      if (
        segments[0] === "auth" &&
        segments[2] === "oauth" &&
        segments[3] === "reviews" &&
        method === "POST"
      ) {
        const appId = decodeURIComponent(segments[4] ?? "");
        const target = findReviewApp(appId);
        if (!target) {
          previewError(404, "app_not_found", "应用不存在。");
        }
        const body = parseBody<{
          decision?: OAuthReviewDecision;
          note?: string;
        }>(options);
        const decision: OAuthReviewDecision = body.decision ?? "approve";
        const now = iso(0);
        const record: AdminReviewRecord = {
          decision: decision === "reject" ? "rejected" : "approved",
          note: body.note?.trim() || null,
          reviewerHandle: currentUser.handle,
          createdAt: now,
        };
        const updated: AdminReviewApp = {
          ...target,
          status: decision === "reject" ? "rejected" : "approved",
          reviewNote: record.note,
          reviewedAt: now,
          reviewedByHandle: currentUser.handle,
          reviews: [record, ...(target.reviews ?? [])].slice(0, 10),
        };
        const pendingIndex = pending.findIndex((app) => app.id === appId);
        if (pendingIndex !== -1) {
          pending.splice(pendingIndex, 1);
          history.unshift(updated);
        } else {
          const historyIndex = history.findIndex((app) => app.id === appId);
          if (historyIndex !== -1) history[historyIndex] = updated;
        }
        const appIndex = apps.findIndex((app) => app.id === appId);
        if (appIndex !== -1) {
          apps[appIndex] = {
            ...apps[appIndex],
            status: updated.status,
            reviewNote: updated.reviewNote,
            reviewedAt: updated.reviewedAt,
            updatedAt: now,
          };
        }
        return { app: updated };
      }

      // ----- OAuth authorizations ----------------------------------------
      if (pathname === "/auth/v1/oauth/authorizations") {
        return { authorizations };
      }
      if (
        segments[0] === "auth" &&
        segments[2] === "oauth" &&
        segments[3] === "authorizations"
      ) {
        const authorizationId = decodeURIComponent(segments[4] ?? "");
        const index = authorizations.findIndex(
          (authorization) => authorization.id === authorizationId,
        );
        if (index === -1) {
          previewError(404, "authorization_not_found", "授权不存在。");
        }
        if (method === "DELETE") {
          authorizations.splice(index, 1);
          return { revoked: true };
        }
        if (method === "PATCH") {
          const body = parseBody<{
            profileRestrictions?: OAuthAuthorization["profileRestrictions"];
          }>(options);
          const next: OAuthAuthorization = {
            ...authorizations[index],
            profileRestrictions: body.profileRestrictions ?? {},
            updatedAt: iso(0),
          };
          authorizations[index] = next;
          return { authorization: next };
        }
        return { authorization: authorizations[index] };
      }
      if (pathname === "/auth/v1/oauth/latest-backup-profiles") {
        const game =
          url.searchParams.get("game") === "chunithmd"
            ? "chunithmd"
            : "maimaid";
        const latest = buildLatestProfiles(game);
        const response: LatestBackupProfiles = {
          game,
          backupId: latest.backup.id,
          committedAt: latest.backup.committedAt,
          profiles: latest.profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
            playerRating: profile.playerRating ?? null,
            active: profile.active,
          })),
        };
        return response;
      }

      // ----- per-game backups --------------------------------------------
      const game = readGame(pathname);
      if (game) {
        const rest = segments.slice(2); // after {game}/v1
        if (rest[0] === "backups") {
          if (rest.length === 1) {
            return { backups: backups[game] };
          }
          if (rest.length === 2 && method === "DELETE") {
            const backupId = decodeURIComponent(rest[1]);
            backups[game] = backups[game].filter(
              (backup) => backup.id !== backupId,
            );
            return { deleted: true };
          }
          if (rest[1] === "latest" && rest[2] === "profiles") {
            if (rest.length === 3) {
              return buildLatestProfiles(game);
            }
            return {
              profileId: decodeURIComponent(rest[3] ?? ""),
              contentType: "image/png",
              avatarDataUrl:
                game === "maimaid" ? ICON_DATA_URL : CHUNITHM_AVATAR_DATA_URL,
            };
          }
        }
        if (rest[0] === "community") {
          if (rest[1] === "candidates:votingBoard") {
            const candidates = buildCommunityCandidates(game);
            return { rows: candidates, total: candidates.length };
          }
          if (rest[1] === "candidates:dailyCount") {
            return { count: dailyCounts[game] };
          }
          if (rest[1] === "candidates:my") {
            const songIdentifier = url.searchParams.get("songIdentifier");
            const rows = songIdentifier
              ? myCandidates[game].filter(
                  (row) => row.songIdentifier === songIdentifier,
                )
              : myCandidates[game];
            return { rows, total: rows.length };
          }
          if (rest[1] === "aliases:sync") {
            return buildApprovedAliases(game);
          }
          if (rest[1] === "candidates" && method === "POST") {
            if (rest.length !== 2) return { ok: true };
            const body = parseBody<{
              songIdentifier?: string;
              aliasText?: string;
            }>(options);
            const candidateId = `preview-${game}-alias-${Date.now().toString(36)}`;
            const now = new Date().toISOString();
            myCandidates[game].push({
              id: candidateId,
              game,
              songIdentifier: body.songIdentifier ?? "",
              aliasText: body.aliasText ?? "",
              aliasNorm: (body.aliasText ?? "").toLowerCase(),
              submitterId: "preview-user",
              status: "voting",
              rejectionSource: null,
              voteCloseAt: iso(60 * 24 * 3),
              createdAt: now,
              updatedAt: now,
            });
            dailyCounts[game] += 1;
            return {
              status: "submitted",
              candidateId,
              quotaRemaining: Math.max(0, 5 - dailyCounts[game]),
            };
          }
        }
        if (rest[0] === "admin:rollCycle" && method === "POST") {
          return { ok: true };
        }
        if (rest[0] === "admin") {
          if (rest[1] === "candidates" && rest.length === 2) {
            const rows = buildAdminCandidates(game);
            return { rows, total: rows.length };
          }
          if (rest[1] === "dashboard") {
            const stats: AdminDashboardStats = {
              totalCount: 26,
              votingCount: 3,
              approvedCount: 20,
              rejectedCount: 3,
              closingSoonCount: 1,
              expiredVotingCount: 1,
              todaySubmissions: 2,
            };
            return stats;
          }
          if (rest[1] === "candidates" && method === "POST") {
            return { ok: true };
          }
        }
      }

      // ----- OAuth runtime (consent/device previews) ----------------------
      if (pathname === "/oauth/v1/authorize") {
        if (method === "POST") {
          return {
            redirectUrl: `https://example.com/oauth/callback?code=preview-code&state=${encodeURIComponent(
              String(url.searchParams.get("state") ?? "preview-state"),
            )}`,
          };
        }
        const info: AuthorizeInfo = {
          app: {
            clientId: "rhy_preview0000000001",
            name: "Rhythmeta Player",
            description: "在桌面端同步 maimaid 成绩与收藏。",
            websiteUrl: "https://example.com",
            iconDataUrl: ICON_DATA_URL,
            developerHandle: "Shiko#1234",
          },
          redirectUri: "https://example.com/oauth/callback",
          scopes: ["openid", "profile", "backup.read.maimaid"],
          state: url.searchParams.get("state"),
          nonce: url.searchParams.get("nonce"),
        };
        return info;
      }
      if (pathname === "/oauth/v1/device/verify") {
        const info: DeviceAuthorizationInfo = {
          userCode: url.searchParams.get("user_code") ?? "PREV-1234",
          status: "pending",
          expiresAt: iso(8),
          createdAt: iso(-2),
          app: {
            clientId: "rhy_preview0000000003",
            name: "CLI Sync Tool",
            description: "命令行工具，通过设备码授权同步备份。",
            websiteUrl: "https://cli.example.com",
            iconDataUrl: null,
            developerHandle: "Shiko#1234",
          },
          scopes: ["openid", "profile", "backup.read.maimaid"],
        };
        return info;
      }
      if (pathname === "/oauth/v1/device/authorize") {
        const body = parseBody<{ decision?: string; userCode?: string }>(
          options,
        );
        return {
          status: body.decision === "deny" ? "denied" : "approved",
          userCode: body.userCode ?? "PREV-1234",
        };
      }

      previewError(
        404,
        "preview_unhandled",
        `预览模式未模拟该接口：${method} ${pathname}`,
      );
    }
  };
}
