import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import PageMeta from "@/components/PageMeta";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { cn } from "@/lib/utils";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";
import {
  ADMIN_TABS_CONTENT,
  ADMIN_TABS_LIST,
} from "@/pages/admin/adminTabsLayout";
import {
  apiErrorText,
  fetchAdminSystemFeatures,
  createAdminSystemIncident,
  createAdminSystemMaintenance,
  deleteAdminSystemIncident,
  deleteAdminSystemMaintenance,
  fetchAdminSystemAudit,
  fetchAdminSystemDiagnostics,
  fetchAdminSystemHealth,
  fetchAdminSystemIncidents,
  fetchAdminSystemMaintenance,
  fetchAdminSystemOverview,
  patchAdminSystemFeature,
  patchAdminSystemIncident,
  patchAdminSystemMaintenance,
  type AdminSystemDiagnostics,
  type AdminSystemFeature,
  type AdminSystemHealth,
  type AdminSystemIncident,
  type AdminSystemMaintenanceWindow,
  type AdminSystemOverview,
  type IncidentStatus,
  type MaintenanceWindowStatus,
  type NotificationSeverity,
  type ServiceComponentKey,
  type SystemEnvironment,
  type SystemStatusLevel,
} from "@/lib/api";

const TITLE = `Admin · System | ${COMPANY_NAME}`;

type TabId =
  | "overview"
  | "health"
  | "features"
  | "operations"
  | "diagnostics"
  | "audit";

const TAB_OPTIONS: TabId[] = [
  "overview",
  "health",
  "features",
  "operations",
  "diagnostics",
  "audit",
];

const COMPONENT_OPTIONS: Array<{ key: ServiceComponentKey; label: string }> = [
  { key: "API", label: "API" },
  { key: "FRONTEND", label: "Frontend" },
  { key: "DATABASE", label: "Database" },
  { key: "EMAIL", label: "Email" },
  { key: "STORAGE", label: "Storage" },
  { key: "AGENT_DELIVERY", label: "Agent delivery" },
  { key: "NOTIFICATIONS", label: "Notifications" },
];

const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  health: "Health",
  features: "Features",
  operations: "Operations",
  diagnostics: "Diagnostics",
  audit: "Audit",
};

const STATUS_PILL: Record<SystemStatusLevel, string> = {
  OPERATIONAL: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  DEGRADED: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  PARTIAL_OUTAGE: "border-orange-500/40 bg-orange-500/15 text-orange-200",
  MAINTENANCE: "border-violet-500/40 bg-violet-500/15 text-violet-200",
  MAJOR_OUTAGE: "border-red-500/40 bg-red-500/15 text-red-200",
};

const INCIDENT_LABEL: Record<IncidentStatus, string> = {
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

const MAINTENANCE_LABEL: Record<MaintenanceWindowStatus, string> = {
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

const NOTICE_PUBLISH_LABEL: Record<"DRAFT" | "SCHEDULED" | "ACTIVE", string> = {
  DRAFT: "Draft",
  SCHEDULED: "Schedule with maintenance",
  ACTIVE: "Publish now",
};

const NOTICE_SEVERITY_OPTIONS: NotificationSeverity[] = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "CRITICAL",
  "MAINTENANCE",
];

const QUERY_KEYS = {
  overview: ["admin", "system", "overview"] as const,
  health: ["admin", "system", "health"] as const,
  features: ["admin", "system", "features"] as const,
  incidents: ["admin", "system", "incidents"] as const,
  maintenance: ["admin", "system", "maintenance"] as const,
  diagnostics: ["admin", "system", "diagnostics"] as const,
  audit: ["admin", "system", "audit"] as const,
};

function parseTab(raw: string | null): TabId {
  return raw && TAB_OPTIONS.includes(raw as TabId)
    ? (raw as TabId)
    : "overview";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : "—";
}

function resolveFrontendCommitSha(apiSha: string | null | undefined): string {
  const clientSha = import.meta.env.VITE_GIT_COMMIT_SHA?.trim();
  return clientSha || apiSha || null;
}

function formatUptimeSec(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function labelForStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatKeyValueLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function maintenanceNoticePath(maintenanceId: string): string {
  return `/status/maintenance/${encodeURIComponent(maintenanceId)}`;
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-card/30">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: SystemStatusLevel }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_PILL[status],
      )}
    >
      {labelForStatus(status)}
    </span>
  );
}

function InlineError({ error }: { error: unknown }) {
  const message = apiErrorText(error, "Request failed.");
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ComponentChecklist({
  selected,
  onChange,
}: {
  selected: ServiceComponentKey[];
  onChange: (next: ServiceComponentKey[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {COMPONENT_OPTIONS.map((item) => {
        const checked = selected.includes(item.key);
        return (
          <label
            key={item.key}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-foreground"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, item.key]
                    : selected.filter((entry) => entry !== item.key),
                )
              }
            />
            <span>{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function QueryLoading() {
  return (
    <div className="flex justify-center px-4 py-14" aria-busy="true">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

function OverviewTab({ data }: { data: AdminSystemOverview }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
        <SectionCard
          title="Platform status"
          description="Current operational rollup across incidents, maintenance, and dependency checks."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={data.status} />
              <span className="text-xs text-muted-foreground">
                Checked {formatDateTime(data.checkedAt)}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Open incidents"
                value={data.summary.openIncidents}
              />
              <MetricCard
                label="Active maintenance"
                value={data.summary.activeMaintenance}
              />
              <MetricCard
                label="Enabled features"
                value={data.summary.enabledFeatures}
              />
              <MetricCard
                label="Active notices"
                value={data.summary.activeBroadcasts}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Support backlog"
                value={data.summary.supportBacklog}
              />
              <MetricCard
                label="High-risk sessions"
                value={data.summary.highRiskSessions}
              />
              <MetricCard
                label="Stuck processing"
                value={data.summary.stuckSessions}
              />
              <MetricCard
                label="Email failures (24h)"
                value={data.summary.emailFailures24h}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Build and deploy"
          description="Current environment and deployment metadata."
        >
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">App environment</span>
              <span className="font-medium">
                {data.build.appEnv ?? data.build.environment}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Node environment</span>
              <span className="font-medium">
                {data.build.nodeEnv ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Billing mode</span>
              <span className="font-medium">
                {data.build.billingMode ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Backend version</span>
              <span className="font-medium">{data.build.apiVersion}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Backend commit</span>
              <span className="font-medium">
                {shortSha(data.build.backendCommitSha)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Frontend commit</span>
              <span className="font-medium">
                {shortSha(
                  resolveFrontendCommitSha(data.build.frontendCommitSha),
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Backend platform</span>
              <span className="font-medium">{data.build.backendProvider}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Frontend platform</span>
              <span className="font-medium">{data.build.frontendProvider}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Database</span>
              <span className="font-medium">{data.build.databaseProvider}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Frontend URL</span>
              <span className="max-w-[16rem] truncate text-right font-medium">
                {data.build.frontendUrl ?? "—"}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Dependencies"
        description="Key service health checks and provider configuration."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.dependencies.map((component) => (
            <div
              key={component.key}
              className="rounded-xl border border-white/10 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {component.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {component.provider ?? "—"}
                  </p>
                </div>
                <StatusPill status={component.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {component.statusSummary}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Active alerts"
          description="Items that likely need an operator or support follow-up."
        >
          {data.alerts.length === 0 ? (
            <EmptyState
              title="No active alerts"
              description="The current rollup did not detect any urgent follow-up items."
            />
          ) : (
            <div className="space-y-3">
              {data.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusPill status={alert.severity} />
                      <p className="text-sm font-medium text-foreground">
                        {alert.title}
                      </p>
                    </div>
                    {alert.href ? (
                      <Link
                        to={alert.href}
                        className="text-xs text-primary hover:underline"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {alert.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Quick links"
          description="Jump directly into the existing admin workflows this page rolls up."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {data.quickLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-medium text-foreground transition hover:border-white/30"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Open incidents"
          description="Recent unresolved incidents with linked updates."
        >
          {data.openIncidents.length === 0 ? (
            <EmptyState
              title="No open incidents"
              description="The incident timeline is currently clear."
            />
          ) : (
            <div className="space-y-3">
              {data.openIncidents.map((incident) => (
                <div
                  key={incident.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {incident.title}
                    </p>
                    <StatusPill status={incident.severity} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {incident.summary}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {INCIDENT_LABEL[incident.status]} · started{" "}
                    {formatDateTime(incident.startedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Maintenance windows"
          description="Upcoming or active maintenance windows."
        >
          {data.maintenanceWindows.length === 0 ? (
            <EmptyState
              title="No maintenance scheduled"
              description="Create a maintenance window when the platform has a planned ops event."
            />
          ) : (
            <div className="space-y-3">
              {data.maintenanceWindows.map((window) => (
                <div
                  key={window.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {window.title}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {MAINTENANCE_LABEL[window.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatDateTime(window.startsAt)} to{" "}
                    {formatDateTime(window.endsAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="User-facing notices"
          description="Active maintenance or operational broadcasts."
        >
          {data.activeNotices.length === 0 ? (
            <EmptyState
              title="No active notices"
              description="No user-facing operational notice is active right now."
            />
          ) : (
            <div className="space-y-3">
              {data.activeNotices.map((notice) => (
                <div
                  key={notice.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {notice.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {labelForStatus(notice.severity)} ·{" "}
                    {formatDateTime(notice.startsAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function HealthTab({ data }: { data: AdminSystemHealth }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="API version"
          value={data.runtime.apiVersion}
          sub={data.runtime.environment}
        />
        <MetricCard
          label="Uptime"
          value={formatUptimeSec(data.runtime.uptimeSec)}
          sub={`${formatCompact(data.runtime.uptimeSec)}s total`}
        />
        <MetricCard
          label="RSS memory"
          value={`${data.runtime.memory.rssMb} MB`}
        />
        <MetricCard
          label="Heap used"
          value={`${data.runtime.memory.heapUsedMb} MB`}
        />
      </div>

      <SectionCard
        title="Runtime metadata"
        description="Current backend process details for ops and diagnostics."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Node:</span>{" "}
              {data.runtime.nodeVersion}
            </p>
            <p>
              <span className="text-muted-foreground">PID:</span>{" "}
              {data.runtime.pid}
            </p>
            <p>
              <span className="text-muted-foreground">Backend platform:</span>{" "}
              {data.build.backendProvider}
            </p>
            <p>
              <span className="text-muted-foreground">Frontend platform:</span>{" "}
              {data.build.frontendProvider}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Backend commit:</span>{" "}
              {shortSha(data.build.backendCommitSha)}
            </p>
            <p>
              <span className="text-muted-foreground">Frontend commit:</span>{" "}
              {shortSha(resolveFrontendCommitSha(data.build.frontendCommitSha))}
            </p>
            <p>
              <span className="text-muted-foreground">Frontend URL:</span>{" "}
              {data.build.frontendUrl ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Checked:</span>{" "}
              {formatDateTime(data.checkedAt)}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Component health"
        description="Live dependency view for backend, frontend, DB, providers, and notification delivery."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {data.components.map((component) => (
            <div
              key={component.key}
              className="rounded-xl border border-white/10 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {component.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {component.description}
                  </p>
                </div>
                <StatusPill status={component.status} />
              </div>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                <p>{component.statusSummary}</p>
                <p>Provider: {component.provider ?? "—"}</p>
                <p>Configured: {component.configured ? "Yes" : "No"}</p>
                <p>
                  Last checked: {formatDateTime(component.lastCheckedAt)}
                  {component.responseTimeMs != null
                    ? ` · ${component.responseTimeMs} ms`
                    : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function FeatureStateBadge({ feature }: { feature: AdminSystemFeature }) {
  const live = feature.effectiveEnabled;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center justify-center rounded-full border px-2.5 py-1 text-xs font-medium",
        live
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
          : "bg-rose-500/12 border-rose-500/35 text-rose-200",
      )}
    >
      {live ? "Live" : "Disabled"}
    </span>
  );
}

function shortFeatureDescription(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 5) return value.trim();
  return `${words.slice(0, 5).join(" ")}...`;
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-sm text-foreground", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function FeatureEnvironmentBadge({
  environment,
}: {
  environment: SystemEnvironment;
}) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
      {labelForStatus(environment)}
    </span>
  );
}

function FeaturesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [viewTarget, setViewTarget] = useState<AdminSystemFeature | null>(null);
  const [editTarget, setEditTarget] = useState<AdminSystemFeature | null>(null);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editEnvironment, setEditEnvironment] =
    useState<SystemEnvironment>("ALL");
  const [editReason, setEditReason] = useState("");

  const featuresQuery = useQuery({
    queryKey: [...QUERY_KEYS.features, search],
    queryFn: () => fetchAdminSystemFeatures({ q: search || undefined }),
  });

  const updateFeatureMutation = useMutation({
    mutationFn: ({
      featureKey,
      body,
    }: {
      featureKey: AdminSystemFeature["key"];
      body: Parameters<typeof patchAdminSystemFeature>[1];
    }) => patchAdminSystemFeature(featureKey, body),
    onSuccess: async () => {
      toast.success("Feature updated");
      setEditTarget(null);
      setEditReason("");
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.features });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not update feature"),
      );
    },
  });

  const rows = featuresQuery.data?.items ?? [];

  function openEdit(feature: AdminSystemFeature) {
    setEditTarget(feature);
    setEditEnabled(feature.enabled);
    setEditEnvironment(feature.environment);
    setEditReason("");
  }

  return (
    <>
      <BaseModal
        isOpen={viewTarget != null}
        onClose={() => setViewTarget(null)}
        title={viewTarget?.name ?? "Feature details"}
        description={viewTarget?.description ?? "No description provided."}
        size="xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewTarget(null)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!viewTarget) return;
                openEdit(viewTarget);
                setViewTarget(null);
              }}
            >
              Edit
            </Button>
          </>
        }
      >
        {viewTarget ? (
          <div className="space-y-5 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="Feature key" value={viewTarget.slug} mono />
              <InfoRow label="Category" value={viewTarget.category} />
              <InfoRow label="Owner" value={viewTarget.owner} />
              <InfoRow
                label="Current environment"
                value={labelForStatus(viewTarget.environment)}
              />
              <InfoRow
                label="Current status"
                value={
                  viewTarget.effectiveEnabled
                    ? "Enabled in current environment"
                    : "Disabled in current environment"
                }
              />
              <InfoRow
                label="Source of truth"
                value={
                  viewTarget.isOverride
                    ? "Custom admin override"
                    : "Runtime default"
                }
              />
              <InfoRow
                label="Default configuration"
                value={`${viewTarget.defaultEnabled ? "Enabled" : "Disabled"} · ${labelForStatus(viewTarget.defaultEnvironment)}`}
              />
              <InfoRow
                label="Visibility"
                value={
                  viewTarget.isPublic
                    ? "Included in public system status"
                    : "Internal only"
                }
              />
              <InfoRow
                label="Updated by"
                value={viewTarget.updatedByDisplayName ?? "Runtime default"}
              />
              <InfoRow
                label="Updated"
                value={formatDateTime(viewTarget.updatedAt)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Runtime routes
              </div>
              <div className="flex flex-wrap gap-2">
                {viewTarget.routes.map((route) => (
                  <span
                    key={route}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-foreground"
                  >
                    {route}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Prerequisites
              </div>
              {viewTarget.prerequisites.length ? (
                <ul className="space-y-1 text-muted-foreground">
                  {viewTarget.prerequisites.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No additional provider prerequisites.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </BaseModal>

      <BaseModal
        isOpen={editTarget != null}
        onClose={() => {
          if (!updateFeatureMutation.isPending) {
            setEditTarget(null);
            setEditReason("");
          }
        }}
        title="Edit feature"
        description={
          editTarget ? (
            <>
              Update the runtime control for{" "}
              <span className="font-medium text-foreground">
                {editTarget.name}
              </span>
              .
            </>
          ) : undefined
        }
        size="md"
      >
        {editTarget ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateFeatureMutation.mutate({
                featureKey: editTarget.key,
                body: {
                  enabled: editEnabled,
                  environment: editEnvironment,
                  reason: editReason.trim() || undefined,
                },
              });
            }}
          >
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Runtime default
              </div>
              <div className="mt-1 text-sm text-foreground">
                {editTarget.defaultEnabled ? "Enabled" : "Disabled"} ·{" "}
                {labelForStatus(editTarget.defaultEnvironment)}
              </div>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <span className="font-medium text-foreground">Enabled</span>
              <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
            </label>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Environment scope
              </label>
              <select
                className="w-full rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                value={editEnvironment}
                onChange={(e) =>
                  setEditEnvironment(e.target.value as SystemEnvironment)
                }
              >
                <option value="ALL">All environments</option>
                <option value="DEVELOPMENT">Development only</option>
                <option value="STAGING">Staging only</option>
                <option value="PRODUCTION">Production only</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change reason
              </label>
              <Textarea
                placeholder="Optional audit note for this change"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={updateFeatureMutation.isPending}
                onClick={() => {
                  setEditEnabled(editTarget.defaultEnabled);
                  setEditEnvironment(editTarget.defaultEnvironment);
                }}
              >
                Use runtime defaults
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={updateFeatureMutation.isPending}
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateFeatureMutation.isPending}>
                {updateFeatureMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        ) : null}
      </BaseModal>

      <div className="space-y-6">
        <SectionCard
          title="Curated feature controls"
          description="Platform-connected features that are already wired into runtime behavior and can be controlled by admins."
          action={
            <Input
              placeholder="Search features"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
          }
        >
          {featuresQuery.isPending ? (
            <QueryLoading />
          ) : featuresQuery.isError ? (
            <InlineError error={featuresQuery.error} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No features found"
              description="Adjust the search to find a curated system feature."
            />
          ) : (
            <div className={ADMIN_TABLE_SCROLL}>
              <table className={adminTable("min-w-[40rem]")}>
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className={ADMIN_TH}>Feature</th>
                    <th className={ADMIN_TH}>Environment</th>
                    <th className={ADMIN_TH}>Status</th>
                    <th className={ADMIN_TH}>Updated</th>
                    <th className="w-12 whitespace-nowrap p-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((feature) => (
                    <tr key={feature.key} className="border-b border-white/5">
                      <td className={ADMIN_TD}>
                        <div className="font-medium text-foreground">
                          {feature.name}
                        </div>
                        {shortFeatureDescription(feature.description) ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {shortFeatureDescription(feature.description)}
                          </div>
                        ) : null}
                      </td>
                      <td className={ADMIN_TD}>
                        <FeatureEnvironmentBadge
                          environment={feature.environment}
                        />
                      </td>
                      <td className={ADMIN_TD}>
                        <div className="flex flex-col gap-2">
                          <FeatureStateBadge feature={feature} />
                          <span className="text-xs text-muted-foreground">
                            {feature.isPublic
                              ? "Public status visible"
                              : "Internal only"}
                          </span>
                        </div>
                      </td>
                      <td className={`${ADMIN_TD} text-muted-foreground`}>
                        {feature.updatedAt
                          ? formatDateTime(feature.updatedAt)
                          : "Runtime default"}
                      </td>
                      <td className={ADMIN_TD_ACTIONS}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Actions"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setViewTarget(feature)}
                            >
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(feature)}>
                              Edit
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function OperationsTab() {
  const qc = useQueryClient();
  const OPERATIONS_PAGE_SIZE = 5;
  const [incidentForm, setIncidentForm] = useState({
    title: "",
    summary: "",
    severity: "DEGRADED" as SystemStatusLevel,
    owner: "",
    impactedComponents: [] as ServiceComponentKey[],
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    title: "",
    description: "",
    startsAt: "",
    endsAt: "",
    owner: "",
    affectedComponents: [] as ServiceComponentKey[],
    createNotice: false,
    noticeTitle: "",
    noticeBody: "",
    noticeSeverity: "MAINTENANCE" as NotificationSeverity,
    noticeStatus: "SCHEDULED" as "DRAFT" | "SCHEDULED" | "ACTIVE",
    noticeDismissible: true,
  });
  const [incidentPage, setIncidentPage] = useState(1);
  const [maintenancePage, setMaintenancePage] = useState(1);
  const [incidentDeleteTarget, setIncidentDeleteTarget] =
    useState<AdminSystemIncident | null>(null);
  const [maintenanceDeleteTarget, setMaintenanceDeleteTarget] =
    useState<AdminSystemMaintenanceWindow | null>(null);

  const incidentsQuery = useQuery({
    queryKey: [...QUERY_KEYS.incidents, incidentPage, OPERATIONS_PAGE_SIZE],
    queryFn: () =>
      fetchAdminSystemIncidents({
        page: incidentPage,
        pageSize: OPERATIONS_PAGE_SIZE,
      }),
  });

  const maintenanceQuery = useQuery({
    queryKey: [
      ...QUERY_KEYS.maintenance,
      maintenancePage,
      OPERATIONS_PAGE_SIZE,
    ],
    queryFn: () =>
      fetchAdminSystemMaintenance({
        page: maintenancePage,
        pageSize: OPERATIONS_PAGE_SIZE,
      }),
  });

  const createIncidentMutation = useMutation({
    mutationFn: createAdminSystemIncident,
    onSuccess: async () => {
      toast.success("Incident created");
      setIncidentForm({
        title: "",
        summary: "",
        severity: "DEGRADED",
        owner: "",
        impactedComponents: [],
      });
      setIncidentPage(1);
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.incidents });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not create incident"),
      );
    },
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: createAdminSystemMaintenance,
    onSuccess: async () => {
      toast.success("Maintenance window created");
      setMaintenanceForm({
        title: "",
        description: "",
        startsAt: "",
        endsAt: "",
        owner: "",
        affectedComponents: [],
        createNotice: false,
        noticeTitle: "",
        noticeBody: "",
        noticeSeverity: "MAINTENANCE",
        noticeStatus: "SCHEDULED",
        noticeDismissible: true,
      });
      setMaintenancePage(1);
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.maintenance });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not create maintenance window"),
      );
    },
  });

  const incidentStatusMutation = useMutation({
    mutationFn: ({
      incidentId,
      status,
    }: {
      incidentId: string;
      status: IncidentStatus;
    }) =>
      patchAdminSystemIncident(incidentId, {
        status,
        reason: "Incident status changed from admin system management",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.incidents });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not update incident"),
      );
    },
  });

  const maintenanceStatusMutation = useMutation({
    mutationFn: ({
      maintenanceId,
      status,
    }: {
      maintenanceId: string;
      status: MaintenanceWindowStatus;
    }) =>
      patchAdminSystemMaintenance(maintenanceId, {
        status,
        reason: "Maintenance status changed from admin system management",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.maintenance });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not update maintenance window"),
      );
    },
  });

  const deleteIncidentMutation = useMutation({
    mutationFn: deleteAdminSystemIncident,
    onSuccess: async () => {
      toast.success("Incident deleted");
      setIncidentDeleteTarget(null);
      if ((incidentsQuery.data?.items.length ?? 0) === 1 && incidentPage > 1) {
        setIncidentPage((cur) => Math.max(1, cur - 1));
      }
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.incidents });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not delete incident"),
      );
    },
  });

  const deleteMaintenanceMutation = useMutation({
    mutationFn: deleteAdminSystemMaintenance,
    onSuccess: async () => {
      toast.success("Maintenance window deleted");
      setMaintenanceDeleteTarget(null);
      if (
        (maintenanceQuery.data?.items.length ?? 0) === 1 &&
        maintenancePage > 1
      ) {
        setMaintenancePage((cur) => Math.max(1, cur - 1));
      }
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.maintenance });
      await qc.invalidateQueries({ queryKey: QUERY_KEYS.overview });
    },
    onError: (error) => {
      toast.error(
        apiErrorText(error, "Could not delete maintenance window"),
      );
    },
  });

  const updatingIncidentId = incidentStatusMutation.isPending
    ? (incidentStatusMutation.variables?.incidentId ?? null)
    : null;
  const updatingMaintenanceId = maintenanceStatusMutation.isPending
    ? (maintenanceStatusMutation.variables?.maintenanceId ?? null)
    : null;
  const deletingIncidentId = deleteIncidentMutation.isPending
    ? (deleteIncidentMutation.variables ?? null)
    : null;
  const deletingMaintenanceId = deleteMaintenanceMutation.isPending
    ? (deleteMaintenanceMutation.variables ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Create incident"
          description="Log a current degradation, outage, or internal investigation."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!incidentForm.title.trim() || !incidentForm.summary.trim()) {
                toast.error("Incident title and summary are required");
                return;
              }
              createIncidentMutation.mutate({
                title: incidentForm.title,
                summary: incidentForm.summary,
                severity: incidentForm.severity,
                owner: incidentForm.owner,
                impactedComponents: incidentForm.impactedComponents,
                updateMessage: `Incident opened from admin dashboard at ${new Date().toLocaleString()}.`,
                reason: "Created from admin system management",
              });
            }}
          >
            <Input
              placeholder="Incident title"
              value={incidentForm.title}
              onChange={(e) =>
                setIncidentForm((cur) => ({ ...cur, title: e.target.value }))
              }
            />
            <Textarea
              placeholder="Short operator summary"
              value={incidentForm.summary}
              onChange={(e) =>
                setIncidentForm((cur) => ({ ...cur, summary: e.target.value }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <select
                className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                value={incidentForm.severity}
                onChange={(e) =>
                  setIncidentForm((cur) => ({
                    ...cur,
                    severity: e.target.value as SystemStatusLevel,
                  }))
                }
              >
                <option value="DEGRADED">Degraded</option>
                <option value="PARTIAL_OUTAGE">Partial outage</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="MAJOR_OUTAGE">Major outage</option>
              </select>
              <Input
                placeholder="Owner"
                value={incidentForm.owner}
                onChange={(e) =>
                  setIncidentForm((cur) => ({ ...cur, owner: e.target.value }))
                }
              />
            </div>
            <ComponentChecklist
              selected={incidentForm.impactedComponents}
              onChange={(next) =>
                setIncidentForm((cur) => ({ ...cur, impactedComponents: next }))
              }
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={createIncidentMutation.isPending}
            >
              {createIncidentMutation.isPending
                ? "Creating…"
                : "Create incident"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title="Create maintenance window"
          description="Schedule planned work and optionally publish a linked user-facing notice that opens a public details page."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !maintenanceForm.title.trim() ||
                !maintenanceForm.startsAt ||
                !maintenanceForm.endsAt
              ) {
                toast.error(
                  "Maintenance title, start time, and end time are required",
                );
                return;
              }
              const noticeTitle =
                maintenanceForm.noticeTitle.trim() ||
                maintenanceForm.title.trim();
              const noticeBody =
                maintenanceForm.noticeBody.trim() ||
                maintenanceForm.description.trim();
              if (maintenanceForm.createNotice && !noticeBody) {
                toast.error(
                  "Add notice copy or a maintenance description before creating a linked notice",
                );
                return;
              }
              createMaintenanceMutation.mutate({
                title: maintenanceForm.title,
                description: maintenanceForm.description,
                startsAt: new Date(maintenanceForm.startsAt).toISOString(),
                endsAt: new Date(maintenanceForm.endsAt).toISOString(),
                owner: maintenanceForm.owner,
                affectedComponents: maintenanceForm.affectedComponents,
                ...(maintenanceForm.createNotice
                  ? {
                      notice: {
                        title: noticeTitle,
                        body: noticeBody,
                        severity: maintenanceForm.noticeSeverity,
                        status: maintenanceForm.noticeStatus,
                        dismissible: maintenanceForm.noticeDismissible,
                        ctaLabel: "View details",
                      },
                    }
                  : {}),
                reason: "Created from admin system management",
              });
            }}
          >
            <Input
              placeholder="Maintenance title"
              value={maintenanceForm.title}
              onChange={(e) =>
                setMaintenanceForm((cur) => ({ ...cur, title: e.target.value }))
              }
            />
            <Textarea
              placeholder="What will happen during this window?"
              value={maintenanceForm.description}
              onChange={(e) =>
                setMaintenanceForm((cur) => ({
                  ...cur,
                  description: e.target.value,
                }))
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                type="datetime-local"
                value={maintenanceForm.startsAt}
                onChange={(e) =>
                  setMaintenanceForm((cur) => ({
                    ...cur,
                    startsAt: e.target.value,
                  }))
                }
              />
              <Input
                type="datetime-local"
                value={maintenanceForm.endsAt}
                onChange={(e) =>
                  setMaintenanceForm((cur) => ({
                    ...cur,
                    endsAt: e.target.value,
                  }))
                }
              />
            </div>
            <Input
              placeholder="Owner"
              value={maintenanceForm.owner}
              onChange={(e) =>
                setMaintenanceForm((cur) => ({ ...cur, owner: e.target.value }))
              }
            />
            <ComponentChecklist
              selected={maintenanceForm.affectedComponents}
              onChange={(next) =>
                setMaintenanceForm((cur) => ({
                  ...cur,
                  affectedComponents: next,
                }))
              }
            />
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <label className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Create linked user-facing notice
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Publishes a notice banner CTA that opens the public
                    maintenance details page.
                  </p>
                </div>
                <Switch
                  checked={maintenanceForm.createNotice}
                  onCheckedChange={(checked) =>
                    setMaintenanceForm((cur) => ({
                      ...cur,
                      createNotice: checked,
                    }))
                  }
                />
              </label>

              {maintenanceForm.createNotice ? (
                <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                  <Input
                    placeholder="Notice title (defaults to maintenance title)"
                    value={maintenanceForm.noticeTitle}
                    onChange={(e) =>
                      setMaintenanceForm((cur) => ({
                        ...cur,
                        noticeTitle: e.target.value,
                      }))
                    }
                  />
                  <Textarea
                    placeholder="Notice body (defaults to maintenance description)"
                    value={maintenanceForm.noticeBody}
                    onChange={(e) =>
                      setMaintenanceForm((cur) => ({
                        ...cur,
                        noticeBody: e.target.value,
                      }))
                    }
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <select
                      className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                      value={maintenanceForm.noticeSeverity}
                      onChange={(e) =>
                        setMaintenanceForm((cur) => ({
                          ...cur,
                          noticeSeverity: e.target
                            .value as NotificationSeverity,
                        }))
                      }
                    >
                      {NOTICE_SEVERITY_OPTIONS.map((severity) => (
                        <option key={severity} value={severity}>
                          {formatKeyValueLabel(severity)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                      value={maintenanceForm.noticeStatus}
                      onChange={(e) =>
                        setMaintenanceForm((cur) => ({
                          ...cur,
                          noticeStatus: e.target.value as
                            | "DRAFT"
                            | "SCHEDULED"
                            | "ACTIVE",
                        }))
                      }
                    >
                      {Object.entries(NOTICE_PUBLISH_LABEL).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <Switch
                      checked={maintenanceForm.noticeDismissible}
                      onCheckedChange={(checked) =>
                        setMaintenanceForm((cur) => ({
                          ...cur,
                          noticeDismissible: checked,
                        }))
                      }
                    />
                    Allow users to dismiss the linked notice
                  </label>
                  <p className="text-xs text-muted-foreground">
                    The notice CTA automatically links to{" "}
                    <span className="font-mono text-foreground">
                      /status/maintenance/&lt;maintenanceId&gt;
                    </span>
                    .
                  </p>
                </div>
              ) : null}
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={createMaintenanceMutation.isPending}
            >
              {createMaintenanceMutation.isPending
                ? "Creating…"
                : "Create maintenance window"}
            </Button>
          </form>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Incidents"
          description="Track current investigations and outage states."
        >
          {incidentsQuery.isPending ? (
            <QueryLoading />
          ) : incidentsQuery.isError ? (
            <InlineError error={incidentsQuery.error} />
          ) : incidentsQuery.data.items.length === 0 ? (
            <EmptyState
              title="No incidents"
              description="Open incidents will appear here."
            />
          ) : (
            <div className="space-y-3">
              {incidentsQuery.data.items.map((incident) => (
                <div
                  key={incident.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {incident.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {incident.owner ?? "Unassigned"} · started{" "}
                        {formatDateTime(incident.startedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusPill status={incident.severity} />
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <select
                            className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                            value={incident.status}
                            disabled={
                              updatingIncidentId === incident.id ||
                              deletingIncidentId === incident.id
                            }
                            onChange={(e) =>
                              incidentStatusMutation.mutate({
                                incidentId: incident.id,
                                status: e.target.value as IncidentStatus,
                              })
                            }
                          >
                            <option value="OPEN">Open</option>
                            <option value="INVESTIGATING">Investigating</option>
                            <option value="IDENTIFIED">Identified</option>
                            <option value="MONITORING">Monitoring</option>
                            <option value="RESOLVED">Resolved</option>
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={
                              updatingIncidentId === incident.id ||
                              deletingIncidentId === incident.id
                            }
                            onClick={() => setIncidentDeleteTarget(incident)}
                          >
                            Delete
                          </Button>
                        </div>
                        {updatingIncidentId === incident.id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Saving…
                          </span>
                        ) : deletingIncidentId === incident.id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Deleting…
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {incident.summary}
                  </p>
                  {incident.updates[0] ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Latest update: {incident.updates[0].body}
                    </p>
                  ) : null}
                </div>
              ))}
              {incidentsQuery.data.total > 0 ? (
                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={incidentPage <= 1 || incidentsQuery.isFetching}
                    onClick={() =>
                      setIncidentPage((cur) => Math.max(1, cur - 1))
                    }
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {incidentsQuery.data.page} /{" "}
                    {incidentsQuery.data.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      incidentPage >= incidentsQuery.data.totalPages ||
                      incidentsQuery.isFetching
                    }
                    onClick={() =>
                      setIncidentPage((cur) =>
                        Math.min(incidentsQuery.data.totalPages, cur + 1),
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Maintenance windows"
          description="Manage planned work and operational windows."
        >
          {maintenanceQuery.isPending ? (
            <QueryLoading />
          ) : maintenanceQuery.isError ? (
            <InlineError error={maintenanceQuery.error} />
          ) : maintenanceQuery.data.items.length === 0 ? (
            <EmptyState
              title="No maintenance windows"
              description="Scheduled work will appear here."
            />
          ) : (
            <div className="space-y-3">
              {maintenanceQuery.data.items.map((window) => (
                <div
                  key={window.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {window.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(window.startsAt)} to{" "}
                        {formatDateTime(window.endsAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                          value={window.storedStatus}
                          disabled={
                            updatingMaintenanceId === window.id ||
                            deletingMaintenanceId === window.id
                          }
                          onChange={(e) =>
                            maintenanceStatusMutation.mutate({
                              maintenanceId: window.id,
                              status: e.target.value as MaintenanceWindowStatus,
                            })
                          }
                        >
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="ACTIVE">Active</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELED">Canceled</option>
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={
                            updatingMaintenanceId === window.id ||
                            deletingMaintenanceId === window.id
                          }
                          onClick={() => setMaintenanceDeleteTarget(window)}
                        >
                          Delete
                        </Button>
                      </div>
                      {updatingMaintenanceId === window.id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Saving…
                        </span>
                      ) : deletingMaintenanceId === window.id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Deleting…
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {window.description ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {window.description}
                    </p>
                  ) : null}
                  {window.linkedBroadcast ? (
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Linked notice
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {window.linkedBroadcast.title}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        <Link
                          to={maintenanceNoticePath(window.id)}
                          className="text-primary hover:underline"
                        >
                          Open public page
                        </Link>
                        <Link
                          to={`/admin/notifications/broadcasts/${window.linkedBroadcast.id}`}
                          className="text-primary hover:underline"
                        >
                          Open notice
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
              {maintenanceQuery.data.total > 0 ? (
                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      maintenancePage <= 1 || maintenanceQuery.isFetching
                    }
                    onClick={() =>
                      setMaintenancePage((cur) => Math.max(1, cur - 1))
                    }
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {maintenanceQuery.data.page} /{" "}
                    {maintenanceQuery.data.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      maintenancePage >= maintenanceQuery.data.totalPages ||
                      maintenanceQuery.isFetching
                    }
                    onClick={() =>
                      setMaintenancePage((cur) =>
                        Math.min(maintenanceQuery.data.totalPages, cur + 1),
                      )
                    }
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>
      <BaseAlertDialog
        isOpen={incidentDeleteTarget != null}
        onClose={() => {
          if (!deleteIncidentMutation.isPending) {
            setIncidentDeleteTarget(null);
          }
        }}
        title="Delete this incident?"
        description="This removes the incident and its update history from the operations log. Linked notices are not deleted automatically."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleteIncidentMutation.isPending}
              onClick={() => setIncidentDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleteIncidentMutation.isPending || !incidentDeleteTarget
              }
              onClick={() =>
                incidentDeleteTarget &&
                deleteIncidentMutation.mutate(incidentDeleteTarget.id)
              }
            >
              {deleteIncidentMutation.isPending
                ? "Deleting…"
                : "Delete incident"}
            </Button>
          </>
        }
      />
      <BaseAlertDialog
        isOpen={maintenanceDeleteTarget != null}
        onClose={() => {
          if (!deleteMaintenanceMutation.isPending) {
            setMaintenanceDeleteTarget(null);
          }
        }}
        title="Delete this maintenance window?"
        description="This removes the maintenance window from operations. Any linked notice stays in the notifications system unless you remove it separately."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMaintenanceMutation.isPending}
              onClick={() => setMaintenanceDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleteMaintenanceMutation.isPending || !maintenanceDeleteTarget
              }
              onClick={() =>
                maintenanceDeleteTarget &&
                deleteMaintenanceMutation.mutate(maintenanceDeleteTarget.id)
              }
            >
              {deleteMaintenanceMutation.isPending
                ? "Deleting…"
                : "Delete maintenance window"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function DiagnosticsTab({ data }: { data: AdminSystemDiagnostics }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Zero-lap sessions"
          value={data.summary.zeroLapSessions}
        />
        <MetricCard
          label="Stuck processing"
          value={data.summary.processingStuckSessions}
        />
        <MetricCard
          label="Invalid lap sessions"
          value={data.summary.invalidLapSessions}
        />
        <MetricCard
          label="High-risk auth sessions"
          value={data.summary.highRiskAuthSessions}
        />
        <MetricCard
          label="Catalog orphans"
          value={data.summary.catalogOrphans}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Stuck sessions"
          description="Recent sessions with processing started but not completed."
        >
          {data.stuckSessions.length === 0 ? (
            <EmptyState
              title="No stuck sessions"
              description="Processing looks healthy right now."
            />
          ) : (
            <div className="space-y-3">
              {data.stuckSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {session.userDisplayName} · {session.sim}
                    </p>
                    <Link
                      to={`/admin/sessions/${session.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {session.track} · {session.car}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Started {formatDateTime(session.processingStartedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Risky auth users"
          description="Users with active sessions above the suspicious risk threshold."
        >
          {data.riskyAuthUsers.length === 0 ? (
            <EmptyState
              title="No risky auth users"
              description="No elevated sign-in sessions are active."
            />
          ) : (
            <div className="space-y-3">
              {data.riskyAuthUsers.map((user) => (
                <div
                  key={user.userId}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {user.userDisplayName}
                    </p>
                    <Link
                      to={`/admin/follows/users/${user.userId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      User detail
                    </Link>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Max risk {user.maxRiskScore} · {user.suspiciousSessionCount}{" "}
                    suspicious sessions
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Support backlog"
          description="Oldest unresolved contact submissions."
        >
          {data.supportBacklog.length === 0 ? (
            <EmptyState
              title="No support backlog"
              description="The contact queue is clear."
            />
          ) : (
            <div className="space-y-3">
              {data.supportBacklog.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {item.name}
                    </p>
                    <Link
                      to={`/admin/contact/${item.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.status} · {formatDateTime(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Failed deliveries"
          description="Recent failed notification deliveries."
        >
          {data.failedDeliveries.length === 0 ? (
            <EmptyState
              title="No failed deliveries"
              description="Recent email delivery looks healthy."
            />
          ) : (
            <div className="space-y-3">
              {data.failedDeliveries.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/10 px-4 py-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {item.campaignTitle}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.userDisplayName} · attempt {item.attempts}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function AuditTab() {
  const [source, setSource] = useState<"SYSTEM" | "USER_ACTION" | "ALL">("ALL");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [source]);

  const auditQuery = useQuery({
    queryKey: [...QUERY_KEYS.audit, source, page],
    queryFn: () => fetchAdminSystemAudit({ page, pageSize: 20, source }),
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Admin audit trail"
        description="Durable system audit events plus user-scoped admin actions."
        action={
          <select
            className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "SYSTEM" | "USER_ACTION" | "ALL")
            }
          >
            <option value="ALL">All sources</option>
            <option value="SYSTEM">System events</option>
            <option value="USER_ACTION">User actions</option>
          </select>
        }
      >
        {auditQuery.isPending ? (
          <QueryLoading />
        ) : auditQuery.isError ? (
          <InlineError error={auditQuery.error} />
        ) : auditQuery.data.items.length === 0 ? (
          <EmptyState
            title="No audit events"
            description="No matching audit rows were found."
          />
        ) : (
          <div className="space-y-3">
            {auditQuery.data.items.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-white/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {event.summary}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {event.source}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {event.actorDisplayName ?? "Unknown actor"} ·{" "}
                  {formatDateTime(event.createdAt)}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {auditQuery.data.page} of {auditQuery.data.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((cur) => Math.max(1, cur - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= auditQuery.data.totalPages}
                  onClick={() =>
                    setPage((cur) =>
                      Math.min(auditQuery.data.totalPages, cur + 1),
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default function AdminSystem() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [overviewQuery, healthQuery, diagnosticsQuery] = useQueries({
    queries: [
      {
        queryKey: QUERY_KEYS.overview,
        queryFn: fetchAdminSystemOverview,
        refetchInterval: 30_000,
      },
      {
        queryKey: QUERY_KEYS.health,
        queryFn: fetchAdminSystemHealth,
        refetchInterval: 30_000,
      },
      {
        queryKey: QUERY_KEYS.diagnostics,
        queryFn: fetchAdminSystemDiagnostics,
        enabled: tab === "diagnostics",
        refetchInterval: tab === "diagnostics" ? 30_000 : false,
      },
    ],
  }) as [
    UseQueryResult<AdminSystemOverview>,
    UseQueryResult<AdminSystemHealth>,
    UseQueryResult<AdminSystemDiagnostics>,
  ];

  const anyRefreshing =
    overviewQuery.isFetching ||
    healthQuery.isFetching ||
    diagnosticsQuery.isFetching;

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QUERY_KEYS.overview }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.health }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.features }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.incidents }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.maintenance }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.diagnostics }),
      qc.invalidateQueries({ queryKey: QUERY_KEYS.audit }),
    ]);
  };

  const setTab = (next: TabId) => {
    setSearchParams(next === "overview" ? {} : { tab: next }, {
      replace: true,
    });
  };

  return (
    <>
      <PageMeta
        path="/admin/system"
        title={TITLE}
        description="Internal service health, diagnostics, curated platform features, and operational status."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              System
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Internal service health, operational status, curated platform
              features, diagnostics, audit, and support-facing maintenance
              tooling.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={refreshAll}
            disabled={anyRefreshing}
          >
            {anyRefreshing ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-2 size-4" aria-hidden />
            )}
            Refresh
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <TabsList className={ADMIN_TABS_LIST}>
            {TAB_OPTIONS.map((tabId) => (
              <TabsTrigger key={tabId} value={tabId}>
                {TAB_LABEL[tabId]}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className={ADMIN_TABS_CONTENT}>
            {overviewQuery.isPending ? (
              <QueryLoading />
            ) : overviewQuery.isError ? (
              <InlineError error={overviewQuery.error} />
            ) : (
              <OverviewTab data={overviewQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="health" className={ADMIN_TABS_CONTENT}>
            {healthQuery.isPending ? (
              <QueryLoading />
            ) : healthQuery.isError ? (
              <InlineError error={healthQuery.error} />
            ) : (
              <HealthTab data={healthQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="features" className={ADMIN_TABS_CONTENT}>
            <FeaturesTab />
          </TabsContent>

          <TabsContent value="operations" className={ADMIN_TABS_CONTENT}>
            <OperationsTab />
          </TabsContent>

          <TabsContent value="diagnostics" className={ADMIN_TABS_CONTENT}>
            {diagnosticsQuery.isPending ? (
              <QueryLoading />
            ) : diagnosticsQuery.isError ? (
              <InlineError error={diagnosticsQuery.error} />
            ) : (
              <DiagnosticsTab data={diagnosticsQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="audit" className={ADMIN_TABS_CONTENT}>
            <AuditTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
