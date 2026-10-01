import { API_BASE } from "./config";
import { ApiError } from "./errors";
import {
  buildApiAuthHeaders,
  extractErrorInfo,
  notifyAuthExpired,
} from "./fetchClient";
import { responseRequestId } from "./requestId";

export type DataExportDepth = "summary" | "full";

export type DataExportJobStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed"
  | "expired";

export type DataExportJob = {
  id: string;
  depth: DataExportDepth;
  scope: "user" | "session";
  sessionId?: string;
  status: DataExportJobStatus;
  requestedAt: string;
  completedAt?: string;
  expiresAt?: string;
  byteSize?: number;
  downloadUrl?: string;
  error?: { code: string; message: string };
};

async function parseJobResponse(res: Response): Promise<DataExportJob | null> {
  const body = (await res.json()) as { job?: DataExportJob | null };
  return body.job ?? null;
}

/**
 * POST /api/settings/data-export — enqueue an async zip export (202).
 */
export async function requestUserDataExport(options?: {
  depth?: DataExportDepth;
}): Promise<DataExportJob> {
  const depth = options?.depth ?? "summary";
  const url = `${API_BASE}/api/settings/data-export`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...buildApiAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ depth }),
    });
  } catch {
    throw new ApiError(0, "Connection lost. Please try again.");
  }

  if (!res.ok) {
    const { message, code, retryAfterMs, requestId } = await extractErrorInfo(res);
    await notifyAuthExpired(false, res.status);
    throw new ApiError(res.status, message, code, retryAfterMs, requestId);
  }

  const requestId = responseRequestId(res.headers.get("x-request-id"), undefined);
  const job = await parseJobResponse(res);
  if (!job) {
    throw new ApiError(500, "Invalid export response.", undefined, undefined, requestId);
  }
  return job;
}

/**
 * GET /api/settings/data-export/latest — latest job for the current user (or null).
 */
export async function fetchLatestUserDataExport(): Promise<DataExportJob | null> {
  const url = `${API_BASE}/api/settings/data-export/latest`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: buildApiAuthHeaders(),
    });
  } catch {
    throw new ApiError(0, "Connection lost. Please try again.");
  }

  if (!res.ok) {
    const { message, code, retryAfterMs, requestId } = await extractErrorInfo(res);
    await notifyAuthExpired(false, res.status);
    throw new ApiError(res.status, message, code, retryAfterMs, requestId);
  }

  return parseJobResponse(res);
}

/**
 * GET /api/settings/data-export/:jobId
 */
export async function fetchUserDataExportJob(
  jobId: string
): Promise<DataExportJob> {
  const url = `${API_BASE}/api/settings/data-export/${encodeURIComponent(jobId)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: buildApiAuthHeaders(),
    });
  } catch {
    throw new ApiError(0, "Connection lost. Please try again.");
  }

  if (!res.ok) {
    const { message, code, retryAfterMs, requestId } = await extractErrorInfo(res);
    await notifyAuthExpired(false, res.status);
    throw new ApiError(res.status, message, code, retryAfterMs, requestId);
  }

  const requestId = responseRequestId(res.headers.get("x-request-id"), undefined);
  const job = await parseJobResponse(res);
  if (!job) {
    throw new ApiError(404, "Export job not found.", undefined, undefined, requestId);
  }
  return job;
}

/** Open a ready export download URL in a new navigation (presigned R2). */
export function openDataExportDownload(job: DataExportJob): void {
  if (!job.downloadUrl) {
    throw new ApiError(400, "Download is not ready yet.");
  }
  const a = document.createElement("a");
  a.href = job.downloadUrl;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
