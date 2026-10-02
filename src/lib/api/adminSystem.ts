import { fetchApi } from "./fetchClient";
import type { AdminPaginated } from "./adminFollows";
import type { NotificationSeverity } from "./profile";

export type SystemStatusLevel =
  | "OPERATIONAL"
  | "DEGRADED"
  | "PARTIAL_OUTAGE"
  | "MAINTENANCE"
  | "MAJOR_OUTAGE";

export type SystemEnvironment = "ALL" | "DEVELOPMENT" | "STAGING" | "PRODUCTION";
export type SystemFeatureKey =
  | "MANUAL_UPLOAD"
  | "MANUAL_ACTIVITY"
  | "AGENT_UPLOADS_PRO_GATED"
  | "TELEMETRY_ANALYSIS_PRO_GATED"
  | "COMMUNITY_PROFANITY_BLOCK"
  | "AGENT_DOWNLOAD_ENABLED";

export type ServiceComponentKey =
  | "API"
  | "FRONTEND"
  | "DATABASE"
  | "EMAIL"
  | "STORAGE"
  | "AGENT_DELIVERY"
  | "NOTIFICATIONS";

export type IncidentStatus =
  | "OPEN"
  | "INVESTIGATING"
  | "IDENTIFIED"
  | "MONITORING"
  | "RESOLVED";

export type MaintenanceWindowStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELED";

export type AdminSystemComponent = {
  key: ServiceComponentKey;
  label: string;
  description: string;
  status: SystemStatusLevel;
  statusSummary: string;
  provider: string | null;
  configured: boolean;
  responseTimeMs: number | null;
  lastCheckedAt: string;
  lastHealthyAt: string | null;
  details: Record<string, unknown>;
  maintenanceMode: boolean;
  sortOrder: number;
};

export type AdminSystemIncidentUpdate = {
  id: string;
  body: string;
  status: IncidentStatus | null;
  severity: SystemStatusLevel | null;
  createdAt: string;
  createdByDisplayName: string | null;
};

export type AdminSystemIncident = {
  id: string;
  key: string;
  title: string;
  summary: string;
  status: IncidentStatus;
  severity: SystemStatusLevel;
  impactedComponents: ServiceComponentKey[];
  owner: string | null;
  publicMessage: string | null;
  startedAt: string;
  detectedAt: string | null;
  resolvedAt: string | null;
  nextUpdateAt: string | null;
  linkedBroadcastId: string | null;
  linkedBroadcast: {
    id: string;
    title: string;
    severity: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  createdByDisplayName: string | null;
  updatedByDisplayName: string | null;
  updates: AdminSystemIncidentUpdate[];
};

export type AdminSystemMaintenanceWindow = {
  id: string;
  title: string;
  description: string | null;
  status: MaintenanceWindowStatus;
  storedStatus: MaintenanceWindowStatus;
  startsAt: string;
  endsAt: string;
  owner: string | null;
  affectedComponents: ServiceComponentKey[];
  linkedBroadcastId: string | null;
  linkedBroadcast: {
    id: string;
    title: string;
    severity: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  createdByDisplayName: string | null;
  updatedByDisplayName: string | null;
};

export type PublicMaintenanceWindowDetail = {
  id: string;
  title: string;
  description: string | null;
  status: MaintenanceWindowStatus;
  storedStatus: MaintenanceWindowStatus;
  startsAt: string;
  endsAt: string;
  owner: string | null;
  affectedComponents: ServiceComponentKey[];
  linkedNotice: {
    id: string;
    title: string;
    body: string;
    severity: NotificationSeverity;
    status: string;
    dismissible: boolean;
    ctaLabel: string | null;
    ctaUrl: string | null;
  } | null;
};

export type AdminSystemFeature = {
  id: string | null;
  key: SystemFeatureKey;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  owner: string;
  enabled: boolean;
  environment: SystemEnvironment;
  isPublic: boolean;
  routes: string[];
  prerequisites: string[];
  defaultEnabled: boolean;
  defaultEnvironment: SystemEnvironment;
  createdAt: string | null;
  updatedAt: string | null;
  updatedByDisplayName: string | null;
  appliesToCurrentEnvironment: boolean;
  effectiveEnabled: boolean;
  isOverride: boolean;
};

export type AdminSystemOverview = {
  checkedAt: string;
  status: SystemStatusLevel;
  build: {
    apiVersion: string;
    environment: string;
    nodeEnv?: string;
    appEnv?: string;
    billingMode?: string;
    backendProvider: string;
    frontendProvider: string;
    databaseProvider: string;
    backendCommitSha: string | null;
    frontendCommitSha: string | null;
    frontendProject: string | null;
    backendServiceName: string | null;
    frontendOrigins: string[];
    renderUrl: string | null;
    frontendUrl: string | null;
    nodeVersion: string;
    pid: number;
  };
  summary: {
    openIncidents: number;
    activeMaintenance: number;
    enabledFeatures: number;
    activeBroadcasts: number;
    supportBacklog: number;
    highRiskSessions: number;
    stuckSessions: number;
    emailFailures24h: number;
  };
  dependencies: AdminSystemComponent[];
  openIncidents: AdminSystemIncident[];
  maintenanceWindows: AdminSystemMaintenanceWindow[];
  activeNotices: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
  }>;
  alerts: Array<{
    id: string;
    severity: SystemStatusLevel;
    title: string;
    detail: string;
    href: string | null;
  }>;
  quickLinks: Array<{ label: string; href: string }>;
};

export type AdminSystemHealth = {
  checkedAt: string;
  status: SystemStatusLevel;
  runtime: {
    apiVersion: string;
    environment: string;
    nodeVersion: string;
    pid: number;
    uptimeSec: number;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      externalMb: number;
    };
  };
  build: AdminSystemOverview["build"];
  components: AdminSystemComponent[];
};

export type AdminSystemDiagnostics = {
  checkedAt: string;
  summary: {
    zeroLapSessions: number;
    processingStuckSessions: number;
    invalidLapSessions: number;
    missingTelemetrySessions: number;
    multipleBestLapSessions: number;
    highRiskAuthSessions: number;
    supportBacklog: number;
    failedEmailDeliveries: number;
    catalogOrphans: number;
  };
  stuckSessions: Array<{
    id: string;
    track: string;
    car: string;
    sim: string;
    createdAt: string;
    processingStartedAt: string | null;
    userId: string;
    userDisplayName: string;
  }>;
  riskyAuthUsers: Array<{
    userId: string;
    userDisplayName: string;
    email: string | null;
    suspiciousSessionCount: number;
    maxRiskScore: number;
    lastSeenAt: string | null;
  }>;
  supportBacklog: Array<{
    id: string;
    name: string;
    email: string;
    subject: string | null;
    status: string;
    createdAt: string;
    linkedUserId: string | null;
    linkedUserDisplayName: string | null;
  }>;
  failedDeliveries: Array<{
    id: string;
    updatedAt: string;
    campaignId: string;
    campaignTitle: string;
    userId: string;
    userDisplayName: string;
    errorMessage: string | null;
    attempts: number;
  }>;
  catalogOrphans: {
    sessionTracks: number;
    sessionCars: number;
    challengeTracks: number;
    challengeCars: number;
  };
};

export type AdminSystemAuditResponse = {
  items: Array<{
    id: string;
    source: "SYSTEM" | "USER_ACTION";
    eventType: string;
    targetType: string;
    targetId: string | null;
    summary: string;
    reason: string | null;
    requestId: string | null;
    metadata: unknown;
    createdAt: string;
    actorDisplayName: string | null;
    targetDisplayName?: string | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchAdminSystemOverview(): Promise<AdminSystemOverview> {
  return fetchApi("GET", "/api/admin/system/overview", undefined, false);
}

export async function fetchAdminSystemHealth(): Promise<AdminSystemHealth> {
  return fetchApi("GET", "/api/admin/system/health", undefined, false);
}

export async function fetchAdminSystemComponents(): Promise<{
  items: AdminSystemComponent[];
}> {
  return fetchApi("GET", "/api/admin/system/components", undefined, false);
}

export async function fetchAdminSystemFeatures(params?: {
  q?: string;
  environment?: SystemEnvironment;
  enabled?: boolean;
}): Promise<{
  items: AdminSystemFeature[];
  currentEnvironment: SystemEnvironment;
}> {
  return fetchApi(
    "GET",
    `/api/admin/system/features${buildQuery({
      q: params?.q,
      environment: params?.environment,
      enabled: params?.enabled,
    })}`,
    undefined,
    false,
  );
}

export async function patchAdminSystemFeature(
  featureKey: SystemFeatureKey,
  body: Partial<{
    enabled: boolean;
    environment: SystemEnvironment;
    reason: string;
  }>,
): Promise<{ id: string; ok: boolean }> {
  return fetchApi(
    "PATCH",
    `/api/admin/system/features/${encodeURIComponent(featureKey)}`,
    body,
    false,
  );
}

export async function fetchAdminSystemIncidents(params?: {
  page?: number;
  pageSize?: number;
  status?: IncidentStatus;
}): Promise<AdminPaginated<AdminSystemIncident>> {
  return fetchApi(
    "GET",
    `/api/admin/system/incidents${buildQuery({
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status,
    })}`,
    undefined,
    false,
  );
}

export async function createAdminSystemIncident(body: {
  key?: string;
  title: string;
  summary: string;
  severity?: SystemStatusLevel;
  status?: IncidentStatus;
  impactedComponents?: ServiceComponentKey[];
  owner?: string;
  publicMessage?: string;
  linkedBroadcastId?: string;
  detectedAt?: string;
  startedAt?: string;
  nextUpdateAt?: string;
  updateMessage?: string;
  reason?: string;
}): Promise<{ id: string }> {
  return fetchApi("POST", "/api/admin/system/incidents", body, false);
}

export async function patchAdminSystemIncident(
  incidentId: string,
  body: Partial<{
    title: string;
    summary: string;
    severity: SystemStatusLevel;
    status: IncidentStatus;
    impactedComponents: ServiceComponentKey[];
    owner: string;
    publicMessage: string;
    linkedBroadcastId: string;
    detectedAt: string;
    nextUpdateAt: string;
    updateMessage: string;
    reason: string;
  }>,
): Promise<{ ok: boolean }> {
  return fetchApi(
    "PATCH",
    `/api/admin/system/incidents/${encodeURIComponent(incidentId)}`,
    body,
    false,
  );
}

export async function deleteAdminSystemIncident(
  incidentId: string,
): Promise<{ ok: boolean }> {
  return fetchApi(
    "DELETE",
    `/api/admin/system/incidents/${encodeURIComponent(incidentId)}`,
    undefined,
    false,
  );
}

export async function fetchAdminSystemMaintenance(params?: {
  page?: number;
  pageSize?: number;
  status?: MaintenanceWindowStatus;
}): Promise<AdminPaginated<AdminSystemMaintenanceWindow>> {
  return fetchApi(
    "GET",
    `/api/admin/system/maintenance${buildQuery({
      page: params?.page,
      pageSize: params?.pageSize,
      status: params?.status,
    })}`,
    undefined,
    false,
  );
}

export async function createAdminSystemMaintenance(body: {
  title: string;
  description?: string;
  status?: MaintenanceWindowStatus;
  startsAt: string;
  endsAt: string;
  owner?: string;
  affectedComponents?: ServiceComponentKey[];
  linkedBroadcastId?: string;
  notice?: {
    title?: string;
    body?: string;
    severity?: NotificationSeverity;
    dismissible?: boolean;
    status?: "DRAFT" | "SCHEDULED" | "ACTIVE";
    ctaLabel?: string | null;
  };
  reason?: string;
}): Promise<{ id: string; linkedBroadcastId: string | null }> {
  return fetchApi("POST", "/api/admin/system/maintenance", body, false);
}

export async function patchAdminSystemMaintenance(
  maintenanceId: string,
  body: Partial<{
    title: string;
    description: string;
    status: MaintenanceWindowStatus;
    startsAt: string;
    endsAt: string;
    owner: string;
    affectedComponents: ServiceComponentKey[];
    linkedBroadcastId: string;
    reason: string;
  }>,
): Promise<{ ok: boolean }> {
  return fetchApi(
    "PATCH",
    `/api/admin/system/maintenance/${encodeURIComponent(maintenanceId)}`,
    body,
    false,
  );
}

export async function deleteAdminSystemMaintenance(
  maintenanceId: string,
): Promise<{ ok: boolean }> {
  return fetchApi(
    "DELETE",
    `/api/admin/system/maintenance/${encodeURIComponent(maintenanceId)}`,
    undefined,
    false,
  );
}

export async function fetchPublicMaintenanceWindow(
  maintenanceId: string,
): Promise<PublicMaintenanceWindowDetail> {
  return fetchApi(
    "GET",
    `/api/system/maintenance/${encodeURIComponent(maintenanceId)}`,
    undefined,
    false,
  );
}

export async function fetchAdminSystemDiagnostics(): Promise<AdminSystemDiagnostics> {
  return fetchApi("GET", "/api/admin/system/diagnostics", undefined, false);
}

export async function fetchAdminSystemAudit(params?: {
  page?: number;
  pageSize?: number;
  source?: "SYSTEM" | "USER_ACTION" | "ALL";
}): Promise<AdminSystemAuditResponse> {
  return fetchApi(
    "GET",
    `/api/admin/system/audit${buildQuery({
      page: params?.page,
      pageSize: params?.pageSize,
      source: params?.source,
    })}`,
    undefined,
    false,
  );
}
