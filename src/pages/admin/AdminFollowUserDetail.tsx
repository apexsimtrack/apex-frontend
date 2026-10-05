import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminUserSocialGraph,
  fetchAdminUserFollowList,
  removeAdminFollow,
  removeAdminFollowRequest,
  type AdminFollowUserSide,
  type AdminUserFollowListKind,
  type AdminUserFollowListRow,
  type AdminUserSocialGraph,
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
import { ArrowLeft, Loader2, MoreHorizontal } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEARCH_DEBOUNCE_MS = 200;
const LIST_PAGE_SIZE = 10;
const REASON_MAX = 500;

type RemoveTarget =
  | {
      kind: "follow";
      id: string;
      counterpart: AdminFollowUserSide;
      user: { id: string; displayName: string };
    }
  | {
      kind: "request";
      id: string;
      counterpart: AdminFollowUserSide;
      user: { id: string; displayName: string };
    };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <p className="text-[11px] uppercase tracking-widest text-white/50">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function PrivacyPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs",
        active
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-white/[0.03] text-muted-foreground",
      )}
    >
      {label}: {active ? "On" : "Off"}
    </span>
  );
}

function StatusBadge({ user }: { user: AdminUserSocialGraph["user"] }) {
  if (user.isDeleted) {
    return (
      <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
        Deleted
      </span>
    );
  }
  if (user.suspendedAt) {
    return (
      <span className="inline-flex rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs text-red-200">
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
      Active
    </span>
  );
}

function ActivitySparkline({
  daily,
}: {
  daily: AdminUserSocialGraph["daily"];
}) {
  if (daily.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No data for the last 30 days.
      </p>
    );
  }
  const max = Math.max(
    1,
    ...daily.map((d) => Math.max(d.followers, d.following)),
  );
  const barWidth = 12;
  const gap = 4;
  const height = 90;
  const width = daily.length * (barWidth + gap);
  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        width={width}
        height={height + 20}
        role="img"
        aria-label="30-day follow activity"
        className="text-foreground"
      >
        {daily.map((d, idx) => {
          const inH = Math.round((d.followers / max) * height);
          const outH = Math.round((d.following / max) * height);
          const x = idx * (barWidth + gap);
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={height - inH}
                width={barWidth / 2 - 1}
                height={inH}
                fill="currentColor"
                opacity={0.85}
              >
                <title>{`${fmtDate(d.day)}: +${d.followers} followers`}</title>
              </rect>
              <rect
                x={x + barWidth / 2 + 1}
                y={height - outH}
                width={barWidth / 2 - 1}
                height={outH}
                fill="currentColor"
                opacity={0.45}
              >
                <title>{`${fmtDate(d.day)}: +${d.following} following`}</title>
              </rect>
            </g>
          );
        })}
        <line
          x1={0}
          x2={width}
          y1={height}
          y2={height}
          stroke="currentColor"
          opacity={0.15}
        />
      </svg>
      <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-current opacity-85" />
          New followers
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-current opacity-45" />
          New following
        </span>
      </div>
    </div>
  );
}

const LIST_LABELS: Record<
  AdminUserFollowListKind,
  { title: string; empty: string }
> = {
  followers: { title: "Followers", empty: "No followers." },
  following: { title: "Following", empty: "Not following anyone." },
  "requests-in": {
    title: "Pending requests (received)",
    empty: "No incoming follow requests.",
  },
  "requests-out": {
    title: "Pending requests (sent)",
    empty: "No outbound follow requests pending.",
  },
};

function FollowListCard({
  userId,
  userDisplayName,
  kind,
  onRemove,
}: {
  userId: string;
  userDisplayName: string;
  kind: AdminUserFollowListKind;
  onRemove: (t: RemoveTarget) => void;
}) {
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const debouncedQ = useDebouncedValue(qInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const params = useMemo(
    () => ({
      page,
      pageSize: LIST_PAGE_SIZE,
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
    }),
    [page, debouncedQ],
  );

  const { data, isPending } = useQuery({
    queryKey: ["admin", "follows", "user", userId, kind, params],
    queryFn: () => fetchAdminUserFollowList(userId, kind, params),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {LIST_LABELS[kind].title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({total})
          </span>
        </h2>
      </div>
      <Input
        placeholder="Search by name or email…"
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        aria-label={`Search ${LIST_LABELS[kind].title.toLowerCase()}`}
        autoComplete="off"
      />
      {isPending ? (
        <div className="flex justify-center py-6" aria-busy="true">
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden
          />
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {debouncedQ.trim() ? "No matches." : LIST_LABELS[kind].empty}
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {items.map((row) => (
            <FollowListItem
              key={row.id}
              row={row}
              kind={kind}
              user={{ id: userId, displayName: userDisplayName }}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
      {!isPending && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2 text-xs">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function FollowListItem({
  row,
  kind,
  user,
  onRemove,
}: {
  row: AdminUserFollowListRow;
  kind: AdminUserFollowListKind;
  user: { id: string; displayName: string };
  onRemove: (t: RemoveTarget) => void;
}) {
  const isRequest = kind === "requests-in" || kind === "requests-out";
  return (
    <li>
      <div className="flex items-center justify-between gap-2 rounded-md p-2 transition-colors hover:bg-white/5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={`/admin/users/${encodeURIComponent(row.counterpart.id)}`}
            className={cn(
              "min-w-0 truncate text-primary underline-offset-2 hover:underline",
              (row.counterpart.isDeleted || row.counterpart.isSuspended) &&
                "opacity-70",
            )}
          >
            {row.counterpart.displayName}
          </Link>
          {row.counterpart.isDeleted && (
            <span className="shrink-0 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Deleted
            </span>
          )}
          {row.counterpart.isSuspended && !row.counterpart.isDeleted && (
            <span className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
              Suspended
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {fmtDate(row.createdAt)}
          </span>
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
                  to={`/admin/users/${encodeURIComponent(row.counterpart.id)}`}
                >
                  Open profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to={`/admin/follows/users/${encodeURIComponent(row.counterpart.id)}`}
                >
                  View their social graph
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  onRemove({
                    kind: isRequest ? "request" : "follow",
                    id: row.id,
                    counterpart: row.counterpart,
                    user,
                  })
                }
                className="text-destructive"
              >
                {isRequest ? "Force decline" : "Remove follow"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

function AuditCard({ rows }: { rows: AdminUserSocialGraph["audit"] }) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Recent admin actions
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No admin actions recorded for this user.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => {
            const reason =
              row.metadata && typeof row.metadata.reason === "string"
                ? row.metadata.reason
                : null;
            return (
              <li
                key={row.id}
                className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {row.action === "FOLLOW_REMOVED"
                      ? "Follow removed"
                      : "Follow request declined"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDateTime(row.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Actor:{" "}
                  <Link
                    to={`/admin/users/${encodeURIComponent(row.actor.id)}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {row.actor.displayName}
                  </Link>
                  {" · "}Recipient:{" "}
                  <Link
                    to={`/admin/users/${encodeURIComponent(row.targetUser.id)}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {row.targetUser.displayName}
                  </Link>
                  {row.metadata?.followerDisplayName && (
                    <>
                      {" · "}Follower:{" "}
                      <span className="text-foreground">
                        {row.metadata.followerDisplayName}
                      </span>
                    </>
                  )}
                </p>
                {reason && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    Reason: <span className="text-foreground">{reason}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AdminFollowUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const id = userId?.trim() ?? "";
  const qc = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "follows", "user", id, "summary"],
    queryFn: () => fetchAdminUserSocialGraph(id),
    enabled: Boolean(id),
  });

  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [reason, setReason] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);

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

  if (!id) {
    return <p className="p-6 text-muted-foreground">Invalid user id</p>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageMeta
        path={`/admin/follows/users/${id}`}
        title={`Admin · Social graph | ${COMPANY_NAME}`}
        description="Per-user follow graph view in the admin console."
        noindex
      />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          to="/admin/follows"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to follow graph
        </Link>
        <Link
          to={`/admin/users/${encodeURIComponent(id)}`}
          className="ml-auto text-sm text-primary underline-offset-2 hover:underline"
        >
          Open user admin →
        </Link>
      </div>

      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-destructive">
          {apiErrorText(error, "Failed to load.")}
        </p>
      )}

      {data && (
        <>
          <div className="mb-6 rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-start gap-4">
              {data.user.avatarUrl ? (
                <img
                  src={data.user.avatarUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-lg font-semibold text-foreground/70">
                  {data.user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {data.user.displayName}
                  </h1>
                  <StatusBadge user={data.user} />
                  {data.user.role === "ADMIN" && (
                    <span className="inline-flex rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-200">
                      Admin
                    </span>
                  )}
                  {data.user.isSuspicious && (
                    <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                      Suspicious
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.user.email} · Joined {fmtDate(data.user.createdAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PrivacyPill
                    active={data.user.privateProfile}
                    label="Private profile"
                  />
                  <PrivacyPill
                    active={data.user.manualFollowApproval}
                    label="Manual approval"
                  />
                  <span className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-muted-foreground">
                    Visibility: {data.user.sessionVisibility}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Followers" value={data.stats.followersCount} />
            <StatTile label="Following" value={data.stats.followingCount} />
            <StatTile label="Pending in" value={data.stats.pendingIn} />
            <StatTile label="Pending out" value={data.stats.pendingOut} />
            <StatTile
              label="Reciprocity"
              value={`${data.stats.reciprocityPercent}%`}
            />
            <StatTile
              label="New followers (7d)"
              value={data.stats.newFollowersLast7d}
            />
            <StatTile
              label="New following (7d)"
              value={data.stats.newFollowingLast7d}
            />
            <StatTile
              label="New follows (24h)"
              value={
                data.stats.newFollowersLast24h + data.stats.newFollowingLast24h
              }
            />
          </div>

          <div className="mb-6 rounded-xl border border-white/10 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              30-day activity
            </h2>
            <ActivitySparkline daily={data.daily} />
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <FollowListCard
              userId={id}
              userDisplayName={data.user.displayName}
              kind="followers"
              onRemove={setRemoveTarget}
            />
            <FollowListCard
              userId={id}
              userDisplayName={data.user.displayName}
              kind="following"
              onRemove={setRemoveTarget}
            />
            <FollowListCard
              userId={id}
              userDisplayName={data.user.displayName}
              kind="requests-in"
              onRemove={setRemoveTarget}
            />
            <FollowListCard
              userId={id}
              userDisplayName={data.user.displayName}
              kind="requests-out"
              onRemove={setRemoveTarget}
            />
          </div>

          <AuditCard rows={data.audit} />
        </>
      )}

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
              Between{" "}
              <span className="font-medium text-foreground">
                {removeTarget.user.displayName}
              </span>{" "}
              and{" "}
              <span className="font-medium text-foreground">
                {removeTarget.counterpart.displayName}
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
              placeholder="e.g. Resolved support ticket #1234"
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
  );
}
