import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  apiErrorText,
  ApiError,
  deleteCampaign,
  fetchCampaignDeliveries,
  getAdminCampaign,
  resendFailedCampaignEmails,
  type NotificationChannel,
  type NotificationDeliveryStatus,
} from "@/lib/api";

const STATUS_PILL: Record<NotificationDeliveryStatus, string> = {
  PENDING: "bg-white/5 text-muted-foreground border-white/10",
  SENT: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  FAILED: "bg-red-500/15 text-red-300 border-red-500/40",
  SKIPPED: "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

export default function AdminCampaignDetail() {
  const params = useParams<{ campaignId: string }>();
  const id = params.campaignId ?? "";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["admin", "notifications", "campaigns", "detail", id],
    queryFn: () => getAdminCampaign(id),
    enabled: !!id,
  });

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const debounced = useDebouncedValue(searchInput, 250);
  useEffect(() => setPage(1), [debounced, statusFilter, channelFilter]);

  const deliveriesParams = useMemo(
    () => ({
      page,
      pageSize: 25,
      ...(statusFilter
        ? { status: statusFilter as NotificationDeliveryStatus }
        : {}),
      ...(channelFilter
        ? { channel: channelFilter as NotificationChannel }
        : {}),
      ...(debounced.trim() ? { q: debounced.trim() } : {}),
    }),
    [page, statusFilter, channelFilter, debounced],
  );

  const deliveriesQuery = useQuery({
    queryKey: [
      "admin",
      "notifications",
      "campaigns",
      id,
      "deliveries",
      deliveriesParams,
    ],
    queryFn: () => fetchCampaignDeliveries(id, deliveriesParams),
    enabled: !!id,
  });

  const resendMut = useMutation({
    mutationFn: () => resendFailedCampaignEmails(id),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["admin", "notifications", "campaigns"],
      });
      await qc.invalidateQueries({
        queryKey: ["admin", "notifications", "campaigns", "detail", id],
      });
      await qc.invalidateQueries({
        queryKey: ["admin", "notifications", "campaigns", id, "deliveries"],
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCampaign(id),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["admin", "notifications", "campaigns"],
      });
      await qc.invalidateQueries({
        queryKey: ["admin", "notifications", "overview"],
      });
      navigate("/admin/notifications?tab=campaigns");
    },
  });

  function handleDelete() {
    if (deleteMut.isPending) return;
    setDeleteOpen(true);
  }

  const rows = deliveriesQuery.data?.items ?? [];
  const total = deliveriesQuery.data?.total ?? 0;
  const currentPage = deliveriesQuery.data?.page ?? page;
  const totalPages = deliveriesQuery.data?.totalPages ?? 1;

  return (
    <>
      <PageMeta
        path={`/admin/notifications/campaigns/${id}`}
        title={`Admin · Campaign | ${COMPANY_NAME}`}
        description="Campaign delivery review."
        noindex
      />
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <Link
            to="/admin/notifications?tab=campaigns"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to campaigns
          </Link>
        </div>

        {detailQuery.isPending ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : detailQuery.isError || !detailQuery.data ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(detailQuery.error, "Could not load campaign.")}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {detailQuery.data.title}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detailQuery.data.audienceSummary} · Created{" "}
                  {new Date(detailQuery.data.createdAt).toLocaleString()} ·{" "}
                  {detailQuery.data.channels.join(", ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {detailQuery.data.emailFailedCount > 0 && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={resendMut.isPending || deleteMut.isPending}
                    onClick={() => resendMut.mutate()}
                  >
                    {resendMut.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />{" "}
                        Retrying…
                      </>
                    ) : (
                      `Retry ${detailQuery.data.emailFailedCount} failed email${
                        detailQuery.data.emailFailedCount === 1 ? "" : "s"
                      }`
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteMut.isPending || resendMut.isPending}
                  onClick={handleDelete}
                >
                  {deleteMut.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Deleting…
                    </>
                  ) : (
                    "Delete"
                  )}
                </Button>
              </div>
            </div>

            {deleteMut.isError && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {apiErrorText(deleteMut.error, "Could not delete campaign.")}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatTile
                label="Recipients"
                value={detailQuery.data.recipientCount}
              />
              <StatTile
                label="In-app sent"
                value={detailQuery.data.inAppSentCount}
              />
              <StatTile
                label="Email sent"
                value={detailQuery.data.emailSentCount}
              />
              <StatTile
                label="Email failed"
                value={detailQuery.data.emailFailedCount}
              />
              <StatTile
                label="Email skipped"
                value={detailQuery.data.emailSkippedCount}
              />
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-card/40 p-4">
              <h2 className="text-sm font-semibold text-foreground">Body</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {detailQuery.data.body}
              </p>
              {detailQuery.data.linkUrl && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Link:{" "}
                  <a
                    href={detailQuery.data.linkUrl}
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detailQuery.data.linkUrl}
                  </a>
                </p>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-white/10">
              <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <Input
                    placeholder="Search recipient email or name…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full min-w-[14rem] max-w-sm"
                  />
                  <select
                    className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="SENT">Sent</option>
                    <option value="FAILED">Failed</option>
                    <option value="SKIPPED">Skipped</option>
                    <option value="PENDING">Pending</option>
                  </select>
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
                  {deliveriesQuery.isPending
                    ? "Loading…"
                    : `${total} delivery rows`}
                </p>
              </div>

              {deliveriesQuery.isPending ? (
                <div className="flex justify-center px-4 py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  No deliveries match these filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="p-3">Recipient</th>
                        <th className="p-3">Channel</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Attempts</th>
                        <th className="p-3">Last updated</th>
                        <th className="p-3">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-white/5 align-top"
                        >
                          <td className="p-3">
                            <div className="font-medium text-foreground">
                              {r.userDisplayName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.userEmail}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {r.channel === "IN_APP" ? "In-app" : "Email"}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${STATUS_PILL[r.status]}`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {r.attempts}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {new Date(r.updatedAt).toLocaleString()}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {r.errorMessage ? (
                              <span
                                title={r.errorMessage}
                                className="line-clamp-2"
                              >
                                {r.errorMessage}
                              </span>
                            ) : r.providerMessageId ? (
                              <span className="font-mono">
                                {r.providerMessageId}
                              </span>
                            ) : (
                              "—"
                            )}
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
          </>
        )}
      </div>
      <BaseAlertDialog
        isOpen={deleteOpen}
        onClose={() => {
          if (deleteMut.isPending) return;
          deleteMut.reset();
          setDeleteOpen(false);
        }}
        title="Delete campaign"
        description="Delete this campaign? Delivery records will be removed, but already-sent in-app notifications remain in user inboxes."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMut.isPending}
              onClick={() => {
                deleteMut.reset();
                setDeleteOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Deleting...
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

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/50 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
