import { readFileSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";
import { authHeaders, type AuthSession } from "./auth";
import { getE2eEnv } from "./env";
import { sessionJsonFixture } from "./fixtures";

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  suspendedAt: string | null;
  isDeleted: boolean;
};

export type AdminSubscriptionRow = {
  userId: string;
  email: string;
  lastSyncedAt: string | null;
};

export type SystemFeatureKey = "MANUAL_UPLOAD";

export async function fetchAdminUserListViaApi(
  request: APIRequestContext,
  auth: AuthSession,
  params?: { q?: string; page?: number; pageSize?: number; status?: string },
): Promise<{ items: AdminUserRow[]; total: number }> {
  const { apiUrl } = getE2eEnv();
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.pageSize != null) search.set("pageSize", String(params.pageSize));
  if (params?.status?.trim()) search.set("status", params.status.trim());
  const qs = search.toString();

  const res = await request.get(
    `${apiUrl}/api/admin/users${qs ? `?${qs}` : ""}`,
    {
      headers: authHeaders(auth.token, auth.sessionToken),
    },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`GET /api/admin/users failed (${res.status()}): ${body}`);
  }

  const data = (await res.json()) as { items?: AdminUserRow[]; total?: number };
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
  };
}

export async function lookupAdminUserByEmail(
  request: APIRequestContext,
  auth: AuthSession,
  email: string,
): Promise<AdminUserRow | null> {
  const normalized = email.trim().toLowerCase();
  const data = await fetchAdminUserListViaApi(request, auth, {
    q: email,
    pageSize: 50,
  });
  return (
    data.items.find((row) => row.email.trim().toLowerCase() === normalized) ??
    null
  );
}

export async function patchUserStatusViaAdminApi(
  request: APIRequestContext,
  auth: AuthSession,
  userId: string,
  body: { suspended: boolean; reason?: string },
): Promise<void> {
  const { apiUrl } = getE2eEnv();
  const res = await request.patch(
    `${apiUrl}/api/admin/users/${encodeURIComponent(userId)}/status`,
    {
      headers: authHeaders(auth.token, auth.sessionToken),
      data: body,
    },
  );
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`PATCH user status failed (${res.status()}): ${text}`);
  }
}

export async function patchUserRoleViaAdminApi(
  request: APIRequestContext,
  auth: AuthSession,
  userId: string,
  role: "USER" | "ADMIN",
): Promise<void> {
  const { apiUrl } = getE2eEnv();
  const res = await request.patch(
    `${apiUrl}/api/admin/users/${encodeURIComponent(userId)}/role`,
    {
      headers: authHeaders(auth.token, auth.sessionToken),
      data: { role },
    },
  );
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`PATCH user role failed (${res.status()}): ${text}`);
  }
}

export async function patchSystemFeatureViaAdminApi(
  request: APIRequestContext,
  auth: AuthSession,
  featureKey: SystemFeatureKey,
  body: {
    enabled: boolean;
    environment?: "ALL" | "DEVELOPMENT" | "STAGING" | "PRODUCTION";
    reason?: string;
  },
): Promise<void> {
  const { apiUrl } = getE2eEnv();
  const res = await request.patch(
    `${apiUrl}/api/admin/system/features/${encodeURIComponent(featureKey)}`,
    {
      headers: authHeaders(auth.token, auth.sessionToken),
      data: body,
    },
  );
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`PATCH system feature failed (${res.status()}): ${text}`);
  }
}

export async function fetchAdminSubscriptionListViaApi(
  request: APIRequestContext,
  auth: AuthSession,
  params?: { q?: string; page?: number; pageSize?: number },
): Promise<{ items: AdminSubscriptionRow[] }> {
  const { apiUrl } = getE2eEnv();
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.pageSize != null) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();

  const res = await request.get(
    `${apiUrl}/api/admin/subscriptions${qs ? `?${qs}` : ""}`,
    {
      headers: authHeaders(auth.token, auth.sessionToken),
    },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `GET /api/admin/subscriptions failed (${res.status()}): ${body}`,
    );
  }

  const data = (await res.json()) as { items?: AdminSubscriptionRow[] };
  return { items: data.items ?? [] };
}

export async function syncSubscriptionViaAdminApi(
  request: APIRequestContext,
  auth: AuthSession,
  userId: string,
): Promise<{
  success?: boolean;
  subscription?: { lastSyncedAt?: string | null };
}> {
  const { apiUrl } = getE2eEnv();
  const res = await request.post(
    `${apiUrl}/api/admin/subscriptions/${encodeURIComponent(userId)}/sync`,
    {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "X-Apex-Session": auth.sessionToken,
      },
      data: {},
    },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`POST subscription sync failed (${res.status()}): ${body}`);
  }
  return (await res.json()) as {
    success?: boolean;
    subscription?: { lastSyncedAt?: string | null };
  };
}

export async function resolveModerationFlagViaAdminApi(
  request: APIRequestContext,
  auth: AuthSession,
  flagId: string,
): Promise<void> {
  const { apiUrl } = getE2eEnv();
  const res = await request.post(
    `${apiUrl}/api/admin/community/moderation-flags/${encodeURIComponent(flagId)}/resolve`,
    {
      headers: authHeaders(auth.token, auth.sessionToken),
    },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `POST resolve moderation flag failed (${res.status()}): ${body}`,
    );
  }
}

export async function fetchOpenModerationFlagsViaAdminApi(
  request: APIRequestContext,
  auth: AuthSession,
): Promise<Array<{ id: string; discussionId: string | null }>> {
  const { apiUrl } = getE2eEnv();
  const res = await request.get(
    `${apiUrl}/api/admin/community/moderation-flags?page=1&pageSize=50&unresolvedOnly=true`,
    { headers: authHeaders(auth.token, auth.sessionToken) },
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`GET moderation flags failed (${res.status()}): ${body}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ id: string; discussionId: string | null }>;
  };
  return data.items ?? [];
}

export async function postManualUploadJsonViaApi(
  request: APIRequestContext,
  auth: AuthSession,
  filename: string,
): Promise<{ status: number; body: unknown }> {
  const { apiUrl } = getE2eEnv();
  const res = await request.post(`${apiUrl}/api/sessions/manual-upload`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "X-Apex-Session": auth.sessionToken,
    },
    multipart: {
      file: {
        name: filename,
        mimeType: "application/json",
        buffer: readFileSync(sessionJsonFixture(filename)),
      },
    },
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status(), body };
}
