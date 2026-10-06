import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminCommunityComment,
  deleteAdminSession,
  deleteAdminSessionComment,
  fetchAdminReports,
  patchAdminReportStatus,
  patchAdminSession,
  patchAdminUserStatus,
  softDeleteAdminCommunityDiscussion,
  type AdminReportRow,
  type AdminReportStatus,
} from "@/lib/api";
import { apiErrorText } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Eye, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";

const TITLE = `Admin · Reports | ${COMPANY_NAME}`;

type StatusFilter = AdminReportStatus | "ALL";
type PendingAction =
  | { kind: "dismiss"; row: AdminReportRow }
  | { kind: "suspend"; row: AdminReportRow }
  | { kind: "delete"; row: AdminReportRow }
  | { kind: "caption"; row: AdminReportRow }
  | null;

function formatType(row: AdminReportRow): string {
  switch (row.contentType) {
    case "USER":
      return "User";
    case "DISCUSSION":
      return "Discussion";
    case "DISCUSSION_COMMENT":
      return row.targetIsReply ? "Discussion reply" : "Discussion comment";
    case "SESSION":
      return "Session";
    case "SESSION_COMMENT":
      return row.targetIsReply ? "Session reply" : "Session comment";
    default:
      return row.contentType;
  }
}

function entityHref(row: AdminReportRow): string | null {
  if (!row.available) return null;
  if (row.contentType === "USER") return `/admin/users/${row.targetUser.id}`;
  if (row.contentType === "DISCUSSION" && row.targetContentId) {
    return `/admin/community/${row.targetContentId}`;
  }
  if (row.contentType === "DISCUSSION_COMMENT" && row.parentContentId) {
    return `/admin/community/${row.parentContentId}#comment-${row.targetContentId}`;
  }
  if (row.contentType === "SESSION" && row.targetContentId) {
    return `/admin/sessions/${row.targetContentId}`;
  }
  if (row.contentType === "SESSION_COMMENT" && row.parentContentId) {
    return `/admin/sessions/${row.parentContentId}`;
  }
  return `/admin/users/${row.targetUser.id}`;
}

async function runDeleteContent(row: AdminReportRow): Promise<void> {
  if (row.contentType === "DISCUSSION" && row.targetContentId) {
    await softDeleteAdminCommunityDiscussion(row.targetContentId);
    return;
  }
  if (
    row.contentType === "DISCUSSION_COMMENT" &&
    row.parentContentId &&
    row.targetContentId
  ) {
    await deleteAdminCommunityComment(row.parentContentId, row.targetContentId);
    return;
  }
  if (row.contentType === "SESSION" && row.targetContentId) {
    await deleteAdminSession(row.targetContentId);
    return;
  }
  if (
    row.contentType === "SESSION_COMMENT" &&
    row.parentContentId &&
    row.targetContentId
  ) {
    await deleteAdminSessionComment(
      row.parentContentId,
      row.targetContentId,
    );
    return;
  }
  throw new Error("This report has no deletable content.");
}

export default function AdminReports() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [viewingReport, setViewingReport] = useState<AdminReportRow | null>(
    null,
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const listParams = useMemo(
    () => ({ page, pageSize: 20, status: statusFilter }),
    [page, statusFilter],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "reports", listParams],
    queryFn: () => fetchAdminReports(listParams),
  });

  const rows = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const currentPage = data?.page ?? page;

  const rangeLabel = useMemo(() => {
    if (total === 0) return "Showing 0 of 0 results";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    const noun = total === 1 ? "result" : "results";
    return `Showing ${start}–${end} of ${total} ${noun}`;
  }, [total, currentPage, pageSize]);

  const actionMutation = useMutation({
    mutationFn: async (action: Exclude<PendingAction, null>) => {
      if (action.kind === "dismiss") {
        await patchAdminReportStatus(action.row.id, "DISMISSED");
        return;
      }
      if (action.kind === "suspend") {
        await patchAdminUserStatus(action.row.targetUser.id, {
          suspended: true,
          reason: action.row.details
            ? `${action.row.reason}: ${action.row.details}`
            : action.row.reason,
        });
        await patchAdminReportStatus(action.row.id, "RESOLVED");
        return;
      }
      if (action.kind === "caption") {
        if (!action.row.targetContentId) {
          throw new Error("Missing session id");
        }
        await patchAdminSession(action.row.targetContentId, { caption: null });
        await patchAdminReportStatus(action.row.id, "RESOLVED");
        return;
      }
      await runDeleteContent(action.row);
      await patchAdminReportStatus(action.row.id, "RESOLVED");
    },
    onSuccess: (_data, action) => {
      toast.success(
        action.kind === "dismiss" ? "Report dismissed" : "Report resolved",
      );
      setPendingAction(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    },
    onError: (err) => {
      toast.error(
        apiErrorText(err, "Action failed. Report left pending."),
      );
    },
  });

  const dialogTitle =
    pendingAction?.kind === "dismiss"
      ? "Dismiss this report?"
      : pendingAction?.kind === "suspend"
        ? "Suspend this user?"
        : pendingAction?.kind === "caption"
          ? "Clear the session caption?"
          : "Delete this content?";

  const dialogDescription =
    pendingAction?.kind === "dismiss"
      ? "The report will be marked dismissed. No content or account change is made."
      : pendingAction?.kind === "suspend"
        ? "Uses the existing user-status API. The user cannot sign in until restored. The report is then marked resolved."
        : pendingAction?.kind === "caption"
          ? "Clears the caption via the existing session patch API, then marks the report resolved."
          : "Uses the existing delete/soft-delete API, then marks the report resolved.";

  return (
    <>
      <PageMeta
        path="/admin/reports"
        title={TITLE}
        description="User-submitted content and profile reports."
        noindex
      />
      <div className={ADMIN_PAGE}>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        User-submitted flags. Penalty buttons call existing admin APIs; this
        page only updates report status afterward.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground" htmlFor="report-status">
          Status
        </label>
        <select
          id="report-status"
          className="rounded-md border border-white/10 bg-transparent px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="PENDING">Pending</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
          <option value="ALL">All</option>
        </select>
      </div>

      <div className={ADMIN_TABLE_CARD}>
        <div className={ADMIN_TABLE_SCROLL}>
          <table className={adminTable("min-w-[72rem]")}>
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-muted-foreground">
                <th className={ADMIN_TH}>Date</th>
                <th className={ADMIN_TH}>Reporter</th>
                <th className={ADMIN_TH}>Reported</th>
                <th className={ADMIN_TH}>Type</th>
                <th className={ADMIN_TH}>Preview</th>
                <th className={ADMIN_TH}>Reason</th>
                <th className={ADMIN_TH}>Status</th>
                <th className={ADMIN_TD_ACTIONS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={8} className={`${ADMIN_TD} text-muted-foreground`}>
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    Loading reports…
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={8} className={`${ADMIN_TD} text-red-300`}>
                    {apiErrorText(error, "Failed to load reports.")}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${ADMIN_TD} text-muted-foreground`}>
                    No reports.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const href = entityHref(row);
                  const closed = row.status !== "PENDING";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 hover:bg-white/[0.03]"
                    >
                      <td className={`${ADMIN_TD} whitespace-nowrap text-muted-foreground`}>
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className={ADMIN_TD}>
                        <Link
                          to={`/admin/users/${row.reporter.id}`}
                          className="text-foreground hover:underline"
                        >
                          {row.reporter.displayName}
                        </Link>
                      </td>
                      <td className={ADMIN_TD}>
                        {href ? (
                          <Link to={href} className="text-foreground hover:underline">
                            {row.targetUser.displayName}
                          </Link>
                        ) : (
                          row.targetUser.displayName
                        )}
                      </td>
                      <td className={`${ADMIN_TD} whitespace-nowrap`}>
                        {formatType(row)}
                      </td>
                      <td
                        className={`${ADMIN_TD} max-w-[20rem] whitespace-normal text-muted-foreground`}
                        title={row.preview ?? undefined}
                      >
                        {row.available ? (row.preview ?? "—") : "Unavailable"}
                      </td>
                      <td className={`${ADMIN_TD} max-w-[20rem]`}>
                        <span>{row.reason}</span>
                        {row.details ? (
                          <span className="mt-1 block whitespace-normal text-xs text-muted-foreground">
                            {row.details}
                          </span>
                        ) : null}
                      </td>
                      <td className={`${ADMIN_TD} text-xs uppercase tracking-wide text-muted-foreground`}>
                        {row.status.toLowerCase()}
                      </td>
                      <td className={ADMIN_TD_ACTIONS}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="View report"
                            title="View report"
                            onClick={() => setViewingReport(row)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          {!closed ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label="Report actions"
                                >
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    setPendingAction({ kind: "dismiss", row })
                                  }
                                >
                                  Dismiss report
                                </DropdownMenuItem>
                                {row.available ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setPendingAction({ kind: "suspend", row })
                                    }
                                  >
                                    Suspend user & resolve
                                  </DropdownMenuItem>
                                ) : null}
                                {row.available &&
                                row.contentType !== "USER" ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setPendingAction({ kind: "delete", row })
                                    }
                                  >
                                    Delete content & resolve
                                  </DropdownMenuItem>
                                ) : null}
                                {row.available &&
                                row.contentType === "SESSION" ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setPendingAction({ kind: "caption", row })
                                    }
                                  >
                                    Clear caption & resolve
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-sm text-muted-foreground">
          <span>{rangeLabel}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <BaseModal
        isOpen={viewingReport != null}
        onClose={() => setViewingReport(null)}
        title="Report preview"
        description={
          viewingReport
            ? `${formatType(viewingReport)} reported by ${viewingReport.reporter.displayName}`
            : undefined
        }
        size="lg"
        footer={
          viewingReport ? (
            <>
              {entityHref(viewingReport) ? (
                <Button asChild variant="outline">
                  <Link to={entityHref(viewingReport) as string}>
                    Open reported item
                  </Link>
                </Button>
              ) : null}
              <Button onClick={() => setViewingReport(null)}>Close</Button>
            </>
          ) : null
        }
      >
        {viewingReport ? (
          <div className="space-y-5 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Reported user
                </dt>
                <dd className="mt-1 text-foreground">
                  {viewingReport.targetUser.displayName}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Submitted
                </dt>
                <dd className="mt-1 text-foreground">
                  {new Date(viewingReport.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Reason
                </dt>
                <dd className="mt-1 text-foreground">
                  {viewingReport.reason}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Availability
                </dt>
                <dd className="mt-1 text-foreground">
                  {viewingReport.available ? "Available" : "Unavailable"}
                </dd>
              </div>
            </dl>

            {viewingReport.details ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Reporter details
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-3 text-foreground">
                  {viewingReport.details}
                </p>
              </div>
            ) : null}

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Reported content
              </p>
              <div className="mt-1 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                {viewingReport.targetTitle ? (
                  <p className="font-medium text-foreground">
                    {viewingReport.targetTitle}
                  </p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                  {viewingReport.targetBody ??
                    viewingReport.preview ??
                    "No content preview is available."}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </BaseModal>

      <BaseAlertDialog
        isOpen={pendingAction != null}
        onClose={() => {
          if (!actionMutation.isPending) setPendingAction(null);
        }}
        title={dialogTitle}
        description={dialogDescription}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              disabled={actionMutation.isPending}
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={actionMutation.isPending || !pendingAction}
              onClick={() => {
                if (pendingAction) actionMutation.mutate(pendingAction);
              }}
            >
              {actionMutation.isPending ? "Working…" : "Confirm"}
            </Button>
          </>
        }
      />
      </div>
    </>
  );
}
