import { getApiBase } from "./config";
import { getOrCreateDeviceId } from "@/auth/deviceId";
import {
  clearToken,
  getRefreshToken,
  getSessionToken,
  getToken,
  persistSessionTokenFromAuthPayload,
  setToken,
} from "@/auth/token";
import { ApiError, ProRequiredError } from "./errors";
import { createApexRequestId, responseRequestId } from "./requestId";
import { recordApiTiming } from "@/lib/apexRum";
import {
  applyRestoredAdminCredentials,
  dispatchExitImpersonation,
  isImpersonating,
  readAdminSessionBackup,
  restoreAdminCredentialsFromBackup,
} from "@/lib/impersonation";

// Auth expiry handler registration (e.g. AuthProvider: re-fetch /api/auth/me or clear user).
let authExpiredHandler: (() => void | Promise<void>) | null = null;

export function registerAuthExpiredHandler(
  handler: () => void | Promise<void>,
): void {
  authExpiredHandler = handler;
}

/** Invoked on HTTP 401 from fetchApi (unless skipAuthExpiredCheck). Not exported — use registerAuthExpiredHandler. */
export async function notifyAuthExpired(
  skipAuthExpiredCheck: boolean,
  status: number,
): Promise<void> {
  if (skipAuthExpiredCheck || status !== 401 || !authExpiredHandler) return;
  try {
    await Promise.resolve(authExpiredHandler());
  } catch {
    // Handler errors should not mask the original ApiError.
  }
}

// Pro required event emission
export const PRO_REQUIRED_EVENT = "pro_required";

export function emitProRequiredEvent(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PRO_REQUIRED_EVENT));
  }
}

// Extract error message from response and check for special codes
type ErrorParseResult = {
  message: string;
  code?: string;
  retryAfterMs?: number;
  suspensionReason?: string | null;
  requestId?: string;
};

const AUTH_REFRESH_PATH = "/api/auth/refresh";

/**
 * Auth headers shared by fetchApi and XMLHttpRequest uploads (manual .ibt).
 * JWT must pair with X-Apex-Session for sessionAuthHook routes.
 * Reads the in-memory/localStorage adapter. Does not touch the OS secure store.
 */
export function buildApiAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Request-Id": createApexRequestId(),
  };

  const token = getToken();
  const serverSession = getSessionToken();
  const deviceId = getOrCreateDeviceId();

  if (token) headers.Authorization = `Bearer ${token}`;
  const sessionTrimmed = serverSession?.trim();
  if (sessionTrimmed) headers["X-Apex-Session"] = sessionTrimmed;
  if (deviceId) headers["X-Apex-Device-Id"] = deviceId;

  return headers;
}

export async function extractErrorInfo(
  res: Response,
): Promise<ErrorParseResult> {
  try {
    const text = await res.text();
    const headerId = res.headers.get("x-request-id");
    if (!text) {
      return {
        message: "Request failed",
        requestId: responseRequestId(headerId, undefined),
      };
    }
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const retryRaw = json.retryAfterMs;
      const retryAfterMs =
        typeof retryRaw === "number" && Number.isFinite(retryRaw)
          ? retryRaw
          : undefined;
      const sr = json.suspensionReason;
      const suspensionReason =
        sr === null ? null : typeof sr === "string" ? sr : undefined;
      return {
        message: (json.message as string) || (json.error as string) || text,
        code: json.code as string | undefined,
        retryAfterMs,
        requestId: responseRequestId(headerId, json),
        ...(suspensionReason !== undefined ? { suspensionReason } : {}),
      };
    } catch {
      return {
        message: text,
        requestId: responseRequestId(headerId, undefined),
      };
    }
  } catch {
    return { message: "Request failed" };
  }
}

export type FetchApiOptions = {
  /** When true, skip calling the auth-expired handler on 401 (login, register, authMe, etc.). */
  skipAuthExpiredCheck?: boolean;
  /** Only set for cross-origin cookie endpoints (e.g. discussion view anon cookie). */
  credentials?: RequestCredentials;
  /** Internal: this call already retried after a token refresh. */
  didRetryAfterRefresh?: boolean;
  /** Extra request headers (e.g. impersonation restore session). */
  extraHeaders?: Record<string, string>;
  /** Skip admin restore on 401 (the stop-impersonation call itself). */
  skipImpersonationRestore?: boolean;
};

type RefreshOutcome =
  | { status: "refreshed" }
  | { status: "invalid"; refreshToken: string }
  | { status: "transient"; error: ApiError };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

function storedRefreshToken(): string | null {
  const raw = getRefreshToken()?.trim();
  return raw || null;
}

function storedAccessToken(): string | null {
  const raw = getToken()?.trim();
  return raw || null;
}

function isAuthRefreshPath(path: string): boolean {
  return path.includes(AUTH_REFRESH_PATH);
}

function isImpersonationStopPath(path: string): boolean {
  return path.includes("/api/auth/impersonation/stop");
}

let impersonationRestoreInFlight: Promise<boolean> | null = null;

async function restoreAdminAfterImpersonation401(): Promise<boolean> {
  if (impersonationRestoreInFlight) return impersonationRestoreInFlight;
  impersonationRestoreInFlight = (async () => {
    const backupSession = readAdminSessionBackup();
    const token = storedAccessToken();
    if (token) {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          "X-Request-Id": createApexRequestId(),
        };
        if (backupSession) {
          headers["X-Apex-Impersonator-Session"] = backupSession;
        }
        const res = await fetch(`${getApiBase()}/api/auth/impersonation/stop`, {
          method: "POST",
          headers,
        });
        if (res.ok) {
          const data = (await res.json()) as {
            token?: string;
            sessionToken?: string;
            refreshToken?: string;
          };
          if (typeof data?.token === "string" && data.token.trim()) {
            await applyRestoredAdminCredentials({
              token: data.token.trim(),
              sessionToken: data.sessionToken,
              refreshToken: data.refreshToken,
            });
            return true;
          }
        }
      } catch {
        // Fall back to stored admin backups.
      }
    }
    return restoreAdminCredentialsFromBackup();
  })();
  try {
    return await impersonationRestoreInFlight;
  } finally {
    impersonationRestoreInFlight = null;
  }
}

async function performRefresh(
  expectedRefreshToken: string,
): Promise<RefreshOutcome> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) {
    return { status: "invalid", refreshToken: expectedRefreshToken };
  }

  // Another tab refreshed while this tab waited for the Web Lock.
  if (refreshToken !== expectedRefreshToken) {
    return { status: "refreshed" };
  }

  try {
    const data = await fetchApi<{ token?: string; refreshToken?: string }>(
      "POST",
      AUTH_REFRESH_PATH,
      { refreshToken },
      { skipAuthExpiredCheck: true },
    );
    if (typeof data?.token !== "string" || !data.token.trim()) {
      return {
        status: "transient",
        error: new ApiError(502, "Invalid token refresh response."),
      };
    }

    // Write access first: once other tabs observe the rotated refresh token,
    // buildApiAuthHeaders() can already read the matching new access token.
    await setToken(data.token);
    if (typeof data.refreshToken === "string" && data.refreshToken.trim()) {
      await persistSessionTokenFromAuthPayload({
        refreshToken: data.refreshToken,
      });
    }
    return { status: "refreshed" };
  } catch (error) {
    // A concurrent tab may have completed refresh while this request was in
    // flight. Its rotated token wins even if this request received a 401.
    const latestRefreshToken = storedRefreshToken();
    if (latestRefreshToken && latestRefreshToken !== refreshToken) {
      return { status: "refreshed" };
    }

    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 401)
    ) {
      return { status: "invalid", refreshToken };
    }

    return {
      status: "transient",
      error:
        error instanceof ApiError
          ? error
          : new ApiError(0, "Connection lost. Please try again."),
    };
  }
}

async function refreshAccessToken(): Promise<RefreshOutcome> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) {
    return { status: "invalid", refreshToken: "" };
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      // Web Locks serialize refresh-token rotation across browser tabs.
      if (typeof navigator !== "undefined" && navigator.locks) {
        return await navigator.locks.request("apex-auth-refresh", () =>
          performRefresh(refreshToken),
        );
      }
      return await performRefresh(refreshToken);
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function parseSuccessBody<T>(text: string): T {
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

// Central fetch handler (exported for auth/api and other modules that need it).
// Token is read from the auth storage adapter. On 401, try refresh once, then notifyAuthExpired
// (unless skipAuthExpiredCheck) so AuthContext can sync user state.
export async function fetchApi<T>(
  method: string,
  path: string,
  body?: unknown,
  options: boolean | FetchApiOptions = false,
): Promise<T> {
  const opts: FetchApiOptions =
    typeof options === "boolean" ? { skipAuthExpiredCheck: options } : options;
  const skipAuthExpiredCheck = opts.skipAuthExpiredCheck ?? false;
  const didRetryAfterRefresh = opts.didRetryAfterRefresh ?? false;
  const hasJsonBody = body !== undefined;
  const headers: Record<string, string> = {
    // Only when we send a body: Fastify rejects Content-Type: application/json with an empty body.
    ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
    ...buildApiAuthHeaders(),
    ...(opts.extraHeaders ?? {}),
  };

  const url = path.startsWith("http")
    ? path
    : `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;

  const rumStarted = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(opts.credentials ? { credentials: opts.credentials } : {}),
      body: hasJsonBody ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Connection lost. Please try again.");
  }
  recordApiTiming(method, path, res, rumStarted);

  if (res.ok) {
    const text = await res.text();
    return parseSuccessBody<T>(text);
  }

  const { message, code, retryAfterMs, suspensionReason, requestId } =
    await extractErrorInfo(res);

  // Handle PRO_REQUIRED error code - throw specific error type
  if (code === "PRO_REQUIRED") {
    emitProRequiredEvent();
    const proError = new ProRequiredError(message);
    proError.requestId = requestId;
    throw proError;
  }

  const shouldTryImpersonationRestore =
    res.status === 401 &&
    !opts.skipImpersonationRestore &&
    !skipAuthExpiredCheck &&
    !isAuthRefreshPath(path) &&
    !isImpersonationStopPath(path) &&
    isImpersonating();

  if (shouldTryImpersonationRestore) {
    const restored = await restoreAdminAfterImpersonation401();
    if (restored) {
      // Never replay the request with the restored admin credentials: the caller asked for the
      // impersonated user's data and would silently render the admin's response instead.
      dispatchExitImpersonation();
      throw new ApiError(
        res.status,
        "Impersonation ended — you are back in your admin account.",
        code,
        retryAfterMs,
        requestId,
      );
    }
  }

  const canRefresh =
    res.status === 401 &&
    !didRetryAfterRefresh &&
    !skipAuthExpiredCheck &&
    !isAuthRefreshPath(path) &&
    Boolean(storedAccessToken()) &&
    Boolean(storedRefreshToken());

  if (canRefresh) {
    const refresh = await refreshAccessToken();
    if (refresh.status === "refreshed") {
      return fetchApi<T>(method, path, body, {
        ...opts,
        skipAuthExpiredCheck,
        didRetryAfterRefresh: true,
      });
    }
    if (refresh.status === "transient") {
      // Keep the refresh token: offline/network/5xx failures do not prove the
      // session is invalid, and must not trigger the auth-expired handler.
      throw refresh.error;
    }

    // Do not delete credentials rotated by another tab after refresh settled.
    if (refresh.refreshToken && storedRefreshToken() !== refresh.refreshToken) {
      return fetchApi<T>(method, path, body, {
        ...opts,
        skipAuthExpiredCheck,
        didRetryAfterRefresh: true,
      });
    }
    await clearToken();
  }

  await notifyAuthExpired(skipAuthExpiredCheck, res.status);

  const err = new ApiError(res.status, message, code, retryAfterMs, requestId);
  if (suspensionReason !== undefined) {
    err.suspensionReason = suspensionReason;
  }
  throw err;
}
