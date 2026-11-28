import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { FlaskConicalIcon } from "lucide-react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import {
  AppMobileHeader,
  AppSidebar,
  isAppPage,
  type AppPage,
} from "@/components/AppSidebar";
import { AccountPage } from "@/components/pages/AccountPage";
import { CommunityPage } from "@/components/pages/CommunityPage";
import { BackupsPage } from "@/components/pages/BackupsPage";
import { SongsPage } from "@/components/pages/SongsPage";
import { DeveloperPage } from "@/components/pages/DeveloperPage";
import { UsersPage } from "@/components/pages/UsersPage";
import { OAuthConsentPage } from "@/components/oauth/OAuthConsentPage";
import { OAuthDevicePage } from "@/components/oauth/OAuthDevicePage";
import { useClientPathname } from "@/hooks/use-client-pathname";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useAuthFlow } from "@/hooks/use-auth-flow";
import { requestJson, type BackendRequestOptions } from "@/lib/backend-client";
import { BACKEND_URL } from "@/lib/app-helpers";
import {
  PREVIEW_MODE_ENABLED,
  PREVIEW_SESSION,
  createPreviewRequest,
} from "@/lib/preview-request";
import {
  clearStoredSessionArtifacts,
  persistRefreshToken,
  readStoredRefreshToken,
  toSession,
  type Session,
  type LoginResponse,
} from "@/lib/session";
import { BackupDataProvider } from "@/store/backup-data";
import type { AccountSection, ToastSeverity } from "@/lib/app-types";
export type RequestFn = <T>(
  path: string,
  options?: BackendRequestOptions,
) => Promise<T>;
export type Game = "maimaid" | "chunithmd";

const GAME_STORAGE_KEY = "rhythmeta.dashboard.game";

function readStoredGame(): Game {
  if (typeof window === "undefined") return "maimaid";
  try {
    const stored = window.localStorage.getItem(GAME_STORAGE_KEY);
    return stored === "chunithmd" ? "chunithmd" : "maimaid";
  } catch {
    return "maimaid";
  }
}

function persistGame(game: Game) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GAME_STORAGE_KEY, game);
  } catch {
    // Private mode or quota: the selection simply is not remembered.
  }
}

type NavLocation = { page: AppPage; section: AccountSection };

const DEFAULT_LOCATION: NavLocation = { page: "account", section: "overview" };

function hashForLocation(page: AppPage, section: AccountSection): string {
  if (page !== "account") return `#${page}`;
  return `#account/${section === "oauthApps" ? "oauth-apps" : section}`;
}

function readLocationFromHash(isAdmin: boolean): NavLocation {
  if (typeof window === "undefined") return DEFAULT_LOCATION;
  const [pagePart = "", sectionPart = ""] = window.location.hash
    .replace(/^#/, "")
    .split("/");
  if (pagePart === "account") {
    const section: AccountSection =
      sectionPart === "security"
        ? "security"
        : sectionPart === "oauth-apps"
          ? "oauthApps"
          : "overview";
    return { page: "account", section };
  }
  if (isAppPage(pagePart)) {
    if (pagePart === "users" && !isAdmin) return DEFAULT_LOCATION;
    return { page: pagePart, section: "overview" };
  }
  return DEFAULT_LOCATION;
}

function PreviewModeBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-amber-500/15 px-3 py-1.5 text-center text-[0.7rem] font-medium text-amber-800 dark:text-amber-300"
    >
      <FlaskConicalIcon className="size-3.5" aria-hidden />
      <span>Preview mode</span>
      <span className="text-amber-800/70 dark:text-amber-300/70">
        本地模拟数据，不会请求后端，请勿用于生产
      </span>
    </div>
  );
}

export default function App() {
  const pathname = useClientPathname();
  const isConsentRoute =
    pathname === "/oauth/authorize" || pathname === "/oauth/authorize/";
  const isDeviceRoute =
    pathname === "/oauth/device" || pathname === "/oauth/device/";
  const previewMode = PREVIEW_MODE_ENABLED;
  const previewRequest = useMemo(
    () => (previewMode ? createPreviewRequest() : null),
    [previewMode],
  );
  const [session, setSession] = useState<Session | null>(
    previewMode ? PREVIEW_SESSION : null,
  );
  const [initializing, setInitializing] = useState(!previewMode);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navLocation, setNavLocation] = useState<NavLocation>(() =>
    readLocationFromHash(true),
  );
  const [game, setGame] = useState<Game>(readStoredGame);
  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const showToast = useCallback(
    (message: string, severity: ToastSeverity = "info") => {
      toast[severity](message);
    },
    [],
  );
  const clearSession = useCallback(() => {
    clearStoredSessionArtifacts();
    setSession(null);
  }, []);
  const saveSession = useCallback(
    (next: Session) => {
      sessionRef.current = next;
      if (!previewMode) persistRefreshToken(next.refreshToken);
      setSession(next);
    },
    [previewMode],
  );
  const request: RequestFn = useCallback(
    <T,>(path: string, options?: BackendRequestOptions) =>
      previewRequest
        ? previewRequest<T>(path, options)
        : requestJson<T>(
            BACKEND_URL,
            path,
            sessionRef.current,
            saveSession,
            clearSession,
            options,
          ),
    [previewRequest, saveSession, clearSession],
  );
  const authFlow = useAuthFlow({ session, setSession, request, showToast });
  const initialized = useRef(false);
  useEffect(() => {
    if (previewMode) return;
    if (initialized.current) return;
    initialized.current = true;
    const token = readStoredRefreshToken();
    if (!token) {
      setInitializing(false);
      return;
    }
    void request<LoginResponse>("auth/v1/refresh", {
      method: "POST",
      auth: false,
      body: { refreshToken: token },
    })
      .then((result) => saveSession(toSession(result)))
      .catch(clearSession)
      .finally(() => setInitializing(false));
  }, [previewMode, request, saveSession, clearSession]);
  useEffect(() => {
    if (previewMode) return;
    if (session) persistRefreshToken(session.refreshToken);
  }, [session, previewMode]);

  useEffect(() => {
    persistGame(game);
  }, [game]);

  // Deep links: `#account/overview|security|oauth-apps`, `#aliases`,
  // `#backups`, `#developer`, `#users` (legacy `#account` means overview).
  useEffect(() => {
    const syncFromHash = () => {
      setNavLocation(readLocationFromHash(session?.user.isAdmin ?? true));
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [session?.user.isAdmin]);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    const allowed = navLocation.page !== "users" || session.user.isAdmin;
    const nextLocation: NavLocation = allowed ? navLocation : DEFAULT_LOCATION;
    if (!allowed) {
      setNavLocation(nextLocation);
    }
    const nextHash = hashForLocation(nextLocation.page, nextLocation.section);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${nextHash}`,
      );
    }
  }, [navLocation, session]);

  const navigate = useCallback((page: AppPage) => {
    setNavLocation({ page, section: "overview" });
  }, []);
  const navigateAccountSection = useCallback((section: AccountSection) => {
    setNavLocation({ page: "account", section });
  }, []);

  const logout = async () => {
    if (previewMode) {
      toast.info("预览模式下已跳过退出登录。");
      return;
    }
    try {
      if (session)
        await request("auth/v1/logout", {
          method: "POST",
          auth: false,
          body: { refreshToken: session.refreshToken },
        });
    } catch {
      toast.error("退出远程会话失败，本机登录已清除。");
    } finally {
      clearSession();
    }
  };

  if (!previewMode && initializing)
    return <main className="p-8 text-muted-foreground">正在恢复会话…</main>;
  if (!session) {
    return previewMode ? null : <AuthScreen {...authFlow} />;
  }
  if (
    !previewMode &&
    authFlow.isAppAuthFlow &&
    authFlow.appAuthRequestedMode !== "login"
  )
    return <AuthScreen {...authFlow} />;
  if (isConsentRoute) {
    return (
      <OAuthConsentPage request={request} session={session} onLogout={logout} />
    );
  }
  if (isDeviceRoute) {
    return (
      <OAuthDevicePage request={request} session={session} onLogout={logout} />
    );
  }
  if (!previewMode && authFlow.isAppAuthFlow)
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Rhythmeta</h1>
        <p>以 {session.user.handle} 继续登录应用</p>
        <Button
          onClick={() => void authFlow.completeAppLoginWithExistingSession()}
          disabled={authFlow.loading}
        >
          继续
        </Button>
        <Button variant="outline" onClick={() => void logout()}>
          使用其他账号
        </Button>
        <Toaster />
      </main>
    );

  const isAdmin = session.user.isAdmin;
  const page =
    navLocation.page === "users" && !isAdmin ? "account" : navLocation.page;
  const accountSection: AccountSection =
    page === "account" ? navLocation.section : "overview";

  // Every signed-in surface (sidebar, account pages, songs and their score
  // dialogs) reads the decoded backup through this provider.
  return (
    <BackupDataProvider game={game} request={request}>
      <div className="flex min-h-screen flex-col bg-background md:h-screen md:overflow-hidden">
        {previewMode ? <PreviewModeBanner /> : null}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
          <AppSidebar
            activePage={page}
            accountSection={accountSection}
            isAdmin={isAdmin}
            session={session}
            request={request}
            game={game}
            onGameChange={setGame}
            onNavigate={(next) => {
              if (next === "users" && !isAdmin) return;
              navigate(next);
            }}
            onNavigateAccountSection={navigateAccountSection}
            onLogout={logout}
            mobileOpen={mobileNavOpen}
            onMobileOpenChange={setMobileNavOpen}
          />
          <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
            <AppMobileHeader
              activePage={page}
              onOpenSidebar={() => setMobileNavOpen(true)}
            />
            <main className="min-w-0 flex-1 md:overflow-y-auto">
              <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
                {page === "account" ? (
                  <AccountPage
                    session={session}
                    setSession={saveSession}
                    request={request}
                    section={accountSection}
                    game={game}
                  />
                ) : null}
                {page === "aliases" ? (
                  <CommunityPage
                    request={request}
                    isAdmin={isAdmin}
                    game={game}
                  />
                ) : null}
                {page === "backups" ? (
                  <BackupsPage request={request} game={game} />
                ) : null}
                {page === "songs" ? (
                  <SongsPage key={game} game={game} request={request} />
                ) : null}
                {page === "developer" ? (
                  <DeveloperPage request={request} isAdmin={isAdmin} />
                ) : null}
                {page === "users" && isAdmin ? (
                  <UsersPage request={request} />
                ) : null}
              </div>
            </main>
          </div>
        </div>
        <Toaster />
      </div>
    </BackupDataProvider>
  );
}
