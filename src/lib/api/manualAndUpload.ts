import { API_BASE } from "./config";
import { ApiError } from "./errors";
import { responseRequestId } from "./requestId";
import {
  buildApiAuthHeaders,
  fetchApi,
  notifyAuthExpired,
  emitProRequiredEvent,
} from "./fetchClient";
import { apiGet, apiPost } from "./httpVerbs";

// Manual session upload
export type ManualUploadResponse = {
  sessionId: string;
  status?: string;
  lapCount?: number;
  message?: string;
  /** Present when a challenge was requested but could not be attached. */
  challengeAttachWarning?: string;
};

export type UploadSessionFileCallbacks = {
  onUploadProgress?: (percent: number) => void;
  /** Fired when the request body has finished sending; server may still be processing. */
  onUploadComplete?: () => void;
};

export const UPLOAD_INACTIVITY_TIMEOUT_MS = 90_000;

export type UploadSessionFileOptions = {
  challengeId?: string;
  /**
   * Optional finishing/qualifying position and grid size. LMU `.duckdb` files
   * carry no classified result, so the uploader can supply it here.
   */
  position?: string;
  totalDrivers?: string;
  signal?: AbortSignal;
  /** Primarily exposed so transport behavior can be tested without waiting. */
  inactivityTimeoutMs?: number;
};

// Manual activity creation (no file upload)
export type ManualActivityLapPayload = {
  lapTimeMs: number;
  sectorTimesMs?: (number | null)[];
  sector1Ms?: number | null;
  sector2Ms?: number | null;
  sector3Ms?: number | null;
};

export type ManualActivityRequest = {
  sim: string;
  trackId: string;
  /** PRACTICE | QUALIFY | RACE */
  manualSessionKind: "PRACTICE" | "QUALIFY" | "RACE";
  carId?: string;
  position?: number;
  totalDrivers?: number;
  /** Race sessions: qualifying finishing position. */
  qualifyingPosition?: number;
  /** Ordered laps (ms); optional sectors when provided. */
  laps?: ManualActivityLapPayload[];
  /** 0 disables sectors; otherwise every lap carries this many ordered slots. */
  sectorCount?: number;
  /** Public caption shown on activity/session cards. */
  caption?: string;
  /** Track weather conditions. */
  conditions?: "DRY" | "WET" | "MIXED";
  /** Link session to a challenge (must be active; you must have joined; track/car must match). */
  challengeId?: string;
};

export type ManualActivityResponse = {
  sessionId: string;
  message?: string;
};

/**
 * Build JSON body so `laps` is never lost: `JSON.stringify` drops keys whose value is `undefined`,
 * which previously omitted `laps` and led to sessions with no Lap rows.
 * When laps are present, also sends `bestLapMs` (min) for server convenience.
 */
export function buildManualActivityRequestBody(
  data: ManualActivityRequest,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sim: data.sim,
    trackId: data.trackId,
    manualSessionKind: data.manualSessionKind,
  };
  if (
    data.sectorCount != null &&
    Number.isInteger(data.sectorCount) &&
    data.sectorCount >= 0 &&
    data.sectorCount <= 64
  ) {
    body.sectorCount = data.sectorCount;
  }
  if (data.carId != null && String(data.carId).trim() !== "") {
    body.carId = data.carId;
  }
  if (data.position != null && Number.isFinite(data.position)) {
    body.position = data.position;
  }
  if (data.totalDrivers != null && Number.isFinite(data.totalDrivers)) {
    body.totalDrivers = data.totalDrivers;
  }
  if (
    data.qualifyingPosition != null &&
    Number.isFinite(data.qualifyingPosition)
  ) {
    body.qualifyingPosition = Math.round(data.qualifyingPosition as number);
  }
  if (data.caption !== undefined) {
    // Empty string clears caption on update; omit only when undefined.
    body.caption = String(data.caption).trim();
  }
  if (
    data.conditions === "DRY" ||
    data.conditions === "WET" ||
    data.conditions === "MIXED"
  ) {
    body.conditions = data.conditions;
  }

  const laps = Array.isArray(data.laps)
    ? data.laps
        .filter(
          (l) =>
            l &&
            typeof l.lapTimeMs === "number" &&
            Number.isFinite(l.lapTimeMs),
        )
        .map((l) => {
          const row: ManualActivityLapPayload = {
            lapTimeMs: Math.round(l.lapTimeMs),
          };
          if (Array.isArray(l.sectorTimesMs)) {
            row.sectorTimesMs = l.sectorTimesMs.map((value) =>
              value != null && Number.isFinite(value) ? Math.round(value) : null,
            );
          }
          if (l.sector1Ms != null && Number.isFinite(l.sector1Ms)) {
            row.sector1Ms = Math.round(l.sector1Ms);
          }
          if (l.sector2Ms != null && Number.isFinite(l.sector2Ms)) {
            row.sector2Ms = Math.round(l.sector2Ms);
          }
          if (l.sector3Ms != null && Number.isFinite(l.sector3Ms)) {
            row.sector3Ms = Math.round(l.sector3Ms);
          }
          return row;
        })
    : [];

  if (laps.length > 0) {
    body.laps = laps;
    body.bestLapMs = Math.min(...laps.map((l) => l.lapTimeMs));
  }

  if (data.challengeId != null && String(data.challengeId).trim() !== "") {
    body.challengeId = String(data.challengeId).trim();
  }

  return body;
}

export async function createManualActivity(
  data: ManualActivityRequest,
): Promise<ManualActivityResponse> {
  return apiPost<ManualActivityResponse>(
    "/api/sessions/manual-activity",
    buildManualActivityRequestBody(data),
  );
}

/** Owner session update (manual + telemetry); canonical route is PUT /api/sessions/:id. */
export async function updateActivity(
  sessionId: string,
  data: ManualActivityRequest,
): Promise<ManualActivityResponse> {
  return fetchApi<ManualActivityResponse>(
    "PUT",
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    buildManualActivityRequestBody(data),
  );
}

export async function updateManualActivity(
  sessionId: string,
  data: ManualActivityRequest,
): Promise<ManualActivityResponse> {
  return updateActivity(sessionId, data);
}

/** Owner or admin: set/clear public session caption. */
export async function patchSessionCaption(
  sessionId: string,
  caption: string | null,
): Promise<{ ok: boolean; caption: string | null }> {
  return fetchApi(
    "PATCH",
    `/api/sessions/${encodeURIComponent(sessionId)}/caption`,
    { caption },
  );
}

/** Delete any session owned by the signed-in user, regardless of ingest source. */
export async function deleteSession(sessionId: string): Promise<void> {
  return fetchApi<void>(
    "DELETE",
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export type CatalogTrack = {
  id: string;
  name: string;
  lengthKm?: number | null;
};
export type CatalogCar = { id: string; name: string };
export type CatalogsResponse = {
  tracks: CatalogTrack[];
  cars: CatalogCar[];
};

export async function getCatalogs(sim: string): Promise<CatalogsResponse> {
  return apiGet<CatalogsResponse>(`/api/catalogs/${encodeURIComponent(sim)}`);
}

function parseXhrErrorPayload(
  text: string,
  header: string | null,
): {
  message: string;
  code?: string;
  retryAfterMs?: number;
  requestId?: string;
} {
  let message = "Request failed";
  let code: string | undefined;
  let retryAfterMs: number | undefined;
  let body: unknown;
  if (!text.trim()) {
    return { message, requestId: responseRequestId(header, undefined) };
  }
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    body = json;
    message =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      message;
    if (typeof json.code === "string") code = json.code;
    const retryRaw = json.retryAfterMs;
    if (typeof retryRaw === "number" && Number.isFinite(retryRaw))
      retryAfterMs = retryRaw;
  } catch {
    message = text;
  }
  return { message, code, retryAfterMs, requestId: responseRequestId(header, body) };
}

export async function uploadSessionFile(
  file: File,
  callbacks?: UploadSessionFileCallbacks,
  options?: UploadSessionFileOptions,
): Promise<ManualUploadResponse> {
  // Scalar fields go first so the API can read them without buffering the file.
  const formData = new FormData();
  if (options?.challengeId?.trim()) {
    formData.append("challengeId", options.challengeId.trim());
  }
  if (options?.position?.trim()) {
    formData.append("position", options.position.trim());
  }
  if (options?.totalDrivers?.trim()) {
    formData.append("totalDrivers", options.totalDrivers.trim());
  }
  formData.append("file", file);

  const authHeaders = buildApiAuthHeaders();
  const url = `${API_BASE}/api/sessions/manual-upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let lastLoadedBytes = 0;

    const clearInactivityTimer = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    };

    const cleanup = () => {
      clearInactivityTimer();
      options?.signal?.removeEventListener("abort", handleSignalAbort);
    };

    const resolveOnce = (value: ManualUploadResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const rejectOnce = (error: ApiError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const abortWithError = (error: ApiError) => {
      rejectOnce(error);
      xhr.abort();
    };

    const resetInactivityTimer = () => {
      clearInactivityTimer();
      const timeoutMs =
        options?.inactivityTimeoutMs ?? UPLOAD_INACTIVITY_TIMEOUT_MS;
      inactivityTimer = setTimeout(() => {
        abortWithError(
          new ApiError(
            0,
            "Upload stopped because no data was transferred for 90 seconds. Check your connection and try again.",
            "UPLOAD_STALLED",
          ),
        );
      }, timeoutMs);
    };

    function handleSignalAbort() {
      abortWithError(
        new ApiError(
          0,
          "Upload canceled. Your selected file is ready to retry.",
          "UPLOAD_CANCELED",
        ),
      );
    }

    xhr.open("POST", url);
    // Auth uses Bearer + X-Apex-Session headers (not cookies). Keep XHR non-credentialed so
    // discussion anon cookies are not required for uploads; CORS credentials:true on the API
    // still allows this as long as Access-Control-Allow-Origin echoes the request Origin.
    for (const [name, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.loaded > lastLoadedBytes) {
        lastLoadedBytes = ev.loaded;
        resetInactivityTimer();
      }
      if (!callbacks?.onUploadProgress) return;
      const total = ev.lengthComputable ? ev.total : file.size;
      if (total > 0) {
        const pct = Math.min(100, Math.round((ev.loaded / total) * 100));
        callbacks.onUploadProgress(pct);
      }
    };

    xhr.upload.addEventListener("load", () => {
      clearInactivityTimer();
      callbacks?.onUploadComplete?.();
    });

    xhr.onload = () => {
      clearInactivityTimer();
      void (async () => {
        const status = xhr.status;
        const text = xhr.responseText ?? "";

        if (status >= 200 && status < 300) {
          if (!text.trim()) {
            rejectOnce(new ApiError(500, "No response from server"));
            return;
          }
          try {
            resolveOnce(JSON.parse(text) as ManualUploadResponse);
          } catch {
            rejectOnce(new ApiError(500, "Invalid response from server"));
          }
          return;
        }

        await notifyAuthExpired(false, status);
        const { message, code, retryAfterMs, requestId } = parseXhrErrorPayload(
          text,
          xhr.getResponseHeader("X-Request-Id"),
        );
        if (code === "PRO_REQUIRED") emitProRequiredEvent();
        rejectOnce(new ApiError(status, message, code, retryAfterMs, requestId));
      })();
    };

    xhr.onerror = () => {
      rejectOnce(new ApiError(0, "Connection lost. Please try again."));
    };

    xhr.onabort = () => {
      rejectOnce(
        new ApiError(
          0,
          "Upload canceled. Your selected file is ready to retry.",
          "UPLOAD_CANCELED",
        ),
      );
    };

    if (options?.signal?.aborted) {
      handleSignalAbort();
      return;
    }
    options?.signal?.addEventListener("abort", handleSignalAbort, {
      once: true,
    });
    resetInactivityTimer();
    xhr.send(formData);
  });
}
