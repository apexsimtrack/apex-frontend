import { API_BASE } from "./config";
import {
  buildApiAuthHeaders,
  fetchApi,
  notifyAuthExpired,
} from "./fetchClient";
import { ApiError } from "./errors";
import { responseRequestId } from "./requestId";

export type AgentOs = "macos" | "windows" | "linux";
export type AgentDownloadOutcome = "success" | "denied" | "error";

export type AdminAgentReleaseRow = {
  id: string;
  os: AgentOs;
  version: string;
  r2ObjectKey: string;
  filename: string;
  sha256: string;
  fileSizeBytes: number;
  publishedAt: string;
  publishedById: string;
  publishedBy: { id: string; name: string | null; email: string };
  notes: string | null;
  isActive: boolean;
};

export type AdminAgentReleaseSummaryItem = {
  os: AgentOs;
  activeRelease: AdminAgentReleaseRow | null;
  r2ObjectKey: string;
  r2ObjectExists: boolean;
  contentLength: number | null;
};

export type AdminAgentDownloadLogRow = {
  id: string;
  userId: string | null;
  user: { id: string; name: string | null; email: string } | null;
  os: AgentOs;
  version: string | null;
  filename: string | null;
  outcome: AgentDownloadOutcome;
  requestId: string | null;
  createdAt: string;
};

export type PublishAgentReleaseCallbacks = {
  onUploadProgress?: (percent: number) => void;
  onUploadComplete?: () => void;
};

export async function fetchAdminAgentReleaseSummary(): Promise<
  AdminAgentReleaseSummaryItem[]
> {
  return fetchApi("GET", "/api/admin/agent/releases/summary", undefined, false);
}

export async function fetchAdminAgentReleases(params?: {
  os?: AgentOs;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: AdminAgentReleaseRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams();
  if (params?.os) sp.set("os", params.os);
  if (params?.activeOnly) sp.set("activeOnly", "true");
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  return fetchApi(
    "GET",
    `/api/admin/agent/releases${qs ? `?${qs}` : ""}`,
    undefined,
    false,
  );
}

export async function verifyAdminAgentReleases(): Promise<{
  results: Array<{
    os: AgentOs;
    r2ObjectKey: string;
    exists: boolean;
    contentLength: number | null;
    activeReleaseId: string | null;
    activeVersion: string | null;
  }>;
}> {
  return fetchApi("POST", "/api/admin/agent/verify", undefined, false);
}

function parsePublishErrorPayload(text: string, _status: number): string {
  let message = "Agent release upload failed";
  if (!text) return message;
  try {
    const json = JSON.parse(text) as { message?: string };
    message = json.message ?? message;
  } catch {
    message = text;
  }
  return message;
}

export async function publishAdminAgentRelease(
  form: FormData,
  callbacks?: PublishAgentReleaseCallbacks,
): Promise<AdminAgentReleaseRow> {
  const authHeaders = buildApiAuthHeaders();
  const url = `${API_BASE}/api/admin/agent/releases`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [name, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.onprogress = (ev) => {
      if (!callbacks?.onUploadProgress) return;
      const total = ev.lengthComputable ? ev.total : 0;
      if (total > 0) {
        const pct = Math.min(100, Math.round((ev.loaded / total) * 100));
        callbacks.onUploadProgress(pct);
      }
    };

    xhr.upload.addEventListener("load", () => {
      callbacks?.onUploadComplete?.();
    });

    xhr.onload = () => {
      void (async () => {
        const status = xhr.status;
        const text = xhr.responseText ?? "";

        const requestHeader = xhr.getResponseHeader("X-Request-Id");
        if (status >= 200 && status < 300) {
          if (!text.trim()) {
            reject(
              new ApiError(
                500,
                "No response from server",
                undefined,
                undefined,
                responseRequestId(requestHeader, undefined),
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as AdminAgentReleaseRow);
          } catch {
            reject(
              new ApiError(
                500,
                "Invalid response from server",
                undefined,
                undefined,
                responseRequestId(requestHeader, undefined),
              ),
            );
          }
          return;
        }

        await notifyAuthExpired(false, status);
        let body: unknown;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = undefined;
        }
        reject(
          new ApiError(
            status,
            parsePublishErrorPayload(text, status),
            undefined,
            undefined,
            responseRequestId(requestHeader, body),
          ),
        );
      })();
    };

    xhr.onerror = () => {
      reject(new ApiError(0, "Connection lost. Please try again."));
    };

    xhr.send(form);
  });
}

export async function fetchAdminAgentMinUploadVersion(): Promise<{
  version: string | null;
}> {
  return fetchApi(
    "GET",
    "/api/admin/agent/min-upload-version",
    undefined,
    false,
  );
}

export async function setAdminAgentMinUploadVersion(
  version: string | null,
): Promise<{ version: string | null }> {
  return fetchApi(
    "PATCH",
    "/api/admin/agent/min-upload-version",
    { version },
    false,
  );
}

export async function activateAdminAgentRelease(
  releaseId: string,
): Promise<AdminAgentReleaseRow> {
  return fetchApi(
    "PATCH",
    `/api/admin/agent/releases/${encodeURIComponent(releaseId)}/activate`,
    undefined,
    false,
  );
}

export async function fetchAdminAgentDownloadLogs(params?: {
  page?: number;
  pageSize?: number;
  os?: AgentOs;
  outcome?: AgentDownloadOutcome;
}): Promise<{
  items: AdminAgentDownloadLogRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.os) sp.set("os", params.os);
  if (params?.outcome) sp.set("outcome", params.outcome);
  const qs = sp.toString();
  return fetchApi(
    "GET",
    `/api/admin/agent/downloads${qs ? `?${qs}` : ""}`,
    undefined,
    false,
  );
}

/** Expected installer extension per OS (case-insensitive). */
export const AGENT_INSTALLER_EXTENSION_BY_OS: Record<AgentOs, string> = {
  macos: ".dmg",
  windows: ".exe",
  linux: ".AppImage",
};

export function validateAgentInstallerFile(
  os: AgentOs,
  file: File | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!file) {
    return { ok: false, message: "Choose an installer file." };
  }
  const name = file.name.trim();
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".")).toLowerCase()
    : "";
  const expected = AGENT_INSTALLER_EXTENSION_BY_OS[os].toLowerCase();
  if (ext !== expected) {
    const label =
      os === "macos" ? "macOS" : os === "windows" ? "Windows" : "Linux";
    return {
      ok: false,
      message: `${label} releases require a ${AGENT_INSTALLER_EXTENSION_BY_OS[os]} file.`,
    };
  }
  return { ok: true };
}

export function acceptAttributeForAgentOs(os: AgentOs): string {
  return AGENT_INSTALLER_EXTENSION_BY_OS[os];
}
