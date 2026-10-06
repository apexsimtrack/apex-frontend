import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAllAdminAuthSessionsForUser,
  fetchAdminAuthSessionUsersList,
  fetchAdminAuthSessionsMetrics,
} from "@/lib/api";
import { apiErrorText } from "@/lib/api/errors";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreHorizontal } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";
import { AdminUserWebSessionsSection } from "./AdminUserWebSessionsSection";
import {
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";

const SEARCH_DEBOUNCE_MS = 200;

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

function formatInt(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/**
 * Web sign-ins (AuthSession) admin surface: KPIs, per-user aggregate table, drill-down modal, bulk revoke.
 * Extracted from the former Devices page sessions tab; API behavior unchanged.
 */
export function AdminWebSignInsPanel() {
  const qc = useQueryClient();

  const { data: metrics, isPending: metricsPending } = useQuery({
    queryKey: ["admin", "metrics", "authSessions"],
    queryFn: fetchAdminAuthSessionsMetrics,
    staleTime: 0,
  });

  const [sessionPage, setSessionPage] = useState(1);
  const [sessionSearchInput, setSessionSearchInput] = useState("");
  const debouncedSessionSearch = useDebouncedValue(
    sessionSearchInput,
    SEARCH_DEBOUNCE_MS,
  );
  const [sessionSuspiciousOnly, setSessionSuspiciousOnly] = useState(false);

  const sessionListParams = useMemo(
    () => ({
      page: sessionPage,
      pageSize: 20,
      ...(debouncedSessionSearch.trim()
        ? { q: debouncedSessionSearch.trim() }
        : {}),
      ...(sessionSuspiciousOnly ? { suspiciousOnly: true as const } : {}),
    }),
    [sessionPage, debouncedSessionSearch, sessionSuspiciousOnly],
  );

  useEffect(() => {
    setSessionPage(1);
  }, [debouncedSessionSearch, sessionSuspiciousOnly]);

  useEffect(() => {
    void qc.invalidateQueries({
      queryKey: ["admin", "metrics", "authSessions"],
    });
  }, [qc]);

  const sessionsQuery = useQuery({
    queryKey: ["admin", "auth-sessions", "users", sessionListParams],
    queryFn: () => fetchAdminAuthSessionUsersList(sessionListParams),
  });

  const [sessionModalUserId, setSessionModalUserId] = useState<string | null>(
    null,
  );

  const revokeAllUserSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      await deleteAllAdminAuthSessionsForUser(userId);
    },
    onSuccess: async (_, userId) => {
      toast.success("All web sessions revoked for this user.");
      setRevokeAllContext(null);
      setRevokeAllConfirm("");
      if (sessionModalUserId === userId) {
        setSessionModalUserId(null);
      }
      await qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
      await qc.invalidateQueries({ queryKey: ["admin", "metrics"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "auth-sessions", "user"],
      });
    },
    onError: (e: unknown) => {
      toast.error(
        apiErrorText(e, "Could not revoke sessions."),
      );
    },
  });

  const [revokeAllContext, setRevokeAllContext] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [revokeAllConfirm, setRevokeAllConfirm] = useState("");

  const sessionUserRows = sessionsQuery.data?.items ?? [];
  const sessionTotal = sessionsQuery.data?.total ?? 0;
  const sessionTotalActiveRows = sessionsQuery.data?.totalActiveRows;
  const sessionTotalPages = sessionsQuery.data?.totalPages ?? 1;

  const sessionRangeLabel = useMemo(() => {
    const pageSize = 20;
    const total = sessionTotal;
    const currentPage = sessionPage;
    if (total === 0) return "No results";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    const noun = total === 1 ? "user" : "users";
    const rowHint =
      typeof sessionTotalActiveRows === "number"
        ? ` · ${sessionTotalActiveRows} active browser session${sessionTotalActiveRows === 1 ? "" : "s"} total`
        : "";
    return `Showing ${start}–${end} of ${total} ${noun} with active sessions${rowHint}`;
  }, [sessionTotal, sessionTotalActiveRows, sessionPage]);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-card/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Web sessions (total)
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {metricsPending ? "—" : formatInt(metrics?.authSessionsTotal ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Web sessions (active)
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {metricsPending ? "—" : formatInt(metrics?.authSessionsActive ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Non-expired, not revoked (usable browser sessions)
          </p>
        </div>
      </div>

      {sessionsQuery.isError && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {apiErrorText(sessionsQuery.error, "Could not load sessions.")}
        </div>
      )}

      {!sessionsQuery.isError && (
        <div className={ADMIN_TABLE_CARD}>
          <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <Input
                placeholder="Search user email or name…"
                value={sessionSearchInput}
                onChange={(e) => setSessionSearchInput(e.target.value)}
                className="w-full min-w-[12rem] max-w-xs"
              />
              <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={sessionSuspiciousOnly}
                  onChange={(e) => setSessionSuspiciousOnly(e.target.checked)}
                  className="rounded border-white/20"
                />
                Suspicious only (risk ≥ 50)
              </label>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground max-lg:w-full lg:text-right">
              {sessionsQuery.isPending ? "Loading…" : sessionRangeLabel}
            </p>
          </div>

          {sessionsQuery.isPending ? (
            <div className="flex justify-center px-4 py-12" aria-busy="true">
              <Loader2
                className="size-6 animate-spin text-muted-foreground"
                aria-hidden
              />
            </div>
          ) : sessionUserRows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                No active web sessions listed
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                This list shows server sessions created when someone signs in
                (non-expired only). Each browser needs a fresh sign-in after
                this feature rolls out so it stores the server session id with
                the JWT; otherwise only JWT auth runs and this list can stay
                empty.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Expired sessions are never shown. Try another search.
              </p>
            </div>
          ) : (
            <div className={ADMIN_TABLE_SCROLL}>
              <table className={adminTable("min-w-[44rem]")}>
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className={ADMIN_TH}>User</th>
                    <th className={ADMIN_TH}>Last active</th>
                    <th className={ADMIN_TH}>Expires (soonest)</th>
                    <th className={`${ADMIN_TH} text-right tabular-nums`}>
                      Devices
                    </th>
                    <th className={`${ADMIN_TH} text-right tabular-nums`}>
                      Active
                    </th>
                    <th className={`${ADMIN_TH} text-right tabular-nums`}>
                      Max risk
                    </th>
                    <th className={`${ADMIN_TH} text-right tabular-nums`}>
                      Flagged
                    </th>
                    <th className="w-12 whitespace-nowrap p-3" />
                  </tr>
                </thead>
                <tbody>
                  {sessionUserRows.map((row) => (
                    <tr key={row.user.id} className="border-b border-white/5">
                      <td className={ADMIN_TD}>
                        <Link
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          to={`/admin/users/${row.user.id}`}
                        >
                          {row.user.displayName}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {row.user.email}
                        </div>
                      </td>
                      <td
                        className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                      >
                        {formatTs(row.lastActiveAt)}
                      </td>
                      <td
                        className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                      >
                        {formatTs(row.soonestExpiresAt)}
                      </td>
                      <td
                        className={`${ADMIN_TD} text-right tabular-nums text-muted-foreground`}
                      >
                        {row.distinctDeviceCount ?? "—"}
                      </td>
                      <td
                        className={`${ADMIN_TD} text-right tabular-nums text-muted-foreground`}
                      >
                        {row.activeSessionCount}
                      </td>
                      <td className={`${ADMIN_TD} text-right tabular-nums`}>
                        <span
                          className={
                            (row.maxRiskScore ?? 0) >= 50
                              ? "font-medium text-amber-400"
                              : "text-muted-foreground"
                          }
                        >
                          {row.maxRiskScore ?? 0}
                        </span>
                      </td>
                      <td
                        className={`${ADMIN_TD} text-right tabular-nums text-muted-foreground`}
                      >
                        {row.suspiciousSessionCount ?? 0}
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
                              onClick={() => {
                                setSessionModalUserId(row.user.id);
                              }}
                            >
                              View sessions
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setRevokeAllContext({
                                  userId: row.user.id,
                                  displayName: row.user.displayName,
                                });
                                setRevokeAllConfirm("");
                              }}
                            >
                              Revoke all sessions
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
      )}

      {!sessionsQuery.isPending &&
        !sessionsQuery.isError &&
        sessionTotal > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sessionPage <= 1}
              onClick={() => setSessionPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sessionPage >= sessionTotalPages}
              onClick={() =>
                setSessionPage((p) => Math.min(sessionTotalPages, p + 1))
              }
            >
              Next
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Page {sessionPage} / {sessionTotalPages}
            </span>
          </div>
        )}

      {sessionModalUserId && (
        <BaseModal
          isOpen={!!sessionModalUserId}
          onClose={() => setSessionModalUserId(null)}
          title="Web sessions"
          size="full"
          mobileVariant="fullscreen"
          hideCloseButton
          headerClassName="sr-only border-0 p-0"
          bodyClassName="p-0"
        >
          <AdminUserWebSessionsSection
            variant="modal"
            userId={sessionModalUserId}
            onCloseModal={() => setSessionModalUserId(null)}
          />
        </BaseModal>
      )}

      {revokeAllContext && (
        <BaseAlertDialog
          isOpen={!!revokeAllContext}
          onClose={() => setRevokeAllContext(null)}
          title="Revoke all web sessions"
          description={
            <>
              Invalidates every usable browser session for{" "}
              <span className="font-medium text-foreground">
                {revokeAllContext.displayName}
              </span>
              . API access stops immediately; session rows are kept for analysis
              unless deleted. Type{" "}
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
                onClick={() => setRevokeAllContext(null)}
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
                onClick={() =>
                  revokeAllUserSessionsMutation.mutate(revokeAllContext.userId)
                }
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
    </>
  );
}
