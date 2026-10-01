import type { AgentOs } from "@/hooks/useDetectedAgentOs";
import { AGENT_DOWNLOAD_FILENAMES } from "@/hooks/useDetectedAgentOs";
import { API_BASE } from "./config";
import { openExternalUrl } from "@/lib/capacitor/openExternalUrl";
import { ApiError, ProRequiredError } from "./errors";
import { responseRequestId } from "./requestId";
import {
  buildApiAuthHeaders,
  emitProRequiredEvent,
  extractErrorInfo,
  notifyAuthExpired,
} from "./fetchClient";

export type AgentDownloadResponse = {
  url: string;
  expiresAt: string;
  filename: string;
  os: AgentOs;
};

function agentDownloadEndpoint(os: AgentOs): string {
  const path = `/api/agent/download-link?os=${encodeURIComponent(os)}`;
  return `${API_BASE}${path}`;
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return null;
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  return quoted?.[1] ?? null;
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const base = contentType.split(";")[0]?.trim().toLowerCase();
  return base === "application/json" || base.endsWith("+json");
}

async function triggerBlobDownload(
  blob: Blob,
  filename: string,
): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * GET /api/agent/download-link?os= — Pro-only agent installer.
 *
 * - R2 presigned JSON: `{ url, expiresAt, filename, os }` → navigate to `url`
 * - Dev local file: `application/octet-stream` → blob download
 */
export async function getAgentDownloadLink(
  os: AgentOs,
): Promise<AgentDownloadResponse> {
  let res: Response;
  try {
    res = await fetch(agentDownloadEndpoint(os), {
      method: "GET",
      headers: buildApiAuthHeaders(),
    });
  } catch {
    throw new ApiError(0, "Connection lost. Please try again.");
  }

  if (!res.ok) {
    const { message, code, retryAfterMs, requestId } = await extractErrorInfo(res);
    if (code === "PRO_REQUIRED") {
      emitProRequiredEvent();
      const proError = new ProRequiredError(message);
      proError.requestId = requestId;
      throw proError;
    }
    await notifyAuthExpired(false, res.status);
    throw new ApiError(res.status, message, code, retryAfterMs, requestId);
  }

  if (isJsonContentType(res.headers.get("Content-Type"))) {
    const payload = (await res.json()) as AgentDownloadResponse;
    if (!payload?.url || typeof payload.url !== "string") {
      throw new ApiError(
        502,
        "Invalid agent download response from server.",
        undefined,
        undefined,
        responseRequestId(res.headers.get("x-request-id"), payload),
      );
    }
    return payload;
  }

  const blob = await res.blob();
  const filename =
    filenameFromContentDisposition(res.headers.get("Content-Disposition")) ??
    AGENT_DOWNLOAD_FILENAMES[os];
  await triggerBlobDownload(blob, filename);
  return {
    url: "",
    expiresAt: new Date().toISOString(),
    filename,
    os,
  };
}

export async function downloadAgentBinary(os: AgentOs): Promise<void> {
  const payload = await getAgentDownloadLink(os);
  if (payload.url) {
    await openExternalUrl(payload.url);
  }
}
