import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AccountPage } from "@/components/pages/AccountPage";
import { CommunityPage } from "@/components/pages/CommunityPage";
import { BackupsPage } from "@/components/pages/BackupsPage";
import { UsersPage } from "@/components/pages/UsersPage";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useAuthFlow } from "@/hooks/use-auth-flow";
import { requestJson, type BackendRequestOptions } from "@/lib/backend-client";
import { BACKEND_URL } from "@/lib/app-helpers";
import {
  clearStoredSessionArtifacts,
  persistRefreshToken,
  readStoredRefreshToken,
  toSession,
  type Session,
  type LoginResponse,
} from "@/lib/session";
import type { ToastSeverity } from "@/lib/app-types";
export type RequestFn = <T>(
  path: string,
  options?: BackendRequestOptions,
) => Promise<T>;
export type Game = "maimaid" | "chunithmd";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
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
  const saveSession = useCallback((next: Session) => {
    sessionRef.current = next;
    persistRefreshToken(next.refreshToken);
    setSession(next);
  }, []);
  const request: RequestFn = useCallback(
    <T,>(path: string, options?: BackendRequestOptions) =>
      requestJson<T>(
        BACKEND_URL,
        path,
        sessionRef.current,
        saveSession,
        clearSession,
        options,
      ),
    [saveSession, clearSession],
  );
  const authFlow = useAuthFlow({ session, setSession, request, showToast });
  const initialized = useRef(false);
  useEffect(() => {
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
  }, [request, saveSession, clearSession]);
  useEffect(() => {
    if (session) persistRefreshToken(session.refreshToken);
  }, [session]);
  const logout = async () => {
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
  if (initializing)
    return <main className="p-8 text-muted-foreground">正在恢复会话…</main>;
  if (
    !session ||
    (authFlow.isAppAuthFlow && authFlow.appAuthRequestedMode !== "login")
  )
    return <AuthScreen {...authFlow} />;
  if (authFlow.isAppAuthFlow)
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
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Rhythmeta</h1>
        <Button variant="ghost" onClick={() => void logout()}>
          退出登录
        </Button>
      </header>
      <Tabs defaultValue="account" className="gap-6">
        <TabsList>
          <TabsTrigger value="account">账号</TabsTrigger>
          <TabsTrigger value="aliases">社区别名</TabsTrigger>
          <TabsTrigger value="backups">云备份</TabsTrigger>
          {session.user.isAdmin && (
            <TabsTrigger value="users">用户管理</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="account">
          <AccountPage
            session={session}
            setSession={saveSession}
            request={request}
          />
        </TabsContent>
        <TabsContent value="aliases">
          <CommunityPage request={request} isAdmin={session.user.isAdmin} />
        </TabsContent>
        <TabsContent value="backups">
          <BackupsPage request={request} />
        </TabsContent>
        {session.user.isAdmin && (
          <TabsContent value="users">
            <UsersPage request={request} />
          </TabsContent>
        )}
      </Tabs>
      <Toaster />
    </main>
  );
}
