import { fetchApi } from "./fetchClient";
import {
  applyRestoredAdminCredentials,
  dispatchExitImpersonation,
  readAdminSessionBackup,
  restoreAdminCredentialsFromBackup,
} from "@/lib/impersonation";

export type StopImpersonationResponse = {
  token: string;
  sessionToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: "USER" | "ADMIN" };
};

export async function postStopImpersonation(): Promise<StopImpersonationResponse> {
  const backupSession = readAdminSessionBackup();
  return fetchApi<StopImpersonationResponse>(
    "POST",
    "/api/auth/impersonation/stop",
    {},
    {
      skipAuthExpiredCheck: true,
      skipImpersonationRestore: true,
      extraHeaders: backupSession
        ? { "X-Apex-Impersonator-Session": backupSession }
        : undefined,
    },
  );
}

/** Stop impersonation via API, falling back to stored admin backups. */
export async function exitImpersonationSession(): Promise<boolean> {
  let apiError: unknown;
  try {
    const data = await postStopImpersonation();
    if (typeof data?.token === "string" && data.token.trim()) {
      await applyRestoredAdminCredentials({
        token: data.token.trim(),
        sessionToken: data.sessionToken,
        refreshToken: data.refreshToken,
      });
      dispatchExitImpersonation();
      return true;
    }
  } catch (err) {
    apiError = err;
  }
  if (await restoreAdminCredentialsFromBackup()) {
    dispatchExitImpersonation();
    return true;
  }
  if (apiError) throw apiError;
  return false;
}
