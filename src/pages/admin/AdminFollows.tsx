import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminFollowsOverview,
  fetchAdminFollowEdges,
  fetchAdminFollowRequests,
  fetchAdminFollowAnomalies,
  removeAdminFollow,
  removeAdminFollowRequest,
  type AdminFollowEdgeRow,
  type AdminFollowRequestRow,
  type AdminFollowUserSide,
  type AdminFollowsAnomalies,
} from "@/lib/api";
import { apiErrorText } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRight, Loader2, MoreHorizontal } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { wholeNumberInputProps } from "@/lib/inputGuards";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toast } from "sonner";

const TITLE = `Admin · Follow graph | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;
const PAGE_SIZE = 20;
const REASON_MAX = 500;

type TabKey = "edges" | "requests" | "anomalies";

type RemoveTarget =
  | {
      kind: "follow";
      id: string;
      follower: AdminFollowUserSide;
      following: AdminFollowUserSide;
    }
  | {
      kind: "request";
      id: string;
      follower: AdminFollowUserSide;
      following: AdminFollowUserSide;
    };

function relativeAge(iso: string): string {
  const created = new Date(iso).getTime();
  const now = Date.now();
  const ms = Math.max(0, now - created);
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    return hours <= 0 ? "just now" : `${hours}h`;
  }
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo`;
  return `${Math.floor(months / 12)}y`;
}

function ageDays(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000),
  );
}

function UserCell({ user }: { user: AdminFollowUserSide }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        to={`/admin/users/${encodeURIComponent(user.id)}`}
        className={cn(
          "min-w-0 truncate text-primary underline-offset-2 hover:underline",
          (user.isDeleted || user.isSuspended) && "opacity-70",
        )}
      >
        {user.displayName}
      </Link>
      {user.isDeleted && (
        <span className="shrink-0 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Deleted
        </span>
      )}
      {user.isSuspended && !user.isDeleted && (
        <span className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
          Suspended
        </span>
      )}
      {user.privateProfile && !user.isDeleted && !user.isSuspended && (
        <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
          Private
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <p className="text-[11px] uppercase tracking-widest text-white/50">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function rangeLabelFor(
  total: number,
  page: number,
  pageSize: number,
  noun: { one: string; many: string },
): string {
  if (total === 0) return `Showing 0 ${noun.many}`;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `Showing ${start}–${end} of ${total} ${total === 1 ? noun.one : noun.many}`;
}

export default function AdminFollows() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("edges");
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [reason, setReason] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["admin", "follows", "overview"],
    queryFn: fetchAdminFollowsOverview,
  });

  function openRemove(target: RemoveTarget): void {
    setRemoveTarget(target);
    setReason("");
    setRemoveError(null);
  }

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "follows"] }),
    ]);
  }

  const removeFollowMutation = useMutation({
    mutationFn: (payload: { id: string; reason: string | null }) =>
      removeAdminFollow(payload.id, payload.reason),
    onSuccess: async () => {
      toast.success("Follow removed");
      setRemoveTarget(null);
      setReason("");
      setRemoveError(null);
      await invalidateAll();
    },
    onError: (e) => {
      setRemoveError(
        apiErrorText(e, "Could not remove follow"),
      );
    },
  });

  const removeRequestMutation = useMutation({
    mutationFn: (payload: { id: string; reason: string | null }) =>
      removeAdminFollowRequest(payload.id, payload.reason),
    onSuccess: async () => {
      toast.success("Follow request declined");
      setRemoveTarget(null);
      setReason("");
      setRemoveError(null);
      await invalidateAll();
    },
    onError: (e) => {
      setRemoveError(
        apiErrorText(e, "Could not decline follow request"),
      );
    },
  });

  const removeBusy =
    removeFollowMutation.isPending || removeRequestMutation.isPending;

  function confirmRemove() {
    if (!removeTarget) return;
    const trimmed = reason.trim();
    if (trimmed.length > REASON_MAX) {
      setRemoveError(`Reason must be ${REASON_MAX} characters or fewer.`);
      return;
    }
    const reasonValue = trimmed.length > 0 ? trimmed : null;
    if (removeTarget.kind === "follow") {
      removeFollowMutation.mutate({ id: removeTarget.id, reason: reasonValue });
    } else {
      removeRequestMutation.mutate({
        id: removeTarget.id,
        reason: reasonValue,
      });
    }
  }

  return (
    <>
      <PageMeta
        path="/admin/follows"
        title={TITLE}
        description="Monitor follow edges and follow requests across the social graph."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Follow graph
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor follow edges and follow requests across the social graph,
            and resolve abuse cases.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Follow edges"
            value={overview.data?.followsTotal ?? "—"}
            hint={
              overview.data
                ? `+${overview.data.followsLast7Days} in 7d (${overview.data.followsLast24h} in 24h)`
                : undefined
            }
          />
          <StatCard
            label="Pending requests"
            value={overview.data?.followRequestsTotal ?? "—"}
            hint={
              overview.data
                ? `+${overview.data.followRequestsLast7Days} new in 7d`
                : undefined
            }
          />
          <StatCard
            label="Stale requests"
            value={overview.data?.followRequestsOlderThanThreshold ?? "—"}
            hint={
              overview.data
                ? `Older than ${overview.data.staleRequestDays} days`
                : undefined
            }
          />
          <StatCard
            label="New follows (24h)"
            value={overview.data?.followsLast24h ?? "—"}
            hint="Spike candidates"
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className={ADMIN_TABS_LIST}>
            <TabsTrigger value="edges">Edges</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="anomalies">Abuse signals</TabsTrigger>
          </TabsList>
          <TabsContent value="edges" className={ADMIN_TABS_CONTENT}>
            <EdgesTab onRemove={openRemove} />
          </TabsContent>
          <TabsContent value="requests" className={ADMIN_TABS_CONTENT}>
            <RequestsTab onRemove={openRemove} />
          </TabsContent>
          <TabsContent value="anomalies" className={ADMIN_TABS_CONTENT}>
            <AnomaliesTab onRemove={openRemove} />
          </TabsContent>
        </Tabs>

        {removeTarget && (
          <BaseAlertDialog
            isOpen={!!removeTarget}
            onClose={() => {
              setRemoveTarget(null);
              setRemoveError(null);
              setReason("");
            }}
            title={
              removeTarget.kind === "follow"
                ? "Remove this follow edge?"
                : "Force decline this follow request?"
            }
            description={
              <>
                <span className="font-medium text-foreground">
                  {removeTarget.follower.displayName}
                </span>{" "}
                {removeTarget.kind === "follow"
                  ? "will no longer follow "
                  : "will stop having a pending request to "}
                <span className="font-medium text-foreground">
                  {removeTarget.following.displayName}
                </span>
                . This is a silent admin action — no notification is sent.
              </>
            }
            size="sm"
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRemoveTarget(null);
                    setRemoveError(null);
                    setReason("");
                  }}
                  disabled={removeBusy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={confirmRemove}
                  disabled={removeBusy}
                >
                  {removeBusy
                    ? removeTarget.kind === "follow"
                      ? "Removing…"
                      : "Declining…"
                    : removeTarget.kind === "follow"
                      ? "Remove"
                      : "Force decline"}
                </Button>
              </>
            }
          >
            <label className="mt-4 block text-xs uppercase tracking-wide text-muted-foreground">
              Reason (optional)
              <Textarea
                className="mt-1 min-h-[88px]"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
                maxLength={REASON_MAX}
                placeholder="e.g. Brigading from a throwaway account"
              />
              <span className="mt-1 block text-right text-[11px] text-muted-foreground">
                {reason.length}/{REASON_MAX}
              </span>
            </label>
            {removeError && (
              <p className="mt-3 text-sm text-destructive">{removeError}</p>
            )}
          </BaseAlertDialog>
        )}
      </div>
    </>
  );
}

function EdgesTab({ onRemove }: { onRemove: (t: RemoveTarget) => void }) {
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [createdSince, setCreatedSince] = useState("");
  const debouncedQ = useDebouncedValue(qInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort, createdSince]);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
      ...(createdSince.trim()
        ? { createdSince: new Date(createdSince).toISOString() }
        : {}),
    }),
    [page, sort, debouncedQ, createdSince],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "follows", "edges", params],
    queryFn: () => fetchAdminFollowEdges(params),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className={ADMIN_TABLE_CARD}>
      <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name or email…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="w-full min-w-[14rem] max-w-sm"
          />
          <select
            className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            aria-label="Sort"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Created on/after
            <input
              type="date"
              className="rounded-md border border-white/10 bg-card px-2 py-1.5 text-sm text-foreground"
              value={createdSince}
              onChange={(e) => setCreatedSince(e.target.value)}
            />
          </label>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground max-lg:w-full lg:text-right">
          {isPending
            ? "Loading…"
            : rangeLabelFor(total, page, PAGE_SIZE, {
                one: "edge",
                many: "edges",
              })}
        </p>
      </div>

      {isError ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-destructive">
            {apiErrorText(error, "Could not load follows.")}
          </p>
        </div>
      ) : isPending ? (
        <div className="flex justify-center px-4 py-12" aria-busy="true">
          <Loader2
            className="size-6 animate-spin text-muted-foreground"
            aria-hidden
          />
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            No follow edges match
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different search or clear filters.
          </p>
        </div>
      ) : (
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={adminTable("min-w-[40rem]")}>
            <thead>
              <tr className="border-b border-white/10 text-muted-foreground">
                <th className={ADMIN_TH}>Follower</th>
                <th className="w-8 whitespace-nowrap p-3" aria-hidden />
                <th className={ADMIN_TH}>Following</th>
                <th className={ADMIN_TH}>Created</th>
                <th className="w-12 whitespace-nowrap p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <EdgeRow key={row.id} row={row} onRemove={onRemove} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isPending && !isError && total > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 p-3 sm:px-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

function EdgeRow({
  row,
  onRemove,
}: {
  row: AdminFollowEdgeRow;
  onRemove: (t: RemoveTarget) => void;
}) {
  return (
    <tr className="border-b border-white/5">
      <td className={ADMIN_TD}>
        <UserCell user={row.follower} />
      </td>
      <td className={`${ADMIN_TD} text-muted-foreground`} aria-hidden>
        <ArrowRight className="size-4" />
      </td>
      <td className={ADMIN_TD}>
        <UserCell user={row.following} />
      </td>
      <td className={`${ADMIN_TD} text-muted-foreground`}>
        {new Date(row.createdAt).toLocaleDateString()}
      </td>
      <td className={ADMIN_TD_ACTIONS}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actions"
              className="size-7"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                to={`/admin/follows/users/${encodeURIComponent(row.follower.id)}`}
              >
                View follower&apos;s graph
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to={`/admin/follows/users/${encodeURIComponent(row.following.id)}`}
              >
                View target&apos;s graph
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/admin/users/${encodeURIComponent(row.follower.id)}`}>
                Open follower
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/admin/users/${encodeURIComponent(row.following.id)}`}>
                Open target
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                onRemove({
                  kind: "follow",
                  id: row.id,
                  follower: row.follower,
                  following: row.following,
                })
              }
              className="text-destructive"
            >
              Remove follow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function RequestsTab({ onRemove }: { onRemove: (t: RemoveTarget) => void }) {
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("oldest");
  const [ageMinDays, setAgeMinDays] = useState<string>("");
  const debouncedQ = useDebouncedValue(qInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort, ageMinDays]);

  const params = useMemo(() => {
    const ageNum = parseInt(ageMinDays, 10);
    return {
      page,
      pageSize: PAGE_SIZE,
      sort,
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
      ...(Number.isFinite(ageNum) && ageNum > 0 ? { ageMinDays: ageNum } : {}),
    };
  }, [page, sort, debouncedQ, ageMinDays]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "follows", "requests", params],
    queryFn: () => fetchAdminFollowRequests(params),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className={ADMIN_TABLE_CARD}>
      <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name or email…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="w-full min-w-[14rem] max-w-sm"
          />
          <select
            className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
            aria-label="Sort"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Pending ≥ days
            <input
              type="number"
              min={0}
              className="w-20 rounded-md border border-white/10 bg-card px-2 py-1.5 text-sm text-foreground"
              value={ageMinDays}
              onChange={(e) => setAgeMinDays(e.target.value)}
              {...wholeNumberInputProps}
            />
          </label>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground max-lg:w-full lg:text-right">
          {isPending
            ? "Loading…"
            : rangeLabelFor(total, page, PAGE_SIZE, {
                one: "request",
                many: "requests",
              })}
        </p>
      </div>

      {isError ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-destructive">
            {apiErrorText(error, "Could not load follow requests.")}
          </p>
        </div>
      ) : isPending ? (
        <div className="flex justify-center px-4 py-12" aria-busy="true">
          <Loader2
            className="size-6 animate-spin text-muted-foreground"
            aria-hidden
          />
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            No follow requests match
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Try a different search or clear filters.
          </p>
        </div>
      ) : (
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={adminTable("min-w-[40rem]")}>
            <thead>
              <tr className="border-b border-white/10 text-muted-foreground">
                <th className={ADMIN_TH}>Requester</th>
                <th className="w-8 whitespace-nowrap p-3" aria-hidden />
                <th className={ADMIN_TH}>Target</th>
                <th className={ADMIN_TH}>Pending for</th>
                <th className="w-12 whitespace-nowrap p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <RequestRow key={row.id} row={row} onRemove={onRemove} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isPending && !isError && total > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 p-3 sm:px-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

function RequestRow({
  row,
  onRemove,
}: {
  row: AdminFollowRequestRow;
  onRemove: (t: RemoveTarget) => void;
}) {
  const days = ageDays(row.createdAt);
  const stale = days >= 14;
  return (
    <tr className="border-b border-white/5">
      <td className={ADMIN_TD}>
        <UserCell user={row.follower} />
      </td>
      <td className={`${ADMIN_TD} text-muted-foreground`} aria-hidden>
        <ArrowRight className="size-4" />
      </td>
      <td className={ADMIN_TD}>
        <UserCell user={row.following} />
      </td>
      <td className={ADMIN_TD}>
        <span
          className={cn(
            "tabular-nums",
            stale ? "text-red-300" : "text-muted-foreground",
          )}
        >
          {relativeAge(row.createdAt)}
        </span>
      </td>
      <td className={ADMIN_TD_ACTIONS}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actions"
              className="size-7"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                to={`/admin/follows/users/${encodeURIComponent(row.follower.id)}`}
              >
                View requester&apos;s graph
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to={`/admin/follows/users/${encodeURIComponent(row.following.id)}`}
              >
                View target&apos;s graph
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/admin/users/${encodeURIComponent(row.follower.id)}`}>
                Open requester
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/admin/users/${encodeURIComponent(row.following.id)}`}>
                Open target
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                onRemove({
                  kind: "request",
                  id: row.id,
                  follower: row.follower,
                  following: row.following,
                })
              }
              className="text-destructive"
            >
              Force decline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function AnomaliesTab({ onRemove }: { onRemove: (t: RemoveTarget) => void }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "follows", "anomalies"],
    queryFn: fetchAdminFollowAnomalies,
  });

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {apiErrorText(error, "Could not load abuse signals.")}
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <div
        className="flex justify-center rounded-xl border border-white/10 px-4 py-16"
        aria-busy="true"
      >
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BurstsCard
        title={`Outbound bursts (≥ ${data.burstThreshold24h}/24h)`}
        subtitle="Accounts following many new users in the last 24 hours — possible follow-bombing."
        items={data.followerBursts}
        emptyText="No follow-burst accounts detected."
      />
      <BurstsCard
        title={`Inbound bursts (≥ ${data.burstThreshold24h}/24h)`}
        subtitle="Accounts gaining many new followers in the last 24 hours — possible brigading."
        items={data.followingBursts}
        emptyText="No inbound brigading detected."
      />

      <StalePendingCard rows={data.stalePending} onRemove={onRemove} />

      <SuspendedInGraphCard rows={data.suspendedInGraph} onRemove={onRemove} />

      <HighPendingQueueCard rows={data.highPendingQueues} />

      <RatioOutliersCard rows={data.ratioOutliers} />
    </div>
  );
}

function BurstsCard({
  title,
  subtitle,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: AdminFollowsAnomalies["followerBursts"];
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {items.map((row) => (
            <li
              key={row.user.id}
              className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-white/5"
            >
              <UserCell user={row.user} />
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.count} new
                </span>
                <Link
                  to={`/admin/follows/users/${encodeURIComponent(row.user.id)}`}
                  className="text-xs text-primary underline-offset-2 hover:underline"
                >
                  Investigate →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StalePendingCard({
  rows,
  onRemove,
}: {
  rows: AdminFollowsAnomalies["stalePending"];
  onRemove: (t: RemoveTarget) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Stale pending requests
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Oldest pending follow requests. Surface support cases here.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No pending requests.
        </p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-white/5"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <UserCell user={row.follower} />
                <ArrowRight
                  className="size-3 text-muted-foreground"
                  aria-hidden
                />
                <UserCell user={row.following} />
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    row.ageDays >= 14
                      ? "text-red-300"
                      : "text-muted-foreground",
                  )}
                >
                  {row.ageDays}d
                </span>
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-2 hover:underline"
                  onClick={() =>
                    onRemove({
                      kind: "request",
                      id: row.id,
                      follower: row.follower,
                      following: row.following,
                    })
                  }
                >
                  Force decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuspendedInGraphCard({
  rows,
  onRemove,
}: {
  rows: AdminFollowsAnomalies["suspendedInGraph"];
  onRemove: (t: RemoveTarget) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Suspended/deleted users still in graph
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Follow edges where one or both parties are suspended or soft-deleted.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No follow edges involve suspended or deleted users.
        </p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-white/5"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <UserCell user={row.follower} />
                <ArrowRight
                  className="size-3 text-muted-foreground"
                  aria-hidden
                />
                <UserCell user={row.following} />
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-destructive underline-offset-2 hover:underline"
                onClick={() =>
                  onRemove({
                    kind: "follow",
                    id: row.id,
                    follower: row.follower,
                    following: row.following,
                  })
                }
              >
                Remove follow
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HighPendingQueueCard({
  rows,
}: {
  rows: AdminFollowsAnomalies["highPendingQueues"];
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Private accounts with biggest pending queue
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Operator hint — these users may need to review and approve/decline
        requests.
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No private-account backlogs.
        </p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.user.id}
              className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-white/5"
            >
              <UserCell user={row.user} />
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.pendingCount} pending
                </span>
                <Link
                  to={`/admin/follows/users/${encodeURIComponent(row.user.id)}`}
                  className="text-xs text-primary underline-offset-2 hover:underline"
                >
                  Open →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RatioOutliersCard({
  rows,
}: {
  rows: AdminFollowsAnomalies["ratioOutliers"];
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Follow-ratio outliers
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Mass-follower candidates (high following count, low followers, ratio
        descending).
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No outliers detected.
        </p>
      ) : (
        <ul className="mt-4 space-y-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.user.id}
              className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-white/5"
            >
              <UserCell user={row.user} />
              <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-muted-foreground">
                <span>Following {row.followingCount}</span>
                <span>·</span>
                <span>Followers {row.followersCount}</span>
                <span>·</span>
                <span>Ratio {row.ratio}</span>
                <Link
                  to={`/admin/follows/users/${encodeURIComponent(row.user.id)}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Investigate →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
