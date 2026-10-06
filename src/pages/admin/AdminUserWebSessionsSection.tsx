import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  postRevokeAdminAuthSession,
  deleteAllAdminAuthSessionsForUser,
  fetchAdminAuthSessionsForUser,
  postAdminAuthSessionsBulkDelete,
  postAdminAuthSessionsRecomputeRisk,
  type AdminAuthSessionDetailRow,
} from "@/lib/api";
import { apiErrorText } from "@/lib/api/errors";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 20;

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function deviceLabel(s: AdminAuthSessionDetailRow): string {
  if (s.clientDeviceId) {
    return s.clientDeviceId.length > 16
      ? `${s.clientDeviceId.slice(0, 12)}…`
      : s.clientDeviceId;
  }
  return s.userAgentSummary ?? "—";
}

export type AdminUserWebSessionsSectionProps = {
  variant: "modal" | "page";
  userId: string;
  /** Modal only: closes the shell */
  onCloseModal?: () => void;
};

export function AdminUserWebSessionsSection({
  variant,
  userId,
  onCloseModal,
}: AdminUserWebSessionsSectionProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [sessionScope, setSessionScope] = useState<"active" | "all">("active");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [revokeSessionOpen, setRevokeSessionOpen] = useState(false);
  const [revokeSessionTarget, setRevokeSessionTarget] =
    useState<AdminAuthSessionDetailRow | null>(null);
  const [revokeSessionConfirm, setRevokeSessionConfirm] = useState("");

  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeAllConfirm, setRevokeAllConfirm] = useState("");

  const [deleteBulkOpen, setDeleteBulkOpen] = useState(false);
  const [deleteBulkConfirm, setDeleteBulkConfirm] = useState("");

  useEffect(() => {
    setPage(1);
  }, [userId, sessionScope]);

  useEffect(() => {
    setSelectedIds([]);
  }, [userId, page, sessionScope]);

  const detailQuery = useQuery({
    queryKey: [
      "admin",
      "auth-sessions",
      "user",
      userId,
      page,
      PAGE_SIZE,
      sessionScope,
    ],
    queryFn: () =>
      fetchAdminAuthSessionsForUser(userId, {
        page,
        pageSize: PAGE_SIZE,
        scope: sessionScope,
      }),
    enabled: Boolean(userId),
  });

  const items = useMemo(
    () => detailQuery.data?.items ?? [],
    [detailQuery.data?.items],
  );
  const detailUser = detailQuery.data?.user;
  const totalPages = detailQuery.data?.totalPages ?? 1;

  const rowIds = useMemo(() => items.map((s) => s.id), [items]);

  const sessionRowActionMutation = useMutation({
    mutationFn: async (target: AdminAuthSessionDetailRow) => {
      if (target.expired) {
        await postAdminAuthSessionsBulkDelete(userId, [target.id]);
        return { kind: "deleted" as const };
      }
      await postRevokeAdminAuthSession(target.id);
      return { kind: "revoked" as const };
    },
    onSuccess: async (result, target) => {
      if (result.kind === "deleted") {
        toast.success("Session record removed from the database.");
      } else {
        toast.success(
          "Session revoked. The record stays in the database for analysis.",
        );
      }
      setRevokeSessionOpen(false);
      setRevokeSessionConfirm("");
      setSelectedIds((prev) => prev.filter((x) => x !== target.id));
      await qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "auth-sessions", "user", userId],
      });
    },
    onError: (e: unknown) => {
      toast.error(
        apiErrorText(e, "Could not complete action."),
      );
    },
  });

  const revokeAllUserSessionsMutation = useMutation({
    mutationFn: async (uid: string) => {
      await deleteAllAdminAuthSessionsForUser(uid);
    },
    onSuccess: async () => {
      toast.success("All web sessions revoked for this user.");
      setRevokeAllOpen(false);
      setRevokeAllConfirm("");
      onCloseModal?.();
      await qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "auth-sessions", "user", userId],
      });
    },
    onError: (e: unknown) => {
      toast.error(
        apiErrorText(e, "Could not revoke sessions."),
      );
    },
  });

  const bulkDeleteSessionsMutation = useMutation({
    mutationFn: (sessionIds: string[]) =>
      postAdminAuthSessionsBulkDelete(userId, sessionIds),
    onSuccess: async (res) => {
      toast.success(
        `Deleted ${res.deleted} session record${res.deleted === 1 ? "" : "s"} from the database.`,
      );
      setDeleteBulkOpen(false);
      setDeleteBulkConfirm("");
      setSelectedIds([]);
      await qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "auth-sessions", "user", userId],
      });
    },
    onError: (e: unknown) => {
      toast.error(
        apiErrorText(e, "Could not delete sessions."),
      );
    },
  });

  const recomputeRiskMutation = useMutation({
    mutationFn: async () => postAdminAuthSessionsRecomputeRisk(userId),
    onSuccess: async (res) => {
      toast.success(
        `Risk recomputed (${res.updated} session${res.updated === 1 ? "" : "s"} updated).`,
      );
      await qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "auth-sessions", "user", userId],
      });
    },
    onError: (e: unknown) => {
      toast.error(
        apiErrorText(e, "Could not recompute risk."),
      );
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === rowIds.length && rowIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds([...rowIds]);
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const openRevokeSession = (s: AdminAuthSessionDetailRow) => {
    setRevokeSessionTarget(s);
    setRevokeSessionConfirm("");
    setRevokeSessionOpen(true);
  };

  const scopeToggle = (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        View
      </span>
      <div className="inline-flex rounded-lg border border-white/10 p-0.5">
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            sessionScope === "active"
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSessionScope("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            sessionScope === "all"
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSessionScope("all")}
        >
          All sessions
        </button>
      </div>
    </div>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={rowIds.length > 0 && selectedIds.length === rowIds.length}
          onChange={toggleSelectAll}
          className="rounded border-white/20"
        />
        Select all
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={
          selectedIds.length === 0 || bulkDeleteSessionsMutation.isPending
        }
        onClick={() => {
          setDeleteBulkConfirm("");
          setDeleteBulkOpen(true);
        }}
      >
        Delete selected ({selectedIds.length})
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={items.length === 0 || revokeAllUserSessionsMutation.isPending}
        onClick={() => {
          if (detailUser) {
            setRevokeAllConfirm("");
            setRevokeAllOpen(true);
          }
        }}
      >
        Revoke all for user
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={sessionScope === "all" || recomputeRiskMutation.isPending}
        onClick={() => recomputeRiskMutation.mutate()}
        title={
          sessionScope === "all"
            ? "Switch to Active view to re-run risk on non-expired sessions."
            : undefined
        }
      >
        {recomputeRiskMutation.isPending
          ? "Analyzing…"
          : "Re-run risk analysis"}
      </Button>
    </div>
  );

  const pagination =
    totalPages > 1 ? (
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || detailQuery.isFetching}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages || detailQuery.isFetching}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </Button>
        <span className="self-center text-xs text-muted-foreground">
          Page {page} / {totalPages}
          {typeof detailQuery.data?.total === "number" ? (
            <span className="ml-2 tabular-nums">
              ({detailQuery.data.total} session
              {detailQuery.data.total === 1 ? "" : "s"})
            </span>
          ) : null}
        </span>
      </div>
    ) : null;

  const sessionTable = (
    <div className="hidden overflow-x-auto xl:block">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-muted-foreground">
            <th className="w-10 p-2" />
            <th className="p-2">Status</th>
            <th className="p-2">Last active</th>
            <th className="p-2 text-right">Risk</th>
            <th className="min-w-[8rem] p-2">Location</th>
            <th className="min-w-[6rem] p-2">Flags</th>
            <th className="min-w-[6rem] p-2">Device / UA</th>
            <th className="w-12 p-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className="border-b border-white/5">
              <td className="p-2 align-middle">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => toggleRow(s.id)}
                  className="rounded border-white/20"
                />
              </td>
              <td className="p-2">
                {s.expired ? (
                  <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                    Expired
                  </span>
                ) : s.revoked ? (
                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-100/90">
                    Revoked
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-100/90">
                    Active
                  </span>
                )}
              </td>
              <td className="p-2 tabular-nums text-muted-foreground">
                {formatTs(s.lastSeenAt)}
              </td>
              <td className="p-2 text-right tabular-nums">
                <span
                  className={
                    s.riskScore >= 50
                      ? "font-medium text-amber-400"
                      : "text-muted-foreground"
                  }
                >
                  {s.riskScore}
                </span>
              </td>
              <td
                className="p-2 text-xs text-muted-foreground"
                title={s.geoLabel ?? ""}
              >
                {s.geoLabel ?? "—"}
              </td>
              <td className="p-2 text-xs text-muted-foreground">
                {s.riskFlags?.length ? s.riskFlags.join(", ") : "—"}
              </td>
              <td
                className="max-w-[14rem] truncate p-2 text-xs text-muted-foreground"
                title={
                  [s.clientDeviceId, s.userAgentSummary]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
              >
                {deviceLabel(s)}
              </td>
              <td className="p-2 text-right">
                {s.expired ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={sessionRowActionMutation.isPending}
                    onClick={() => openRevokeSession(s)}
                  >
                    Delete
                  </Button>
                ) : s.revoked ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={sessionRowActionMutation.isPending}
                    onClick={() => openRevokeSession(s)}
                  >
                    Revoke
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const sessionCards = (
    <div className="space-y-3 xl:hidden">
      {items.map((s) => (
        <div
          key={s.id}
          className="rounded-xl border border-white/10 bg-card/40 p-4 text-sm shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={() => toggleRow(s.id)}
                className="rounded border-white/20"
              />
              <span className="text-xs uppercase tracking-wide text-white/45">
                Include
              </span>
            </label>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {s.expired ? (
                <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                  Expired
                </span>
              ) : s.revoked ? (
                <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-100/90">
                  Revoked
                </span>
              ) : (
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-100/90">
                  Active
                </span>
              )}
              {s.expired ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={sessionRowActionMutation.isPending}
                  onClick={() => openRevokeSession(s)}
                >
                  Delete
                </Button>
              ) : s.revoked ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={sessionRowActionMutation.isPending}
                  onClick={() => openRevokeSession(s)}
                >
                  Revoke
                </Button>
              )}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-white/45">Last active</dt>
              <dd className="mt-0.5 tabular-nums text-muted-foreground">
                {formatTs(s.lastSeenAt)}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Risk</dt>
              <dd
                className={
                  s.riskScore >= 50
                    ? "mt-0.5 font-medium tabular-nums text-amber-400"
                    : "mt-0.5 tabular-nums text-muted-foreground"
                }
              >
                {s.riskScore}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-white/45">Location</dt>
              <dd className="mt-0.5 text-muted-foreground">
                {s.geoLabel ?? "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-white/45">Flags</dt>
              <dd className="mt-0.5 text-muted-foreground">
                {s.riskFlags?.length ? s.riskFlags.join(", ") : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-white/45">Device / UA</dt>
              <dd className="mt-0.5 break-all text-muted-foreground">
                {deviceLabel(s)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );

  const body = detailQuery.isPending ? (
    <div className="flex justify-center py-12">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        aria-hidden
      />
    </div>
  ) : detailQuery.isError ? (
    <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {apiErrorText(detailQuery.error, "Could not load sessions.")}
    </div>
  ) : (
    <>
      {scopeToggle}
      {toolbar}
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {sessionScope === "active"
            ? "No active sessions for this user."
            : "No session records found for this user."}
        </p>
      ) : (
        <>
          {sessionTable}
          {sessionCards}
        </>
      )}
      {pagination}
    </>
  );

  const modalHeader =
    variant === "modal" ? (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Web sessions — {detailUser?.displayName ?? "…"}
          </h2>
          {detailUser && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {detailUser.email}
              </p>
              <Link
                className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
                to={`/admin/users/${detailUser.id}`}
              >
                Open user in admin
              </Link>
            </>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCloseModal?.()}
        >
          Close
        </Button>
      </div>
    ) : null;

  const pageIntro =
    variant === "page" ? (
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Web sign-ins
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Browser auth session rows for this account (active and historical).
            Revoke ends sign-in for that session but keeps the row; delete
            permanently removes selected rows from the database. Actions are
            audited.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link to="/admin/email-auth?tab=email">Email &amp; auth ops</Link>
        </Button>
      </div>
    ) : null;

  const inner =
    variant === "modal" ? (
      <div className="flex flex-col gap-4">
        {modalHeader}
        {body}
      </div>
    ) : (
      <>
        {pageIntro}
        {body}
      </>
    );

  return (
    <>
      {variant === "page" ? (
        <div className="mb-8 rounded-xl border border-white/10 p-4">
          {inner}
        </div>
      ) : (
        inner
      )}

      {revokeAllOpen && detailUser && (
        <BaseAlertDialog
          isOpen={revokeAllOpen}
          onClose={() => setRevokeAllOpen(false)}
          title="Revoke all web sessions"
          description={
            <>
              Invalidates every usable browser session for{" "}
              <span className="font-medium text-foreground">
                {detailUser.displayName}
              </span>
              . API access stops immediately because sessions are revoked
              server-side. Session rows are kept for analysis unless you delete
              them. Type{" "}
              <span className="font-mono text-foreground">revoke all</span> to
              confirm.
            </>
          }
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRevokeAllOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  revokeAllConfirm !== "revoke all" ||
                  revokeAllUserSessionsMutation.isPending
                }
                onClick={() => revokeAllUserSessionsMutation.mutate(userId)}
              >
                {revokeAllUserSessionsMutation.isPending
                  ? "Revoking…"
                  : "Revoke all"}
              </Button>
            </>
          }
        >
          <Input
            value={revokeAllConfirm}
            onChange={(e) => setRevokeAllConfirm(e.target.value)}
            placeholder="revoke all"
            autoComplete="off"
          />
        </BaseAlertDialog>
      )}

      {deleteBulkOpen && (
        <BaseAlertDialog
          isOpen={deleteBulkOpen}
          onClose={() => setDeleteBulkOpen(false)}
          title="Delete selected sessions"
          description={
            <>
              Permanently remove {selectedIds.length} session record
              {selectedIds.length === 1 ? "" : "s"} from the database (including
              expired history). Type{" "}
              <span className="font-mono text-foreground">delete</span> to
              confirm.
            </>
          }
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteBulkOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  deleteBulkConfirm !== "delete" ||
                  selectedIds.length === 0 ||
                  bulkDeleteSessionsMutation.isPending
                }
                onClick={() => bulkDeleteSessionsMutation.mutate(selectedIds)}
              >
                {bulkDeleteSessionsMutation.isPending
                  ? "Deleting…"
                  : "Delete permanently"}
              </Button>
            </>
          }
        >
          <Input
            value={deleteBulkConfirm}
            onChange={(e) => setDeleteBulkConfirm(e.target.value)}
            placeholder="delete"
            autoComplete="off"
          />
        </BaseAlertDialog>
      )}

      {revokeSessionOpen && revokeSessionTarget && (
        <BaseAlertDialog
          isOpen={revokeSessionOpen}
          onClose={() => setRevokeSessionOpen(false)}
          title={
            revokeSessionTarget.expired
              ? "Delete session record"
              : "Revoke web session"
          }
          description={
            revokeSessionTarget.expired ? (
              <>
                Remove this expired session row from the database. Type{" "}
                <span className="font-mono text-foreground">delete</span> to
                confirm.
              </>
            ) : (
              <>
                Sign-in on that browser stops immediately; the session row is
                retained for analysis. Type{" "}
                <span className="font-mono text-foreground">revoke</span> to
                confirm.
              </>
            )
          }
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRevokeSessionOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  (revokeSessionTarget.expired
                    ? revokeSessionConfirm !== "delete"
                    : revokeSessionConfirm !== "revoke") ||
                  sessionRowActionMutation.isPending
                }
                onClick={() =>
                  revokeSessionTarget &&
                  sessionRowActionMutation.mutate(revokeSessionTarget)
                }
              >
                {sessionRowActionMutation.isPending
                  ? revokeSessionTarget.expired
                    ? "Deleting…"
                    : "Revoking…"
                  : revokeSessionTarget.expired
                    ? "Delete"
                    : "Revoke"}
              </Button>
            </>
          }
        >
          <Input
            value={revokeSessionConfirm}
            onChange={(e) => setRevokeSessionConfirm(e.target.value)}
            placeholder={revokeSessionTarget.expired ? "delete" : "revoke"}
            autoComplete="off"
          />
        </BaseAlertDialog>
      )}
    </>
  );
}
