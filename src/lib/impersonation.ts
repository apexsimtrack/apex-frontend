import {
  APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY,
  APEX_REFRESH_TOKEN_KEY,
  APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY,
  APEX_SESSION_TOKEN_KEY,
  APEX_TOKEN_ADMIN_KEY,
  LEGACY_SESSION_ADMIN_BACKUP_KEY,
  clearAdminCredentialBackups,
  getRefreshToken,
  getSessionToken,
  getToken,
  persistSessionTokenFromAuthPayload,
  setToken,
} from "@/auth/token";
import {
  TOKEN_KEY,
  flushAuthSecrets,
  readAuthSecret,
  stageAuthSecret,
} from "@/auth/authSecretStore";

const IMPERSONATION_BANNER_HIDDEN_KEY = "apex_impersonation_banner_hidden";

export {
  APEX_TOKEN_ADMIN_KEY,
  LEGACY_SESSION_ADMIN_BACKUP_KEY,
  clearAdminCredentialBackups,
};

function base64UrlToJson(segment: string): Record<string, unknown> | null {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Decode JWT payload from storage (no signature verification — UI-only detection). */
export function parseStoredAccessTokenPayload(): Record<
  string,
  unknown
> | null {
  const token = getToken();
  if (!token?.trim()) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  return base64UrlToJson(parts[1]!);
}

export function isImpersonating(): boolean {
  const payload = parseStoredAccessTokenPayload();
  const imp = payload?.impersonatorId;
  return typeof imp === "string" && imp.length > 0;
}

export function impersonatedUserEmail(): string | null {
  const payload = parseStoredAccessTokenPayload();
  const email = payload?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

/** JWT `sub` from stored access token (no verification). Used to detect user identity changes. */
export function storedAccessTokenSubject(): string | null {
  const payload = parseStoredAccessTokenPayload();
  const sub = payload?.sub;
  return typeof sub === "string" ? sub : null;
}

export async function backupAdminCredentialsForImpersonation(): Promise<void> {
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(IMPERSONATION_BANNER_HIDDEN_KEY);
    } catch {
      /* ignore */
    }
  }
  const cur = getToken();
  if (cur?.trim()) stageAuthSecret(APEX_TOKEN_ADMIN_KEY, cur.trim());
  const curSession = getSessionToken();
  if (curSession?.trim()) {
    stageAuthSecret(APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY, curSession.trim());
  } else {
    stageAuthSecret(APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY, null);
  }
  const curRefresh = getRefreshToken();
  if (curRefresh?.trim()) {
    stageAuthSecret(APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY, curRefresh.trim());
  } else {
    stageAuthSecret(APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY, null);
  }
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(LEGACY_SESSION_ADMIN_BACKUP_KEY);
    } catch {
      /* ignore */
    }
  }
  await flushAuthSecrets();
}

export function isImpersonationBannerHidden(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(IMPERSONATION_BANNER_HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function hideImpersonationBanner(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(IMPERSONATION_BANNER_HIDDEN_KEY, "true");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("apex:impersonation-banner"));
}

export function readAdminSessionBackup(): string | null {
  return readAuthSecret(APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY)?.trim() || null;
}

export async function applyRestoredAdminCredentials(payload: {
  token: string;
  sessionToken?: string;
  refreshToken?: string;
}): Promise<void> {
  await setToken(payload.token);
  await persistSessionTokenFromAuthPayload({
    sessionToken: payload.sessionToken,
    refreshToken: payload.refreshToken,
  });
  await clearAdminCredentialBackups();
}

/** Restore admin JWT/session/refresh from stored backups. Returns false if no admin JWT. */
export async function restoreAdminCredentialsFromBackup(): Promise<boolean> {
  const admin = readAuthSecret(APEX_TOKEN_ADMIN_KEY);
  if (!admin?.trim()) {
    await clearAdminCredentialBackups();
    return false;
  }
  const adminSession = readAuthSecret(APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY);
  const adminRefresh = readAuthSecret(APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY);
  stageAuthSecret(APEX_TOKEN_ADMIN_KEY, null);
  stageAuthSecret(TOKEN_KEY, admin.trim());
  if (adminSession?.trim()) {
    stageAuthSecret(APEX_SESSION_TOKEN_KEY, adminSession.trim());
  } else {
    stageAuthSecret(APEX_SESSION_TOKEN_KEY, null);
  }
  if (adminRefresh?.trim()) {
    stageAuthSecret(APEX_REFRESH_TOKEN_KEY, adminRefresh.trim());
  } else {
    stageAuthSecret(APEX_REFRESH_TOKEN_KEY, null);
  }
  stageAuthSecret(APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY, null);
  stageAuthSecret(APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY, null);
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(LEGACY_SESSION_ADMIN_BACKUP_KEY);
    } catch {
      /* ignore */
    }
  }
  await flushAuthSecrets();
  return true;
}

export function dispatchExitImpersonation(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("apex:auth", { detail: { exitImpersonation: true } }),
  );
}
