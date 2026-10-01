import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import {
  apiErrorText,
  ApiError,
  archiveBroadcast,
  deleteBroadcast,
  getAdminBroadcast,
  pauseBroadcast,
  publishBroadcast,
  unarchiveBroadcast,
} from "@/lib/api";
import { BroadcastComposeModal } from "@/components/admin/BroadcastComposeModal";

const SEVERITY_DOT: Record<string, string> = {
  INFO: "bg-sky-400",
  SUCCESS: "bg-emerald-400",
  WARNING: "bg-amber-400",
  CRITICAL: "bg-red-400",
  MAINTENANCE: "bg-violet-400",
};

const STATUS_PILL: Record<string, string> = {
  DRAFT: "bg-white/5 text-muted-foreground border-white/10",
  SCHEDULED: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  PAUSED: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  ARCHIVED: "bg-white/5 text-muted-foreground border-white/10",
};

interface BusyButtonProps {
  children: React.ReactNode;
  busyLabel: string;
  isBusy: boolean;
  disabled?: boolean;
  variant?: "default" | "outline" | "destructive";
  onClick: () => void;
}

function BusyButton({
  children,
  busyLabel,
  isBusy,
  disabled,
  variant = "outline",
  onClick,
}: BusyButtonProps) {
  return (
    <Button variant={variant} disabled={isBusy || disabled} onClick={onClick}>
      {isBusy ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" /> {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export default function AdminBroadcastDetail() {
  const params = useParams<{ broadcastId: string }>();
  const id = params.broadcastId ?? "";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailKey = ["admin", "notifications", "broadcasts", "detail", id];
  const listKey = ["admin", "notifications", "broadcasts"];
  const overviewKey = ["admin", "notifications", "overview"];

  const { data, isPending, isError, error } = useQuery({
    queryKey: detailKey,
    queryFn: () => getAdminBroadcast(id),
    enabled: !!id,
  });

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: detailKey }),
      qc.invalidateQueries({ queryKey: listKey }),
      qc.invalidateQueries({ queryKey: overviewKey }),
    ]);
  }

  const publishMut = useMutation({
    mutationFn: () => publishBroadcast(id),
    onSuccess: invalidateAll,
  });
  const pauseMut = useMutation({
    mutationFn: () => pauseBroadcast(id),
    onSuccess: invalidateAll,
  });
  const archiveMut = useMutation({
    mutationFn: () => archiveBroadcast(id),
    onSuccess: invalidateAll,
  });
  const unarchiveMut = useMutation({
    mutationFn: () => unarchiveBroadcast(id),
    onSuccess: invalidateAll,
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteBroadcast(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: listKey });
      await qc.invalidateQueries({ queryKey: overviewKey });
      navigate("/admin/notifications?tab=broadcasts");
    },
  });

  const anyMutationPending =
    publishMut.isPending ||
    pauseMut.isPending ||
    archiveMut.isPending ||
    unarchiveMut.isPending ||
    deleteMut.isPending;

  function handleDelete() {
    if (deleteMut.isPending) return;
    setDeleteOpen(true);
  }

  return (
    <>
      <PageMeta
        path={`/admin/notifications/broadcasts/${id}`}
        title={`Admin · Broadcast | ${COMPANY_NAME}`}
        description="Broadcast detail."
        noindex
      />
      <div className="mx-auto max-w-4xl">
        <div className="mb-4">
          <Link
            to="/admin/notifications?tab=broadcasts"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to broadcasts
          </Link>
        </div>

        {isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !data ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load broadcast.")}
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${SEVERITY_DOT[data.severity] ?? "bg-muted"}`}
                    aria-hidden
                  />
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {data.title}
                  </h1>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 ${STATUS_PILL[data.status]}`}
                  >
                    {data.status}
                  </span>
                  <span className="text-muted-foreground">{data.severity}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    Created {new Date(data.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.status !== "ARCHIVED" && (
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(true)}
                    disabled={anyMutationPending}
                  >
                    Edit
                  </Button>
                )}
                {(data.status === "DRAFT" ||
                  data.status === "PAUSED" ||
                  data.status === "SCHEDULED") && (
                  <BusyButton
                    variant="default"
                    busyLabel="Publishing…"
                    isBusy={publishMut.isPending}
                    disabled={anyMutationPending && !publishMut.isPending}
                    onClick={() => publishMut.mutate()}
                  >
                    Publish
                  </BusyButton>
                )}
                {data.status === "ACTIVE" && (
                  <BusyButton
                    busyLabel="Pausing…"
                    isBusy={pauseMut.isPending}
                    disabled={anyMutationPending && !pauseMut.isPending}
                    onClick={() => pauseMut.mutate()}
                  >
                    Pause
                  </BusyButton>
                )}
                {data.status === "ARCHIVED" ? (
                  <BusyButton
                    busyLabel="Unarchiving…"
                    isBusy={unarchiveMut.isPending}
                    disabled={anyMutationPending && !unarchiveMut.isPending}
                    onClick={() => unarchiveMut.mutate()}
                  >
                    Unarchive
                  </BusyButton>
                ) : (
                  <BusyButton
                    busyLabel="Archiving…"
                    isBusy={archiveMut.isPending}
                    disabled={anyMutationPending && !archiveMut.isPending}
                    onClick={() => archiveMut.mutate()}
                  >
                    Archive
                  </BusyButton>
                )}
                <BusyButton
                  variant="destructive"
                  busyLabel="Deleting…"
                  isBusy={deleteMut.isPending}
                  disabled={anyMutationPending && !deleteMut.isPending}
                  onClick={handleDelete}
                >
                  Delete
                </BusyButton>
              </div>
            </div>

            {(publishMut.isError ||
              pauseMut.isError ||
              archiveMut.isError ||
              unarchiveMut.isError ||
              deleteMut.isError) && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(() => {
                  const err =
                    publishMut.error ??
                    pauseMut.error ??
                    archiveMut.error ??
                    unarchiveMut.error ??
                    deleteMut.error;
                  return apiErrorText(err, "Action failed.");
                })()}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-4">
              <StatTile
                label="Eligible audience"
                value={data.eligibleAudienceCount}
              />
              <StatTile label="Views" value={data.viewCount} />
              <StatTile label="Dismissed" value={data.dismissalCount} />
              <StatTile
                label="View rate"
                value={
                  data.eligibleAudienceCount === 0
                    ? "—"
                    : `${Math.round((data.viewCount / data.eligibleAudienceCount) * 100)}%`
                }
              />
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-card/40 p-4">
              <h2 className="text-sm font-semibold text-foreground">Body</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {data.body}
              </p>
              {data.ctaLabel && data.ctaUrl ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  CTA: <span className="text-foreground">{data.ctaLabel}</span>{" "}
                  →{" "}
                  <a
                    href={data.ctaUrl}
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.ctaUrl}
                  </a>
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-card/40 p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Window
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Starts: {new Date(data.startsAt).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  Ends:{" "}
                  {data.endsAt
                    ? new Date(data.endsAt).toLocaleString()
                    : "(no end)"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.dismissible
                    ? "Users can dismiss"
                    : "Cannot be dismissed by users"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-card/40 p-4">
                <h2 className="text-sm font-semibold text-foreground">
                  Audience
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.audienceSummary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created by {data.createdByDisplayName ?? "(unknown)"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {editOpen && data && (
        <BroadcastComposeModal
          initial={data}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            setEditOpen(false);
            await invalidateAll();
          }}
        />
      )}
      <BaseAlertDialog
        isOpen={deleteOpen}
        onClose={() => {
          if (deleteMut.isPending) return;
          deleteMut.reset();
          setDeleteOpen(false);
        }}
        title="Delete broadcast"
        description="Delete this broadcast? This cannot be undone. View and dismissal records will be removed."
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
