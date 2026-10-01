import { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";
import type { RequestFn } from "@/App";
import type { Session } from "@/lib/session";
import type {
  MfaStatus,
  MfaSetup,
  PasskeyCredential,
  BackupCodeStatus,
} from "@/lib/app-types";
import { SettingsPage } from "./SettingsPage";
export function AccountPage({
  session,
  setSession,
  request,
}: {
  session: Session;
  setSession: (session: Session) => void;
  request: RequestFn;
}) {
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState("");
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [backupCodeStatus, setBackupCodeStatus] = useState<BackupCodeStatus>({
    activeCount: 0,
    latestGeneratedAt: null,
  });
  const load = useCallback(async () => {
    const [status, keys, codes] = await Promise.all([
      request<MfaStatus>("auth/v1/mfa/status"),
      request<{ passkeys: PasskeyCredential[] }>("auth/v1/mfa/passkeys"),
      request<BackupCodeStatus>("auth/v1/mfa/backup-codes"),
    ]);
    setMfaStatus(status);
    setPasskeys(keys.passkeys);
    setBackupCodeStatus(codes);
  }, [request]);
  useEffect(() => {
    void load().catch((error) => toast.error(error.message));
  }, [load]);
  const action = async <T,>(work: () => Promise<T>): Promise<T | null> => {
    try {
      return await work();
    } catch (error) {
      toast.error((error as Error).message);
      return null;
    }
  };
  const post = (path: string, body?: unknown) =>
    request(`auth/v1/mfa/${path}`, { method: "POST", body });
  return (
    <SettingsPage
      sessionUser={session.user}
      mfaStatus={mfaStatus}
      mfaSetup={mfaSetup}
      mfaSetupCode={mfaSetupCode}
      passkeys={passkeys}
      backupCodeStatus={backupCodeStatus}
      onMfaSetupCodeChange={setMfaSetupCode}
      onStartTotpSetup={async () => {
        await action(async () =>
          setMfaSetup(
            await request<MfaSetup>("auth/v1/mfa/totp:startSetup", {
              method: "POST",
            }),
          ),
        );
      }}
      onConfirmTotpSetup={async () => {
        await action(async () => {
          await post("totp:confirmSetup", { code: mfaSetupCode });
          setMfaSetup(null);
          setMfaSetupCode("");
          await load();
        });
      }}
      onDisableTotp={async () => {
        await action(async () => {
          await post("totp:disable");
          await load();
        });
      }}
      onUpdateUsername={async (username) =>
        Boolean(
          await action(async () => {
            const result = await request<Session["user"]>("auth/v1/me", {
              method: "PATCH",
              body: { username },
            });
            setSession({ ...session, user: result });
            return true;
          }),
        )
      }
      onRegisterPasskey={() =>
        action(async () => {
          const options = await request<
            Parameters<typeof startRegistration>[0]["optionsJSON"]
          >("auth/v1/mfa/passkeys:startRegistration", { method: "POST" });
          const response = await startRegistration({ optionsJSON: options });
          const result = await request<{ passkey: { credentialId: string } }>(
            "auth/v1/mfa/passkeys:finishRegistration",
            { method: "POST", body: { response } },
          );
          await load();
          return result.passkey.credentialId;
        })
      }
      onRenamePasskey={async (credentialId, name) =>
        Boolean(
          await action(async () => {
            await request(
              `auth/v1/mfa/passkey/${encodeURIComponent(credentialId)}`,
              { method: "PATCH", body: { name } },
            );
            await load();
            return true;
          }),
        )
      }
      onDeletePasskey={async (credentialId) => {
        await action(async () => {
          await request(
            `auth/v1/mfa/passkey/${encodeURIComponent(credentialId)}`,
            { method: "DELETE" },
          );
          await load();
        });
      }}
      onRegenerateBackupCodes={() =>
        action(async () => {
          const result = await request<
            BackupCodeStatus & { codes: string[]; generatedAt: string }
          >("auth/v1/mfa/backup-codes:regenerate", { method: "POST" });
          await load();
          return result;
        })
      }
    />
  );
}
