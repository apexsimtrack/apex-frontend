import { fetchApi } from "./fetchClient";

export type AdminSubscriptionSummary = {
  userId: string;
  effectivePlan: "FREE" | "PRO";
  plan: "FREE" | "PRO";
  status: "ACTIVE" | "CANCELED" | "PAST_DUE" | "EXPIRED" | null;
  billingInterval: "MONTHLY" | "ANNUAL" | null;
  planDisplayName: string | null;
  entitlementIdentifier: string | null;
  revenuecatAppUserId: string | null;
  stripeCustomerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastSyncedAt: string | null;
  isSyncStale: boolean;
};

export type AdminSubscriptionListRow = AdminSubscriptionSummary & {
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
  isDeleted: boolean;
  suspendedAt: string | null;
};

export type AdminSubscriptionListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  effectivePlan?: "free" | "pro";
  plan?: "free" | "pro";
  subscriptionStatus?: "ACTIVE" | "CANCELED" | "PAST_DUE" | "EXPIRED";
  billingInterval?: "MONTHLY" | "ANNUAL";
  cancelAtPeriodEnd?: boolean;
  staleSyncOnly?: boolean;
};

export type AdminSubscriptionMetrics = {
  proAccessActive: number;
  proEntitlementsActive: number;
  proCanceledAtPeriodEnd: number;
  proPastDue: number;
  proExpired: number;
  freeNoSubscriptionRow: number;
  proNewLast7d: number;
  proChurnedLast7d: number;
  byIntervalMonthly: number;
  byIntervalAnnual: number;
  staleSyncCount: number;
  challengeJoinsTotal: number;
  challengesWithJoins: number;
};

function buildSubscriptionQuery(params?: AdminSubscriptionListParams): string {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  const plan = params?.effectivePlan ?? params?.plan;
  if (plan) sp.set("effectivePlan", plan);
  if (params?.subscriptionStatus)
    sp.set("subscriptionStatus", params.subscriptionStatus);
  if (params?.billingInterval)
    sp.set("billingInterval", params.billingInterval);
  if (params?.cancelAtPeriodEnd === true) sp.set("cancelAtPeriodEnd", "true");
  if (params?.cancelAtPeriodEnd === false) sp.set("cancelAtPeriodEnd", "false");
  if (params?.staleSyncOnly === true) sp.set("staleSyncOnly", "true");
  return sp.toString();
}

export async function fetchAdminSubscriptionList(
  params?: AdminSubscriptionListParams,
): Promise<{
  items: AdminSubscriptionListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const qs = buildSubscriptionQuery(params);
  return fetchApi(
    "GET",
    `/api/admin/subscriptions${qs ? `?${qs}` : ""}`,
    undefined,
    false,
  );
}

export async function fetchAdminSubscriptionMetrics(): Promise<AdminSubscriptionMetrics> {
  return fetchApi("GET", "/api/admin/subscriptions/metrics", undefined, false);
}

export async function fetchAdminSubscriptionDetail(
  userId: string,
): Promise<AdminSubscriptionSummary> {
  return fetchApi(
    "GET",
    `/api/admin/subscriptions/${encodeURIComponent(userId)}`,
    undefined,
    false,
  );
}

export async function postAdminSubscriptionSync(userId: string): Promise<{
  success: boolean;
  subscription: AdminSubscriptionSummary;
}> {
  return fetchApi(
    "POST",
    `/api/admin/subscriptions/${encodeURIComponent(userId)}/sync`,
    {},
    false,
  );
}

export type AdminSubscriptionSyncBatchResult = {
  success: boolean;
  synced: number;
  failed: number;
  results: { userId: string; success: boolean; error: string | null }[];
};

export type AdminBetaAccessStatus =
  "PENDING" | "SCHEDULED" | "ACTIVE" | "EXPIRED" | "REVOKED";

export type AdminBetaAccessGrant = {
  id: string;
  email: string;
  userId: string | null;
  user: { id: string; email: string; name: string | null } | null;
  durationDays: number;
  startedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: AdminBetaAccessStatus;
  createdAt: string;
  updatedAt: string;
};

export type AdminBetaAccessListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: AdminBetaAccessStatus;
};

export type AdminBetaAccessEmailLookup = {
  email: string;
  accountExists: boolean;
  accountDeleted: boolean;
  linksImmediately: boolean;
  user: { id: string; email: string; name: string | null } | null;
  blockingGrant: {
    id: string;
    status: AdminBetaAccessStatus;
    expiresAt: string | null;
  } | null;
};

export type AdminBetaAccessWritePayload =
  | { email: string; durationDays: number }
  | { email: string; startsAt: string; expiresAt: string };

export type AdminBetaAccessUpdatePayload =
  { durationDays: number } | { startsAt: string; expiresAt: string };

function buildBetaAccessQuery(params?: AdminBetaAccessListParams): string {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.status) sp.set("status", params.status);
  return sp.toString();
}

export async function fetchAdminBetaAccessList(
  params?: AdminBetaAccessListParams,
): Promise<{
  items: AdminBetaAccessGrant[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const qs = buildBetaAccessQuery(params);
  return fetchApi(
    "GET",
    `/api/admin/subscriptions/beta-access${qs ? `?${qs}` : ""}`,
    undefined,
    false,
  );
}

export async function fetchAdminBetaAccessEmailLookup(
  email: string,
): Promise<AdminBetaAccessEmailLookup> {
  return fetchApi(
    "GET",
    `/api/admin/subscriptions/beta-access/lookup?email=${encodeURIComponent(email)}`,
    undefined,
    false,
  );
}

export async function createAdminBetaAccess(
  payload: AdminBetaAccessWritePayload,
): Promise<AdminBetaAccessGrant> {
  return fetchApi(
    "POST",
    "/api/admin/subscriptions/beta-access",
    payload,
    false,
  );
}

export async function updateAdminBetaAccess(
  id: string,
  payload: AdminBetaAccessUpdatePayload,
): Promise<AdminBetaAccessGrant> {
  return fetchApi(
    "PATCH",
    `/api/admin/subscriptions/beta-access/${encodeURIComponent(id)}`,
    payload,
    false,
  );
}

export async function revokeAdminBetaAccess(
  id: string,
): Promise<AdminBetaAccessGrant> {
  return fetchApi(
    "DELETE",
    `/api/admin/subscriptions/beta-access/${encodeURIComponent(id)}`,
    undefined,
    false,
  );
}

export async function postAdminSubscriptionSyncBatch(
  userIds: string[],
): Promise<AdminSubscriptionSyncBatchResult> {
  return fetchApi(
    "POST",
    "/api/admin/subscriptions/sync-batch",
    { userIds },
    false,
  );
}
