import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MoreHorizontal } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  apiErrorText,
  ApiError,
  withRequestId,
  archiveBroadcast,
  deleteBroadcast,
  deleteCampaign,
  fetchAdminBroadcasts,
  fetchAdminCampaigns,
  fetchAdminNotificationsOverview,
  pauseBroadcast,
  publishBroadcast,
  resendFailedCampaignEmails,
  unarchiveBroadcast,
  type AdminBroadcastRow,
  type AdminCampaignRow,
  type AdminNotificationsOverview,
  type BroadcastStatus,
} from "@/lib/api";
import { BroadcastComposeModal } from "@/components/admin/BroadcastComposeModal";
import { CampaignComposeModal } from "@/components/admin/CampaignComposeModal";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_CARD,
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

const TITLE = `Admin · Notifications | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;

type TabId = "overview" | "broadcasts" | "campaigns";

const SEVERITY_DOT: Record<string, string> = {
  INFO: "bg-sky-400",
  SUCCESS: "bg-emerald-400",
  WARNING: "bg-amber-400",
  CRITICAL: "bg-red-400",
  MAINTENANCE: "bg-violet-400",
};

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

const STATUS_PILL: Record<BroadcastStatus, string> = {
  DRAFT: "bg-white/5 text-muted-foreground border-white/10",
  SCHEDULED: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  PAUSED: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  ARCHIVED: "bg-white/5 text-muted-foreground border-white/10",
};

const BROADCAST_LIST_KEY = ["admin", "notifications", "broadcasts"] as const;
const CAMPAIGN_LIST_KEY = ["admin", "notifications", "campaigns"] as const;
const OVERVIEW_KEY = ["admin", "notifications", "overview"] as const;

export default function AdminNotifications() {
  const [search, setSearch] = useSearchParams();
  const initialTab = (search.get("tab") as TabId) ?? "overview";
  const [tab, setTab] = useState<TabId>(initialTab);
  const [createBroadcastOpen, setCreateBroadcastOpen] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const cur = search.get("tab");
    if (cur !== tab) {
      const next = new URLSearchParams(search);
      next.set("tab", tab);
      setSearch(next, { replace: true });
    }
  }, [tab, search, setSearch]);

  return (
    <>
      <PageMeta
        path="/admin/notifications"
        title={TITLE}
        description="Manage notifications."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Broadcast site-wide banners and send targeted notifications to
              user segments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateCampaignOpen(true)}
            >
              Send targeted
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setCreateBroadcastOpen(true)}
            >
              New broadcast
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList className={ADMIN_TABS_LIST}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="broadcasts">Broadcasts</TabsTrigger>
            <TabsTrigger value="campaigns">Targeted campaigns</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className={ADMIN_TABS_CONTENT}>
            <OverviewTab onJumpToFailed={() => setTab("campaigns")} />
          </TabsContent>
          <TabsContent value="broadcasts" className={ADMIN_TABS_CONTENT}>
            <BroadcastsTab />
          </TabsContent>
          <TabsContent value="campaigns" className={ADMIN_TABS_CONTENT}>
            <CampaignsTab />
          </TabsContent>
        </Tabs>
      </div>

      {createBroadcastOpen && (
        <BroadcastComposeModal
          onClose={() => setCreateBroadcastOpen(false)}
          onSaved={async () => {
            await Promise.all([
              qc.invalidateQueries({ queryKey: BROADCAST_LIST_KEY }),
              qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
            ]);
            setCreateBroadcastOpen(false);
            setTab("broadcasts");
          }}
        />
      )}
      {createCampaignOpen && (
        <CampaignComposeModal
          onClose={() => setCreateCampaignOpen(false)}
          onSent={async () => {
            await Promise.all([
              qc.invalidateQueries({ queryKey: CAMPAIGN_LIST_KEY }),
              qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
            ]);
            setCreateCampaignOpen(false);
            setTab("campaigns");
          }}
        />
      )}
    </>
  );
}

// =====================================================================
// Overview tab
// =====================================================================

function StatCard({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl border border-white/10 bg-card/50 p-4 text-left ${
        onClick ? "transition hover:border-white/30" : ""
      }`}
    >
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      {sub ? (
        <span className="text-xs text-muted-foreground">{sub}</span>
      ) : null}
    </Wrapper>
  );
}

function OverviewTab({ onJumpToFailed }: { onJumpToFailed: () => void }) {
  const { data, isPending, isError, error } = useQuery<AdminNotificationsOverview>({
    queryKey: ["admin", "notifications", "overview"],
    queryFn: fetchAdminNotificationsOverview,
    refetchInterval: 30_000,
  });

  if (isPending) {
    return (
      <div className="flex justify-center px-4 py-16" aria-busy="true">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {withRequestId("Could not load overview.", error)}
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Active broadcasts"
        value={data.activeBroadcasts}
        sub={`of ${data.totalBroadcasts} total`}
      />
      <StatCard
        label="Deliveries (24h)"
        value={data.deliveriesLast24h}
        sub={`${data.campaignsLast24h} campaign${data.campaignsLast24h === 1 ? "" : "s"}`}
      />
      <StatCard
        label="Email success rate"
        value={
          data.emailSuccessRate == null ? "—" : `${data.emailSuccessRate}%`
        }
        sub={`${data.emailSent} sent · ${data.emailSkipped} skipped`}
      />
      <StatCard
        label="Failed email deliveries"
        value={data.emailFailed}
        sub="Click to review"
        onClick={onJumpToFailed}
      />
    </div>
  );
}

// =====================================================================
// Broadcasts tab
// =====================================================================

function BroadcastsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminBroadcastRow | null>(
    null,
  );
  const debounced = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  useEffect(() => setPage(1), [debounced, statusFilter, severityFilter]);

  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(statusFilter.trim()
        ? { status: statusFilter.trim() as BroadcastStatus }
        : {}),
      ...(severityFilter.trim()
        ? { severity: severityFilter.trim() as AdminBroadcastRow["severity"] }
        : {}),
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
    }),
    [page, statusFilter, severityFilter, debounced],
  );
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "notifications", "broadcasts", params],
    queryFn: () => fetchAdminBroadcasts(params),
  });

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: BROADCAST_LIST_KEY }),
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
    ]);
  }

  const publishMut = useMutation({
    mutationFn: (id: string) => publishBroadcast(id),
    onSuccess: invalidate,
  });
  const pauseMut = useMutation({
    mutationFn: (id: string) => pauseBroadcast(id),
    onSuccess: invalidate,
  });
  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveBroadcast(id),
    onSuccess: invalidate,
  });
  const unarchiveMut = useMutation({
    mutationFn: (id: string) => unarchiveBroadcast(id),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBroadcast(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidate();
    },
  });

  function handleDelete(b: AdminBroadcastRow) {
    if (deleteMut.isPending) return;
    setDeleteTarget(b);
  }

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const currentPage = data?.page ?? page;
  const totalPages = data?.totalPages ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const rangeLabel = useMemo(() => {
    if (total === 0) return "Showing 0 of 0 broadcasts";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    return `Showing ${start}–${end} of ${total} broadcasts`;
  }, [total, currentPage, pageSize]);

  return (
    <>
      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorText(error, "Could not load broadcasts.")}
        </div>
      )}
      <div className={ADMIN_TABLE_CARD}>
        <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <Input
              placeholder="Search title or body…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full min-w-[12rem] max-w-xs"
            />
            <select
              className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="">All severities</option>
              <option value="INFO">Info</option>
              <option value="SUCCESS">Success</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground max-lg:w-full lg:text-right">
            {isPending ? "Loading…" : rangeLabel}
          </p>
        </div>
        {isPending ? (
          <div className="flex justify-center px-4 py-12" aria-busy="true">
            <Loader2
              className="size-6 animate-spin text-muted-foreground"
              aria-hidden
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No broadcasts yet. Click{" "}
            <span className="text-foreground">New broadcast</span> to create
            one.
          </div>
        ) : (
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={adminTable("min-w-[52rem]")}>
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className={ADMIN_TH}>Title</th>
                  <th className={ADMIN_TH}>Severity</th>
                  <th className={ADMIN_TH}>Audience</th>
                  <th className={ADMIN_TH}>Window</th>
                  <th className={ADMIN_TH}>Status</th>
                  <th className={ADMIN_TH}>Views</th>
                  <th className={ADMIN_TH}>Dismissed</th>
                  <th className="whitespace-nowrap p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-white/5">
                    <td className={ADMIN_TD}>
                      <Link
                        to={`/admin/notifications/broadcasts/${b.id}`}
                        className="text-primary hover:underline"
                      >
                        {b.title}
                      </Link>
                    </td>
                    <td className={ADMIN_TD}>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          className={`size-2 rounded-full ${SEVERITY_DOT[b.severity] ?? "bg-muted"}`}
                          aria-hidden
                        />
                        {b.severity}
                      </span>
                    </td>
                    <td className={`${ADMIN_TD} text-muted-foreground`}>
                      {b.audienceSummary}
                    </td>
                    <td className={`${ADMIN_TD} text-xs text-muted-foreground`}>
                      <div>{new Date(b.startsAt).toLocaleString()}</div>
                      <div>
                        {b.endsAt
                          ? new Date(b.endsAt).toLocaleString()
                          : "(no end)"}
                      </div>
                    </td>
                    <td className={ADMIN_TD}>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${STATUS_PILL[b.status]}`}
                      >
                        {STATUS_LABEL[b.status]}
                      </span>
                    </td>
                    <td className={`${ADMIN_TD} tabular-nums`}>
                      {b.viewCount}
                    </td>
                    <td className={`${ADMIN_TD} tabular-nums`}>
                      {b.dismissalCount}
                    </td>
                    <td className={ADMIN_TD_ACTIONS}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link
                              to={`/admin/notifications/broadcasts/${b.id}`}
                            >
                              View
                            </Link>
                          </DropdownMenuItem>
                          {(b.status === "DRAFT" ||
                            b.status === "PAUSED" ||
                            b.status === "SCHEDULED") && (
                            <DropdownMenuItem
                              onClick={() => publishMut.mutate(b.id)}
                            >
                              Publish
                            </DropdownMenuItem>
                          )}
                          {b.status === "ACTIVE" && (
                            <DropdownMenuItem
                              onClick={() => pauseMut.mutate(b.id)}
                            >
                              Pause
                            </DropdownMenuItem>
                          )}
                          {b.status === "ARCHIVED" ? (
                            <DropdownMenuItem
                              onClick={() => unarchiveMut.mutate(b.id)}
                            >
                              Unarchive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => archiveMut.mutate(b.id)}
                            >
                              Archive
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(b)}
                          >
                            Delete
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
      </div>
      {total > 0 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <BaseAlertDialog
        isOpen={deleteTarget != null}
        onClose={() => {
          if (deleteMut.isPending) return;
          deleteMut.reset();
          setDeleteTarget(null);
        }}
        title="Delete broadcast"
        description={
          deleteTarget
            ? `Delete the broadcast "${deleteTarget.title}"? This cannot be undone and removes view and dismissal records.`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMut.isPending}
              onClick={() => {
                deleteMut.reset();
                setDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                deleteMut.mutate(deleteTarget.id);
              }}
            >
              {deleteMut.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete broadcast"
              )}
            </Button>
          </>
        }
      >
        {deleteMut.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {apiErrorText(deleteMut.error, "Could not delete broadcast.")}
          </div>
        ) : null}
      </BaseAlertDialog>
    </>
  );
}

// =====================================================================
// Campaigns tab
// =====================================================================

function CampaignsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminCampaignRow | null>(
    null,
  );
  const debounced = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  useEffect(() => setPage(1), [debounced, channelFilter]);

  const params = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(channelFilter.trim()
        ? {
            channel:
              channelFilter.trim() as AdminCampaignRow["channels"][number],
          }
        : {}),
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
    }),
    [page, channelFilter, debounced],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "notifications", "campaigns", params],
    queryFn: () => fetchAdminCampaigns(params),
  });

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CAMPAIGN_LIST_KEY }),
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
    ]);
  }

  const resendMut = useMutation({
    mutationFn: (id: string) => resendFailedCampaignEmails(id),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidate();
    },
  });

  function handleDelete(c: AdminCampaignRow) {
    if (deleteMut.isPending) return;
    setDeleteTarget(c);
  }

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const currentPage = data?.page ?? page;
  const totalPages = data?.totalPages ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const rangeLabel = useMemo(() => {
    if (total === 0) return "Showing 0 of 0 campaigns";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    return `Showing ${start}–${end} of ${total} campaigns`;
  }, [total, currentPage, pageSize]);

  return (
    <>
      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {withRequestId("Could not load campaigns.", error)}
        </div>
      )}
      <div className={ADMIN_TABLE_CARD}>
        <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <Input
              placeholder="Search title or body…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full min-w-[12rem] max-w-xs"
            />
            <select
              className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              <option value="">All channels</option>
              <option value="IN_APP">In-app</option>
              <option value="EMAIL">Email</option>
            </select>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground max-lg:w-full lg:text-right">
            {isPending ? "Loading…" : rangeLabel}
          </p>
        </div>
        {isPending ? (
          <div className="flex justify-center px-4 py-12" aria-busy="true">
            <Loader2
              className="size-6 animate-spin text-muted-foreground"
              aria-hidden
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No targeted campaigns yet.
          </div>
        ) : (
          <div className={ADMIN_TABLE_SCROLL}>
            <table className={adminTable("min-w-[52rem]")}>
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className={ADMIN_TH}>Title</th>
                  <th className={ADMIN_TH}>Channels</th>
                  <th className={ADMIN_TH}>Audience</th>
                  <th className={ADMIN_TH}>Sent (in-app)</th>
                  <th className={ADMIN_TH}>Sent (email)</th>
                  <th className={ADMIN_TH}>Failed</th>
                  <th className={ADMIN_TH}>Skipped</th>
                  <th className={ADMIN_TH}>Created</th>
                  <th className="whitespace-nowrap p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className={ADMIN_TD}>
                      <Link
                        to={`/admin/notifications/campaigns/${c.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className={ADMIN_TD}>
                      <div className="flex flex-wrap gap-1">
                        {c.channels.map((ch) => (
                          <span
                            key={ch}
                            className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {ch === "IN_APP" ? "In-app" : "Email"}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`${ADMIN_TD} text-muted-foreground`}>
                      {c.audienceSummary}
                    </td>
                    <td className={`${ADMIN_TD} tabular-nums`}>
                      {c.inAppSentCount}
                    </td>
                    <td className={`${ADMIN_TD} tabular-nums`}>
                      {c.emailSentCount}
                    </td>
                    <td className={`${ADMIN_TD} tabular-nums`}>
                      {c.emailFailedCount > 0 ? (
                        <span className="text-red-400">
                          {c.emailFailedCount}
                        </span>
                      ) : (
                        c.emailFailedCount
                      )}
                    </td>
                    <td
                      className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                    >
                      {c.emailSkippedCount}
                    </td>
                    <td className={`${ADMIN_TD} text-xs text-muted-foreground`}>
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className={ADMIN_TD_ACTIONS}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/admin/notifications/campaigns/${c.id}`}>
                              View deliveries
                            </Link>
                          </DropdownMenuItem>
                          {c.emailFailedCount > 0 && (
                            <DropdownMenuItem
                              onClick={() => resendMut.mutate(c.id)}
                            >
                              Resend failed emails
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(c)}
                          >
                            Delete
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
      </div>
      {total > 0 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <BaseAlertDialog
        isOpen={deleteTarget != null}
        onClose={() => {
          if (deleteMut.isPending) return;
          deleteMut.reset();
          setDeleteTarget(null);
        }}
        title="Delete campaign"
        description={
          deleteTarget
            ? `Delete the campaign "${deleteTarget.title}"? Delivery records will be removed, but already-sent in-app notifications stay in user inboxes.`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMut.isPending}
              onClick={() => {
                deleteMut.reset();
                setDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                deleteMut.mutate(deleteTarget.id);
              }}
            >
              {deleteMut.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete campaign"
              )}
            </Button>
          </>
        }
      >
        {deleteMut.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {apiErrorText(deleteMut.error, "Could not delete campaign.")}
          </div>
        ) : null}
      </BaseAlertDialog>
    </>
  );
}
