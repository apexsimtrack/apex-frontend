import {
  APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY,
  APEX_REFRESH_TOKEN_KEY,
  APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY,
  APEX_SESSION_TOKEN_KEY,
  APEX_TOKEN_ADMIN_KEY,
  LEGACY_SESSION_ADMIN_BACKUP_KEY,
  TOKEN_KEY,
  flushAuthSecrets,
  readAuthSecret,
  stageAuthSecret,
} from "./authSecretStore";

export {
  APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY,
  APEX_REFRESH_TOKEN_KEY,
  APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY,
  APEX_SESSION_TOKEN_KEY,
  APEX_TOKEN_ADMIN_KEY,
  LEGACY_SESSION_ADMIN_BACKUP_KEY,
};

/** Drop impersonation restore material so a later `/api/auth/refresh` cannot mint admin tokens. */
export async function clearAdminCredentialBackups(): Promise<void> {
  stageAuthSecret(APEX_TOKEN_ADMIN_KEY, null);
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
}

export function getToken(): string | null {
  return readAuthSecret(TOKEN_KEY);
}

export function getSessionToken(): string | null {
  return readAuthSecret(APEX_SESSION_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return readAuthSecret(APEX_REFRESH_TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  stageAuthSecret(TOKEN_KEY, token);
  await flushAuthSecrets();
}

export async function removeStoredAccessToken(): Promise<void> {
  stageAuthSecret(TOKEN_KEY, null);
  await flushAuthSecrets();
}

/** Persist server session id returned from login / verify-email alongside JWT. */
export async function persistSessionTokenFromAuthPayload(payload: {
  sessionToken?: string;
  refreshToken?: string;
}): Promise<void> {
  const isFullClear = payload != null && Object.keys(payload).length === 0;

  const s =
    typeof payload.sessionToken === "string" ? payload.sessionToken.trim() : "";
  if (s) stageAuthSecret(APEX_SESSION_TOKEN_KEY, s);
  else if ("sessionToken" in payload || isFullClear)
    stageAuthSecret(APEX_SESSION_TOKEN_KEY, null);

  const r =
    typeof payload.refreshToken === "string" ? payload.refreshToken.trim() : "";
  if (r) stageAuthSecret(APEX_REFRESH_TOKEN_KEY, r);
  else if ("refreshToken" in payload || isFullClear)
    stageAuthSecret(APEX_REFRESH_TOKEN_KEY, null);

  await flushAuthSecrets();
}

export async function clearToken(): Promise<void> {
  stageAuthSecret(TOKEN_KEY, null);
  stageAuthSecret(APEX_SESSION_TOKEN_KEY, null);
  stageAuthSecret(APEX_REFRESH_TOKEN_KEY, null);
  stageAuthSecret(APEX_TOKEN_ADMIN_KEY, null);
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
  // Same-tab storage changes do not fire `storage` events; AuthContext listens for this to sync
  // hasTokenState and clear cached session data (see contexts/AuthContext.tsx).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("apex:auth"));
  }
}
