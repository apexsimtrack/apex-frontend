import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminContactList } from "@/lib/api";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
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

const TITLE = `Admin · Contact inbox | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;

function formatContactStatus(status: string): string {
  const u = status.trim().toUpperCase();
  if (u === "NEW") return "New";
  if (u === "IN_PROGRESS") return "In progress";
  if (u === "RESOLVED") return "Resolved";
  if (u === "ARCHIVED") return "Archived";
  if (u === "SPAM") return "Spam";
  return status;
}

function subjectSnippet(s: string | null, max = 48): string {
  if (s == null || !s.trim()) return "—";
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default function AdminContact() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [hasLinked, setHasLinked] = useState<string>("");
  const [hasSubmitter, setHasSubmitter] = useState<string>("");
  const [qInput, setQInput] = useState("");
  const debouncedQ = useDebouncedValue(qInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, statusFilter, hasLinked, hasSubmitter]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
      ...(statusFilter.trim() ? { status: statusFilter.trim() } : {}),
      ...(hasLinked === "true" || hasLinked === "false"
        ? { hasLinkedUser: hasLinked as "true" | "false" }
        : {}),
      ...(hasSubmitter === "true" || hasSubmitter === "false"
        ? { hasSubmitter: hasSubmitter as "true" | "false" }
        : {}),
    }),
    [page, debouncedQ, statusFilter, hasLinked, hasSubmitter],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "contact", listParams],
    queryFn: () => fetchAdminContactList(listParams),
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
    const noun = total === 1 ? "message" : "messages";
    return `Showing ${start}–${end} of ${total} ${noun}`;
  }, [total, currentPage, pageSize]);

  const hasFilters =
    Boolean(qInput.trim()) ||
    Boolean(statusFilter) ||
    Boolean(hasLinked) ||
    Boolean(hasSubmitter);

  return (
    <>
      <PageMeta
        path="/admin/contact"
        title={TITLE}
        description="Contact form submissions."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Contact inbox
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Messages from the public contact form. Linked rows match an existing
            account email; submitter indicates someone was signed in when they
            sent the message.
          </p>
        </div>

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load contact submissions.")}
          </div>
        )}

        {!isError && (
          <div className={ADMIN_TABLE_CARD}>
            <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <Input
                  placeholder="Search name, email, message…"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  className="w-full min-w-[12rem] max-w-xs"
                />
                <select
                  className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={statusFilter}
                  onChange={(e) => {
                    setPage(1);
                    setStatusFilter(e.target.value);
                  }}
                  aria-label="Status"
                >
                  <option value="">All statuses</option>
                  <option value="NEW">New</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="SPAM">Spam</option>
                </select>
                <select
                  className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={hasLinked}
                  onChange={(e) => {
                    setPage(1);
                    setHasLinked(e.target.value);
                  }}
                  aria-label="Linked account"
                >
                  <option value="">Linked account (any)</option>
                  <option value="true">Has linked user</option>
                  <option value="false">No linked user</option>
                </select>
                <select
                  className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={hasSubmitter}
                  onChange={(e) => {
                    setPage(1);
                    setHasSubmitter(e.target.value);
                  }}
                  aria-label="Signed-in submitter"
                >
                  <option value="">Session (any)</option>
                  <option value="true">Had sign-in session</option>
                  <option value="false">Anonymous session</option>
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
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-foreground">
                  No submissions match
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try clearing search or filters, or check back when new
                  messages arrive.
                </p>
                {hasFilters && (
                  <button
                    type="button"
                    className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setQInput("");
                      setStatusFilter("");
                      setHasLinked("");
                      setHasSubmitter("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className={ADMIN_TABLE_SCROLL}>
                <table className={adminTable("min-w-[44rem]")}>
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className={ADMIN_TH}>Received</th>
                      <th className={ADMIN_TH}>From</th>
                      <th className={ADMIN_TH}>Email</th>
                      <th className={ADMIN_TH}>Subject</th>
                      <th className={ADMIN_TH}>Status</th>
                      <th className={ADMIN_TH}>Links</th>
                      <th className="w-24 whitespace-nowrap p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td
                          className={`${ADMIN_TD} whitespace-nowrap tabular-nums text-muted-foreground`}
                        >
                          {new Date(r.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className={`${ADMIN_TD} font-medium`}>{r.name}</td>
                        <td
                          className={`max-w-[12rem] truncate ${ADMIN_TD} text-muted-foreground`}
                        >
                          {r.email}
                        </td>
                        <td
                          className={`max-w-[14rem] truncate ${ADMIN_TD} text-muted-foreground`}
                        >
                          {subjectSnippet(r.subject)}
                        </td>
                        <td className={`${ADMIN_TD} text-muted-foreground`}>
                          {formatContactStatus(r.status)}
                        </td>
                        <td className={ADMIN_TD}>
                          <div className="flex flex-wrap gap-1">
                            {r.hasLinkedUser && (
                              <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-200">
                                Account
                              </span>
                            )}
                            {r.hasSubmitter && (
                              <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-200">
                                Session
                              </span>
                            )}
                            {!r.hasLinkedUser && !r.hasSubmitter && (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={ADMIN_TD_ACTIONS}>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/admin/contact/${r.id}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!isPending && !isError && total > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
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
            <span className="self-center text-xs text-muted-foreground">
              Page {currentPage} / {totalPages}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
