import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminSubscriptionList,
  postAdminSubscriptionSync,
  postAdminSubscriptionSyncBatch,
  type AdminSubscriptionListParams,
  type AdminSubscriptionListRow,
} from "@/lib/api/adminSubscriptions";
import { apiErrorText } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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
  BillingIntervalChip,
  CancelAtPeriodEndBadge,
  PlanBadge,
  StaleSyncBadge,
  SubscriptionStatusBadge,
} from "@/pages/admin/adminSubscriptionBadges";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADMIN_TABS_CONTENT,
  ADMIN_TABS_LIST,
} from "@/pages/admin/adminTabsLayout";
import { AdminBetaAccessPanel } from "@/pages/admin/AdminBetaAccessPanel";

const TITLE = `Admin · Subscriptions | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;
type SubscriptionTab = "paid" | "beta";

const SELECT =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none focus:ring-0";

function formatAccessUntil(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSynced(iso: string | null, stale: boolean): string {
  if (!iso) return stale ? "Never" : "—";
  const d = new Date(iso);
  const label = d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  return stale ? `${label} (stale)` : label;
}

export default function AdminSubscriptions() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SubscriptionTab =
    searchParams.get("tab") === "beta" ? "beta" : "paid";
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [intervalFilter, setIntervalFilter] = useState<
    "" | "MONTHLY" | "ANNUAL"
  >("");
  const [cancelAtEndOnly, setCancelAtEndOnly] = useState(false);
  const [staleSyncOnly, setStaleSyncOnly] = useState(false);
  const [syncingUserId, setSyncingUserId] = useState<string | null>(null);
  const [syncingPage, setSyncingPage] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    planFilter,
    statusFilter,
    intervalFilter,
    cancelAtEndOnly,
    staleSyncOnly,
  ]);

  const listParams = useMemo(
    (): AdminSubscriptionListParams => ({
      page,
      pageSize: 20,
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(planFilter === "free" || planFilter === "pro"
        ? { effectivePlan: planFilter as "free" | "pro" }
        : {}),
      ...(statusFilter
        ? {
            subscriptionStatus: statusFilter as
              "ACTIVE" | "CANCELED" | "PAST_DUE" | "EXPIRED",
          }
        : {}),
      ...(intervalFilter === "MONTHLY" || intervalFilter === "ANNUAL"
        ? { billingInterval: intervalFilter }
        : {}),
      ...(cancelAtEndOnly ? { cancelAtPeriodEnd: true } : {}),
      ...(staleSyncOnly ? { staleSyncOnly: true } : {}),
    }),
    [
      page,
      debouncedSearch,
      planFilter,
      statusFilter,
      intervalFilter,
      cancelAtEndOnly,
      staleSyncOnly,
    ],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "subscriptions", listParams],
    queryFn: () => fetchAdminSubscriptionList(listParams),
    enabled: tab === "paid",
  });

  const syncMutation = useMutation({
    mutationFn: (userId: string) => postAdminSubscriptionSync(userId),
    onSuccess: async () => {
      toast.success("Subscription synced from RevenueCat");
      await qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
    },
    onError: (e) => {
      toast.error(apiErrorText(e, "Sync failed"));
    },
    onSettled: () => setSyncingUserId(null),
  });

  const pageSyncMutation = useMutation({
    mutationFn: (userIds: string[]) => postAdminSubscriptionSyncBatch(userIds),
    onSuccess: async (result) => {
      if (result.failed === 0) {
        toast.success(
          `Synced ${result.synced} subscription${result.synced === 1 ? "" : "s"} from RevenueCat`,
        );
      } else {
        toast.warning(
          `Synced ${result.synced} of ${result.synced + result.failed}; ${result.failed} failed`,
        );
      }
      await qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
    },
    onError: (e) => {
      toast.error(apiErrorText(e, "Page sync failed"));
    },
    onSettled: () => setSyncingPage(false),
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  async function handleSync(row: AdminSubscriptionListRow) {
    setSyncingUserId(row.userId);
    await syncMutation.mutateAsync(row.userId);
  }

  async function handleSyncPage() {
    if (rows.length === 0) return;
    setSyncingPage(true);
    await pageSyncMutation.mutateAsync(rows.map((r) => r.userId));
  }

  const pageSyncBusy = syncingPage && pageSyncMutation.isPending;
  const rowSyncBusy = syncMutation.isPending;

  return (
    <>
      <PageMeta
        path="/admin/subscriptions"
        title={TITLE}
        description="Manage RevenueCat subscriptions and billing."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage paid subscriptions and complimentary beta access.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) =>
            setSearchParams(value === "beta" ? { tab: "beta" } : {}, {
              replace: true,
            })
          }
          className="w-full"
        >
          <TabsList className={ADMIN_TABS_LIST}>
            <TabsTrigger value="paid">Paid subscriptions</TabsTrigger>
            <TabsTrigger value="beta">Beta access</TabsTrigger>
          </TabsList>

          <TabsContent value="paid" className={ADMIN_TABS_CONTENT}>
            <p className="mb-4 text-sm text-muted-foreground">
              RevenueCat-backed billing roster. Search by email, user id, or
              Stripe / RevenueCat identifiers. Sync refreshes the cache from
              RevenueCat.
            </p>
            <div className={ADMIN_TABLE_CARD}>
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-[12rem] flex-1">
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Search
                  </label>
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Email, user id, RC or Stripe id…"
                    className="border-white/10 bg-white/5"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Access
                  </label>
                  <select
                    className={SELECT}
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="pro">Pro access</option>
                    <option value="free">Free</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Status
                  </label>
                  <select
                    className={SELECT}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="ACTIVE">Active</option>
                    <option value="CANCELED">Canceled</option>
                    <option value="PAST_DUE">Past due</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Interval
                  </label>
                  <select
                    className={SELECT}
                    value={intervalFilter}
                    onChange={(e) =>
                      setIntervalFilter(
                        e.target.value as "" | "MONTHLY" | "ANNUAL",
                      )
                    }
                  >
                    <option value="">All</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={cancelAtEndOnly}
                    onChange={(e) => setCancelAtEndOnly(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  Cancel at period end
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={staleSyncOnly}
                    onChange={(e) => setStaleSyncOnly(e.target.checked)}
                    className="rounded border-white/20"
                  />
                  Stale sync (&gt;24h)
                </label>
              </div>

              {isError && (
                <p className="p-4 text-sm text-destructive">
                  {apiErrorText(error, "Failed to load subscriptions")}
                </p>
              )}

              {isPending ? (
                <div className="flex justify-center py-16">
                  <Loader2
                    className="size-8 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                </div>
              ) : rows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No subscriptions match these filters.
                  {(searchInput.trim() ||
                    planFilter ||
                    statusFilter ||
                    intervalFilter ||
                    cancelAtEndOnly ||
                    staleSyncOnly) && (
                    <button
                      type="button"
                      className="mt-4 block w-full text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        setSearchInput("");
                        setPlanFilter("");
                        setStatusFilter("");
                        setIntervalFilter("");
                        setCancelAtEndOnly(false);
                        setStaleSyncOnly(false);
                        setPage(1);
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className={ADMIN_TABLE_SCROLL}>
                    <table className={adminTable("min-w-[56rem]")}>
                      <thead>
                        <tr className="border-b border-white/10 text-muted-foreground">
                          <th className={`min-w-[14rem] ${ADMIN_TH}`}>User</th>
                          <th className={ADMIN_TH}>Plan</th>
                          <th className={ADMIN_TH}>Interval</th>
                          <th className={ADMIN_TH}>Status</th>
                          <th className={ADMIN_TH}>Access until</th>
                          <th className={ADMIN_TH}>Last synced</th>
                          <th className="w-28 whitespace-nowrap p-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.userId}
                            className="border-b border-white/5"
                          >
                            <td className={`min-w-[14rem] ${ADMIN_TD}`}>
                              <Link
                                to={`/admin/users/${r.userId}`}
                                className="font-medium text-foreground hover:underline"
                              >
                                {r.displayName}
                              </Link>
                              <div className="mt-0.5 break-all text-xs text-muted-foreground">
                                {r.email}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <CancelAtPeriodEndBadge
                                  active={r.cancelAtPeriodEnd}
                                />
                                <StaleSyncBadge stale={r.isSyncStale} />
                              </div>
                            </td>
                            <td className={`whitespace-nowrap ${ADMIN_TD}`}>
                              <PlanBadge
                                effectivePlan={r.effectivePlan}
                                subscriptionStatus={r.status}
                                planDisplayName={r.planDisplayName}
                                cancelAtPeriodEnd={r.cancelAtPeriodEnd}
                              />
                            </td>
                            <td className={`whitespace-nowrap ${ADMIN_TD}`}>
                              <BillingIntervalChip
                                interval={r.billingInterval}
                              />
                            </td>
                            <td className={`whitespace-nowrap ${ADMIN_TD}`}>
                              <SubscriptionStatusBadge status={r.status} />
                            </td>
                            <td
                              className={`whitespace-nowrap tabular-nums ${ADMIN_TD} text-muted-foreground`}
                            >
                              {formatAccessUntil(r.currentPeriodEnd)}
                            </td>
                            <td
                              className={`whitespace-nowrap text-xs ${ADMIN_TD} text-muted-foreground`}
                            >
                              {formatSynced(r.lastSyncedAt, r.isSyncStale)}
                            </td>
                            <td className={ADMIN_TD_ACTIONS}>
                              <div className="flex flex-col gap-1 sm:flex-row">
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={`/admin/users/${r.userId}`}>
                                    View
                                  </Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    (syncingUserId === r.userId &&
                                      rowSyncBusy) ||
                                    pageSyncBusy
                                  }
                                  onClick={() => void handleSync(r)}
                                >
                                  {syncingUserId === r.userId && rowSyncBusy ? (
                                    <Loader2
                                      className="size-3 animate-spin"
                                      aria-hidden
                                    />
                                  ) : (
                                    <RefreshCw className="size-3" aria-hidden />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-3">
                      <p>
                        Showing {rangeStart}–{rangeEnd} of{" "}
                        {total.toLocaleString()}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pageSyncBusy || rowSyncBusy}
                        onClick={() => void handleSyncPage()}
                      >
                        {pageSyncBusy ? (
                          <Loader2
                            className="size-3 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <RefreshCw className="size-3" aria-hidden />
                        )}
                        <span className="ml-1.5">
                          Sync page ({rows.length})
                        </span>
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="tabular-nums">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="beta" className={ADMIN_TABS_CONTENT}>
            <AdminBetaAccessPanel />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
