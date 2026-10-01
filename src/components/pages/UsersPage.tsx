import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { RequestFn } from "@/App";
import type {
  AdminUserRow,
  OpaqueRegistrationStartResponse,
} from "@/lib/app-types";
import {
  startOpaqueRegistration,
  finishOpaqueRegistration,
} from "@/lib/opaque-password";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { AdminUsersPage } from "./AdminUsersPage";
export function UsersPage({ request }: { request: RequestFn }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [users, setUsers] = useState<AdminUserRow[]>([]);
  const load = useCallback(async () => {
    setUsers(await fetchAllRows<AdminUserRow>(request, "auth/v1/admin/users"));
  }, [request]);
  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
  }, [load]);
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  return (
    <AdminUsersPage
      newUserEmail={email}
      newUserPassword={password}
      adminUsers={users}
      onNewUserEmailChange={setEmail}
      onNewUserPasswordChange={setPassword}
      onReloadUsers={() => run(async () => {})}
      onCreateUser={() =>
        run(async () => {
          const state = await startOpaqueRegistration(password);
          const response = await request<OpaqueRegistrationStartResponse>(
            "auth/v1/admin/users:start",
            {
              method: "POST",
              body: { email, registrationRequest: state.registrationRequest },
            },
          );
          const finished = await finishOpaqueRegistration({
            password,
            clientRegistrationState: state.clientRegistrationState,
            registrationResponse: response.registrationResponse,
          });
          await request("auth/v1/admin/users:finish", {
            method: "POST",
            body: { email, ...finished },
          });
          setPassword("");
          setEmail("");
        })
      }
      onDeleteUser={(id) =>
        run(async () => {
          if (window.confirm("停用该账号并删除其云备份？社区贡献会保留。"))
            await request(`auth/v1/admin/users/${id}`, { method: "DELETE" });
        })
      }
    />
  );
}
