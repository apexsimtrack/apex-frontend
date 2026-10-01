import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminChallengeList,
  createAdminChallenge,
  deleteAdminChallenge,
  uploadAdminChallengeCover,
  type AdminChallengeRow,
} from "@/lib/api";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
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
import { useCatalogs } from "@/hooks/useCatalogs";
import {
  MANUAL_ACTIVITY_SIMS,
  type ManualActivitySim,
} from "@/lib/manualActivityData";
import SimBadge from "@/components/SimBadge";
import { formatCarName, formatTrackName } from "@/lib/utils";
import { getBrowserTimeZone } from "@/lib/datetime";
import CatalogPicker from "@/components/catalog/CatalogPicker";

const TITLE = `Admin · Challenges | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;
const CAR_CLASS_DEBOUNCE_MS = 300;

const SELECT_MANUAL_LIKE =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none focus:ring-0 disabled:opacity-50";

function localInputToIso(v: string): string {
  if (!v.trim()) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Matches profile race history–style labels for challenge lifecycle. */
function formatChallengeStatus(status: string): string {
  const u = status.trim().toUpperCase();
  if (u === "UPCOMING") return "Upcoming";
  if (u === "ACTIVE") return "Active";
  if (u === "ENDED") return "Ended";
  return status;
}

export default function AdminChallenges() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [simFilter, setSimFilter] = useState<string>("");
  const [titleSearchInput, setTitleSearchInput] = useState("");
  const debouncedTitleSearch = useDebouncedValue(
    titleSearchInput,
    SEARCH_DEBOUNCE_MS,
  );
  const [carClassInput, setCarClassInput] = useState("");
  const debouncedCarClass = useDebouncedValue(
    carClassInput,
    CAR_CLASS_DEBOUNCE_MS,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminChallengeRow | null>(
    null,
  );
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedTitleSearch, debouncedCarClass]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(statusFilter.trim() ? { status: statusFilter.trim() } : {}),
      ...(simFilter.trim() ? { sim: simFilter.trim() } : {}),
      ...(debouncedTitleSearch.trim()
        ? { q: debouncedTitleSearch.trim() }
        : {}),
      ...(debouncedCarClass.trim()
        ? { carClass: debouncedCarClass.trim() }
        : {}),
    }),
    [page, statusFilter, simFilter, debouncedTitleSearch, debouncedCarClass],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "challenges", listParams],
    queryFn: () => fetchAdminChallengeList(listParams),
  });

  const deleteMutation = useMutation({
    mutationFn: (payload: { id: string; confirmation: string }) =>
      deleteAdminChallenge(payload.id, payload.confirmation),
    onSuccess: async () => {
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirm("");
      await qc.invalidateQueries({ queryKey: ["admin", "challenges"] });
      await qc.invalidateQueries({ queryKey: ["challenges"] });
    },
    onError: (e) => {
      setFormError(apiErrorText(e, "Delete failed"));
    },
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

  return (
    <>
      <PageMeta
        path="/admin/challenges"
        title={TITLE}
        description="Manage challenges."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Challenges
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and manage time-limited sim racing challenges.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setCreateOpen(true)}
          >
            New challenge
          </Button>
        </div>

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load challenges.")}
          </div>
        )}

        {!isError && (
          <div className={ADMIN_TABLE_CARD}>
            <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <Input
                  placeholder="Search title…"
                  value={titleSearchInput}
                  onChange={(e) => setTitleSearchInput(e.target.value)}
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
                  <option value="UPCOMING">Upcoming</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ENDED">Ended</option>
                </select>
                <select
                  className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={simFilter}
                  onChange={(e) => {
                    setPage(1);
                    setSimFilter(e.target.value);
                  }}
                  aria-label="Sim"
                >
                  <option value="">All sims</option>
                  {MANUAL_ACTIVITY_SIMS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Car class…"
                  value={carClassInput}
                  onChange={(e) => setCarClassInput(e.target.value)}
                  className="w-full min-w-[10rem] max-w-[14rem]"
                />
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
                  No challenges match
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a different status, sim, car class, or clear the title
                  search.
                </p>
                {(titleSearchInput.trim() ||
                  statusFilter ||
                  simFilter ||
                  carClassInput.trim()) && (
                  <button
                    type="button"
                    className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setTitleSearchInput("");
                      setStatusFilter("");
                      setSimFilter("");
                      setCarClassInput("");
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className={ADMIN_TABLE_SCROLL}>
                <table className={adminTable("min-w-[48rem]")}>
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className={ADMIN_TH}>Title</th>
                      <th className={ADMIN_TH}>Status</th>
                      <th className={ADMIN_TH}>Sim</th>
                      <th className={ADMIN_TH}>Track</th>
                      <th className={ADMIN_TH}>Car</th>
                      <th className={ADMIN_TH}>Participants</th>
                      <th className={ADMIN_TH}>Created by</th>
                      <th className="w-12 whitespace-nowrap p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className={`${ADMIN_TD} font-medium`}>{r.title}</td>
                        <td className={`${ADMIN_TD} text-muted-foreground`}>
                          {formatChallengeStatus(r.status)}
                        </td>
                        <td className={ADMIN_TD}>
                          <SimBadge sim={r.sim} size="md" />
                        </td>
                        <td className={`${ADMIN_TD} text-foreground`}>
                          {formatTrackName(r.track)}
                        </td>
                        <td className={`${ADMIN_TD} text-muted-foreground`}>
                          {formatCarName(r.carClass)}
                        </td>
                        <td className={`${ADMIN_TD} tabular-nums`}>
                          {r.participantCount}
                        </td>
                        <td className={`${ADMIN_TD} text-muted-foreground`}>
                          {r.createdByDisplayName ?? "—"}
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
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/challenges/${r.id}`}>
                                  View
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/challenges/${r.id}?edit=1`}>
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeleteTarget(r);
                                  setDeleteConfirm("");
                                  setDeleteOpen(true);
                                }}
                                className="text-destructive"
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

        {createOpen && (
          <CreateChallengeModal
            onClose={() => setCreateOpen(false)}
            onCreated={async () => {
              setCreateOpen(false);
              await qc.invalidateQueries({ queryKey: ["admin", "challenges"] });
              await qc.invalidateQueries({ queryKey: ["challenges"] });
            }}
          />
        )}

        {deleteOpen && deleteTarget && (
          <BaseAlertDialog
            isOpen={deleteOpen}
            onClose={() => {
              setDeleteOpen(false);
              setFormError(null);
            }}
            title="Delete challenge"
            description={
              <>
                This removes participants and leaderboard data. Type{" "}
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
                  onClick={() => {
                    setDeleteOpen(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={
                    deleteConfirm !== "delete" || deleteMutation.isPending
                  }
                  onClick={() =>
                    deleteMutation.mutate({
                      id: deleteTarget.id,
                      confirmation: deleteConfirm,
                    })
                  }
                >
                  {deleteMutation.isPending ? "Deleting…" : "Delete"}
                </Button>
              </>
            }
          >
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="delete"
              autoComplete="off"
            />
            {formError && (
              <p className="mt-2 text-sm text-destructive">{formError}</p>
            )}
          </BaseAlertDialog>
        )}
      </div>
    </>
  );
}

function CreateChallengeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sim, setSim] = useState<ManualActivitySim | "">("");
  const [trackId, setTrackId] = useState("");
  const [carId, setCarId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const {
    tracks,
    cars,
    loading: catalogsLoading,
    error: catalogsError,
    retry: retryCatalogs,
  } = useCatalogs(sim || null);

  async function submit() {
    setErr(null);

    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      setErr("Title and description are required.");
      return;
    }
    if (!sim) {
      setErr("Select a sim.");
      return;
    }
    if (!trackId.trim()) {
      setErr("Select a track.");
      return;
    }
    if (!carId.trim()) {
      setErr("Select a car.");
      return;
    }

    const startsIso = localInputToIso(startsAt);
    const endsIso = localInputToIso(endsAt);
    if (!startsIso || !endsIso) {
      setErr("Enter valid start and end dates.");
      return;
    }
    if (new Date(startsIso).getTime() >= new Date(endsIso).getTime()) {
      setErr("End date must be after start date.");
      return;
    }

    setPending(true);
    try {
      const created = await createAdminChallenge({
        title: t,
        description: d,
        sim,
        track: trackId.trim(),
        carClass: carId.trim(),
        startsAt: startsIso,
        endsAt: endsIso,
      });
      if (coverFile) {
        try {
          await uploadAdminChallengeCover(created.id, coverFile);
        } catch (e) {
          const message =
            apiErrorText(e, "Cover upload failed");
          toast.warning(
            `Challenge created, but cover upload failed: ${message}. Upload a cover from the challenge detail page.`,
          );
        }
      }
      await onCreated();
    } catch (e) {
      setErr(apiErrorText(e, "Failed to create"));
    } finally {
      setPending(false);
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title="New challenge"
      size="md"
      mobileVariant="fullscreen"
      bodyClassName="min-h-0 space-y-3"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? "Saving…" : "Create"}
          </Button>
        </>
      }
    >
      <label className="block text-xs text-muted-foreground">
        Title <span className="text-red-400">*</span>
        <Input
          className="mt-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Description <span className="text-red-400">*</span>
        <Textarea
          className="mt-1 min-h-[80px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="block text-xs text-white/80">
        Sim / Game <span className="text-red-400">*</span>
        <select
          className={`mt-1 ${SELECT_MANUAL_LIKE}`}
          value={sim}
          onChange={(e) => {
            const v = e.target.value as ManualActivitySim | "";
            setSim(v);
            setTrackId("");
            setCarId("");
          }}
          disabled={pending}
        >
          <option value="">Select sim…</option>
          {MANUAL_ACTIVITY_SIMS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {catalogsError && sim && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-500/10 p-3">
          <p className="text-sm text-red-500">{catalogsError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={retryCatalogs}
            className="border-white/20 text-foreground hover:bg-white/10"
          >
            Retry
          </Button>
        </div>
      )}

      <label className="block text-xs text-white/80">
        Track <span className="text-red-400">*</span>
        {catalogsLoading && sim && (
          <span className="ml-2 text-xs font-normal text-white/50">
            <Loader2 className="mr-0.5 inline size-3 animate-spin align-middle" />
            Loading…
          </span>
        )}
        <CatalogPicker
          className={`mt-1 ${SELECT_MANUAL_LIKE}`}
          value={trackId}
          onValueChange={setTrackId}
          options={tracks}
          label="Track"
          placeholder={
            !sim
              ? "Select a sim first"
              : catalogsLoading
                ? "Loading…"
                : "Select track…"
          }
          disabled={pending || !sim || catalogsLoading}
        />
      </label>

      <label className="block text-xs text-white/80">
        Car <span className="text-red-400">*</span>
        {catalogsLoading && sim && (
          <span className="ml-2 text-xs font-normal text-white/50">
            <Loader2 className="mr-0.5 inline size-3 animate-spin align-middle" />
            Loading…
          </span>
        )}
        <CatalogPicker
          className={`mt-1 ${SELECT_MANUAL_LIKE}`}
          value={carId}
          onValueChange={setCarId}
          options={cars}
          label="Car"
          placeholder={
            !sim
              ? "Select a sim first"
              : catalogsLoading
                ? "Loading…"
                : "Select car…"
          }
          disabled={pending || !sim || catalogsLoading}
        />
      </label>

      <p className="text-xs text-muted-foreground">
        Times are entered in your local timezone:{" "}
        <span className="font-medium text-foreground">
          {getBrowserTimeZone()}
        </span>
        . Players see them in their own local timezone.
      </p>
      <label className="block text-xs text-muted-foreground">
        Starts at <span className="text-red-400">*</span>
        <Input
          className="mt-1"
          type="datetime-local"
          step="1"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Ends at <span className="text-red-400">*</span>
        <Input
          className="mt-1"
          type="datetime-local"
          step="1"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </label>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Cover image (optional)</p>
        {coverPreviewUrl && (
          <img
            src={coverPreviewUrl}
            alt=""
            className="h-32 w-full rounded-lg border border-white/10 object-cover"
          />
        )}
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            setCoverFile(file);
          }}
        />
        {coverFile && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setCoverFile(null)}
          >
            Clear cover
          </Button>
        )}
      </div>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
    </BaseModal>
  );
}
