import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAdminSessionLap,
  deleteAdminSession,
  deleteAdminSessionLap,
  fetchAdminSessionDetail,
  fetchAdminSessionDataExportJob,
  patchAdminSessionLap,
  postAdminReconcileChallengeLeaderboard,
  putAdminSessionActivity,
  requestAdminSessionDataExport,
  type AdminSessionDetail,
  type AdminSessionLapRow,
} from "@/lib/api";
import type { ManualActivityRequest } from "@/lib/api/manualAndUpload";
import ManualActivityForm from "@/components/ManualActivityForm";
import { manualActivityInitialFromAdminDetail } from "@/lib/sessionEditInitialData";
import { invalidateSessionDerivedCaches } from "@/lib/profileQueryKeys";
import { apiErrorText, withRequestId } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ArrowLeft,
  Trash2,
  MoreHorizontal,
  Timer,
  Flag,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SimBadge from "@/components/SimBadge";
import {
  formatCarName,
  formatLapMs,
  formatMsToLapTime,
  formatTrackName,
  parseLapTimeToMs,
  parseStrictManualLapTimeToMs,
} from "@/lib/utils";
import { LAP_FORMAT_MSG } from "@/lib/validation/manualActivity";
import { formatLapDeltaMsForDisplay } from "@/features/session-detail/sessionInsights";
import {
  buildHighlightMapFromLaps,
  EMPTY_SESSION_TIMING_MINIMA,
  timingHighlightClass,
  type LapTimingHighlights,
  type SessionTimingMinima,
} from "@/lib/sessionLapDisplay";
import { useCatalogs } from "@/hooks/useCatalogs";
import { titleizeEnum } from "@/lib/enumFormat";
import { toast } from "sonner";

function formatIngestSourceLabel(
  ingestSource: string | null | undefined,
): string {
  const raw = (ingestSource ?? "").trim();
  if (!raw) return "—";
  return titleizeEnum(raw);
}

/** When ingest tokens aren’t in GET /api/catalogs/:sim, dropdowns won’t match — guide admins to Tracks & catalogs. */
function AdminSessionCatalogBanner({
  sim,
  trackToken,
  carToken,
}: {
  sim: string;
  trackToken: string;
  carToken: string;
}) {
  const simKey = sim.trim();
  const { tracks, cars, loading } = useCatalogs(simKey || null);
  const trackOk = tracks.some((t) => t.id === trackToken);
  const carOk = cars.some((c) => c.id === carToken);

  if (!simKey || loading) return null;
  if (tracks.length === 0 && cars.length === 0) return null;
  if (trackOk && carOk) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/35 px-3 py-2.5 text-xs leading-snug text-amber-100">
      <p className="font-medium text-amber-50">
        Track / car may be missing from catalog
      </p>
      <p className="mt-1.5 text-amber-100/95">
        Stored tokens often come from telemetry (.ibt, etc.) before rows exist
        in the catalog. Add them under{" "}
        <Link
          to="/admin/tracks"
          className="font-medium text-primary underline underline-offset-2"
        >
          Tracks &amp; catalogs
        </Link>{" "}
        (manually or via catalog consistency). Until then, the dropdowns show
        your stored tokens; you can still save laps and other fields. Pick a
        catalog track/car once they exist to normalize this session.
      </p>
      <p className="mt-2 break-all font-mono text-[10px] text-amber-200/80">
        <span className="text-amber-100/70">Track token:</span> {trackToken}
        <br />
        <span className="text-amber-100/70">Car token:</span> {carToken}
      </p>
    </div>
  );
}

/** Same required lap time rules as ManualActivityForm / manual entry. */
function parseRequiredManualLapMs(raw: string): number {
  const ms = parseStrictManualLapTimeToMs(raw.trim());
  if (ms == null) throw new Error(LAP_FORMAT_MSG);
  return ms;
}

/**
 * Sector splits are often &lt;10s (manual strict lap parser rejects those).
 * Accept flexible duration strings or raw milliseconds.
 */
function parseOptionalSectorMs(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const flex = parseLapTimeToMs(t);
  if (flex != null) return flex;
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 600_000) return n;
  }
  throw new Error(
    "Invalid sector time. Use formats like 0:28.500 or 28.500, or paste milliseconds.",
  );
}

export default function AdminSessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const id = sessionId?.trim() ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [includeTelemetry, setIncludeTelemetry] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const [lapDialog, setLapDialog] = useState<
    { mode: "edit"; lap: AdminSessionLapRow } | { mode: "create" } | null
  >(null);
  const [lapDeleteTarget, setLapDeleteTarget] =
    useState<AdminSessionLapRow | null>(null);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "sessions", id, includeTelemetry],
    queryFn: () => fetchAdminSessionDetail(id, { includeTelemetry }),
    enabled: Boolean(id),
  });

  const [editFormError, setEditFormError] = useState<string | null>(null);

  const activityMutation = useMutation({
    mutationFn: (body: ManualActivityRequest) =>
      putAdminSessionActivity(id, body),
  });

  async function handleActivitySubmit(payload: {
    sim: string;
    trackId: string;
    manualSessionKind: "PRACTICE" | "QUALIFY" | "RACE";
    carId?: string;
    position?: number;
    totalDrivers?: number;
    qualifyingPosition?: number;
    laps?: { lapTimeMs: number }[];
    bestLapMs?: number;
    caption?: string;
  }): Promise<void> {
    setEditFormError(null);
    try {
      await activityMutation.mutateAsync(payload as ManualActivityRequest);
      toast.success("Session updated");
      invalidateSessionDerivedCaches(qc, {
        sessionId: id,
        ownerUserId: data?.userId ?? null,
        removeSessionQueries: false,
      });
      qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
      await refetch();
      setEditOpen(false);
    } catch (err) {
      setEditFormError(
        apiErrorText(err, "Failed to update session."),
      );
    }
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminSession(id),
    onSuccess: () => {
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
      navigate("/admin/sessions");
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: () =>
      postAdminReconcileChallengeLeaderboard({
        challengeId: data!.challengeId!,
        userId: data!.userId,
      }),
    onSuccess: () => {
      toast.success("Leaderboard row reconciled");
      refetch();
    },
  });

  const lapSaveMutation = useMutation({
    mutationFn: async () => {
      if (!lapDialog) return;
      if (lapDialog.mode === "create") {
        const ms = parseRequiredManualLapMs(lapCreate.lapTimeMs);
        await createAdminSessionLap(id, {
          lapTimeMs: ms,
          sectorTimesMs: lapCreate.sectors.map(parseOptionalSectorMs),
          isValid: lapCreate.isValid,
        });
      } else {
        const ms = parseRequiredManualLapMs(lapEdit.lapTimeMs);
        await patchAdminSessionLap(id, lapDialog.lap.id, {
          lapTimeMs: ms,
          sectorTimesMs: lapEdit.sectors.map(parseOptionalSectorMs),
          isValid: lapEdit.isValid,
          isBestLap: lapEdit.isBestLap,
        });
      }
    },
    onSuccess: () => {
      toast.success(lapDialog?.mode === "create" ? "Lap added" : "Lap updated");
      qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
      refetch();
      setLapDialog(null);
    },
  });

  const lapDeleteMutation = useMutation({
    mutationFn: (lapId: string) => deleteAdminSessionLap(id, lapId),
    onSuccess: () => {
      setLapDeleteTarget(null);
      toast.success("Lap deleted");
      qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
      refetch();
    },
  });

  const [lapEdit, setLapEdit] = useState({
    lapTimeMs: "",
    sectors: [] as string[],
    isValid: true,
    isBestLap: false,
  });

  const [lapCreate, setLapCreate] = useState({
    lapTimeMs: "",
    sectors: [] as string[],
    isValid: true,
  });

  const adminLapsView = useMemo(() => {
    if (!data?.laps?.length) {
      return {
        idealLapMs: null as number | null,
        sessionMinima: null as SessionTimingMinima | null,
        highlightMap: null as Map<number, LapTimingHighlights> | null,
        bestLapMs: null as number | null,
        rows: [] as Array<{
          lap: AdminSessionLapRow;
          sectors: (number | null)[];
        }>,
      };
    }
    const laps = data.laps;
    const rows = laps.map((lap) => ({
      lap,
      sectors: lap.sectorTimesMs,
    }));
    const finiteTimes = laps
      .map((l) => l.lapTimeMs)
      .filter((t) => Number.isFinite(t) && t > 0);
    const bestLapMs = finiteTimes.length ? Math.min(...finiteTimes) : null;
    const normalizedForHighlights = laps.map((l) => ({
      lap: l.lapNumber,
      highlights: l.highlights,
    }));
    const sessionMinima =
      data.sessionTimingMinima ?? EMPTY_SESSION_TIMING_MINIMA;
    const highlightMap =
      buildHighlightMapFromLaps(normalizedForHighlights) ??
      buildHighlightMapFromLaps(normalizedForHighlights, {
        missingAsDefault: true,
      }) ??
      new Map<number, LapTimingHighlights>();
    const idealLapMs =
      sessionMinima.sectorTimesMs.length > 0 &&
      sessionMinima.sectorTimesMs.every((value) => value != null)
        ? (sessionMinima.sectorTimesMs as number[]).reduce((sum, value) => sum + value, 0)
        : sessionMinima.lapMs;
    return { idealLapMs, rows, bestLapMs, sessionMinima, highlightMap };
  }, [data]);

  const title = useMemo(() => `Admin · Session | ${COMPANY_NAME}`, []);

  if (!id) {
    return (
      <div className="mx-auto max-w-6xl text-sm text-muted-foreground">
        Missing session id.
      </div>
    );
  }

  return (
    <>
      <PageMeta
        path={`/admin/sessions/${id}`}
        title={title}
        description="Session admin detail."
        noindex
      />

      <div className="mx-auto min-w-0 max-w-6xl">
        <div className="mb-6">
          <Link
            to="/admin/sessions"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to sessions
          </Link>
        </div>

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load session.")}
          </div>
        )}

        {isPending && (
          <div className="flex justify-center py-16" aria-busy="true">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isPending && data && (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Session
                </h1>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {data.id}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SimBadge sim={data.sim} size="md" />
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link
                      to={`/sessions/${data.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Public page
                    </Link>
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditOpen(true)}
                >
                  Edit session
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => {
                    setIncludeTelemetry((v) => !v);
                  }}
                >
                  {isFetching && includeTelemetry ? (
                    <>
                      <Loader2
                        className="mr-1.5 size-4 animate-spin"
                        aria-hidden
                      />
                      Loading…
                    </>
                  ) : includeTelemetry ? (
                    "Hide telemetry JSON"
                  ) : (
                    "Load telemetry JSON"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportBusy}
                  onClick={() => {
                    if (!id || exportBusy) return;
                    setExportBusy(true);
                    void (async () => {
                      try {
                        const job = await requestAdminSessionDataExport(id, {
                          depth: "full",
                        });
                        toast.success("Session export queued.");
                        let pollFailures = 0;
                        const poll = async () => {
                          try {
                            const latest = await fetchAdminSessionDataExportJob(
                              job.id,
                            );
                            pollFailures = 0;
                            if (
                              latest.status === "pending" ||
                              latest.status === "processing"
                            ) {
                              window.setTimeout(() => void poll(), 2500);
                              return;
                            }
                            setExportBusy(false);
                            if (
                              latest.status === "ready" &&
                              latest.downloadUrl
                            ) {
                              toast.success("Session export ready.");
                              window.open(
                                latest.downloadUrl,
                                "_blank",
                                "noopener",
                              );
                            } else {
                              toast.error(
                                latest.error?.message ??
                                  "Session export failed.",
                              );
                            }
                          } catch (err) {
                            // Keep polling on transient errors (matches Settings).
                            pollFailures += 1;
                            if (pollFailures >= 8) {
                              setExportBusy(false);
                              toast.error(
                                withRequestId(
                                  "Could not check export status. Try again.",
                                  err,
                                ),
                              );
                              return;
                            }
                            window.setTimeout(() => void poll(), 2500);
                          }
                        };
                        void poll();
                      } catch (e) {
                        setExportBusy(false);
                        toast.error(
                          apiErrorText(e, "Could not start session export."),
                        );
                      }
                    })();
                  }}
                >
                  {exportBusy ? (
                    <>
                      <Loader2
                        className="mr-1.5 size-4 animate-spin"
                        aria-hidden
                      />
                      Exporting…
                    </>
                  ) : (
                    "Export telemetry zip"
                  )}
                </Button>
                {data.challengeId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={reconcileMutation.isPending}
                    onClick={() => reconcileMutation.mutate()}
                  >
                    Reconcile challenge row
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteConfirm("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="mr-1.5 size-4" aria-hidden />
                  Delete session
                </Button>
              </div>
            </div>

            <div className="mb-8 grid gap-4 rounded-xl border border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Owner
                </h2>
                <Link
                  className="mt-1 block font-medium text-primary hover:underline"
                  to={`/admin/users/${encodeURIComponent(data.userId)}`}
                >
                  {data.userDisplayName}
                </Link>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">
                  {data.userId}
                </span>
                {data.driverName && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Driver:{" "}
                    <span className="text-foreground">{data.driverName}</span>
                  </p>
                )}
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Track / car
                </h2>
                <p className="mt-1 font-medium">
                  {formatTrackName(data.track)}
                </p>
                <p className="text-muted-foreground">
                  {formatCarName(data.car)}
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {data.track} · {data.car}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Session type
                </h2>
                <p className="mt-1 text-sm">{data.sessionType ?? "—"}</p>
                {data.manualSessionKind && (
                  <p className="text-xs text-muted-foreground">
                    Manual: {data.manualSessionKind}
                  </p>
                )}
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Source
                </h2>
                <p className="mt-1 text-sm">
                  {formatIngestSourceLabel(data.ingestSource)}
                </p>
                {data.ingestSource && (
                  <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                    {data.ingestSource}
                  </p>
                )}
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Laps
                </h2>
                <p className="mt-1 text-sm tabular-nums">
                  {data.laps.length} lap{data.laps.length === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  Best: {formatLapMs(adminLapsView.bestLapMs)}
                </p>
                {data.laps.some((l) => !l.isValid) && (
                  <p className="mt-1 text-xs text-amber-400">
                    {data.laps.filter((l) => !l.isValid).length} invalid lap(s)
                  </p>
                )}
              </div>
              {(data.position != null ||
                data.qualifyingPosition != null ||
                data.totalDrivers != null) && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Race / grid
                  </h2>
                  {data.position != null && (
                    <p className="mt-1 text-sm tabular-nums">
                      Finish: P{data.position}
                      {data.totalDrivers != null
                        ? ` / ${data.totalDrivers}`
                        : ""}
                    </p>
                  )}
                  {data.qualifyingPosition != null && (
                    <p className="text-sm tabular-nums text-muted-foreground">
                      Qualifying: P{data.qualifyingPosition}
                    </p>
                  )}
                </div>
              )}
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Challenge
                </h2>
                {data.challengeId ? (
                  <>
                    <Link
                      className="mt-1 block text-primary hover:underline"
                      to={`/admin/challenges/${encodeURIComponent(data.challengeId)}`}
                    >
                      {data.challengeTitle ?? data.challengeId}
                    </Link>
                    <span className="mt-1 block font-mono text-xs text-muted-foreground">
                      {data.challengeId} · {data.challengeStatus}
                    </span>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </h2>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {new Date(data.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Engagement
                </h2>
                <p className="mt-1 text-sm tabular-nums">
                  {data.likeCount} likes · {data.commentCount} comments
                </p>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Processing
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.processingStartedAt ?? "—"} →{" "}
                  {data.processingCompletedAt ?? "—"}
                </p>
                {data.processingDurationMs != null && (
                  <p className="text-xs text-muted-foreground">
                    {data.processingDurationMs} ms
                  </p>
                )}
              </div>
              {data.caption?.trim() && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Caption
                  </h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm italic text-foreground">
                    &ldquo;{data.caption.trim()}&rdquo;
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10">
              <div className="flex flex-col gap-2 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-foreground">Laps</h2>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    lapSaveMutation.reset();
                    setLapCreate({
                      lapTimeMs: "",
                      sectors: Array.from({ length: data.sectorCount ?? 0 }, () => ""),
                      isValid: true,
                    });
                    setLapDialog({ mode: "create" });
                  }}
                >
                  Add lap
                </Button>
              </div>

              {adminLapsView.rows.length > 0 &&
                (adminLapsView.sessionMinima?.sectorTimesMs.some((value) => value != null) ||
                  adminLapsView.idealLapMs != null) && (
                  <div className="border-b border-white/10 p-4">
                    <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      Ideal Lap
                    </div>
                    <div className="flex flex-wrap items-end justify-end gap-3">
                      {adminLapsView.sessionMinima?.sectorTimesMs.map((value, index) => (
                        <div key={index} className="min-w-20 text-right">
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">
                            S{index + 1}
                          </div>
                          <div className="mt-0.5 font-mono text-base font-semibold text-purple-400">
                            {formatLapMs(value)}
                          </div>
                        </div>
                      ))}
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          Time
                        </div>
                        <div className="mt-0.5 font-mono text-base font-semibold text-purple-400">
                          {formatLapMs(adminLapsView.idealLapMs ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className="p-2 text-left text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                        Lap
                      </th>
                      {Array.from({ length: data.sectorCount ?? 0 }, (_, index) => (
                        <th key={index} className="p-2 text-right text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                          S{index + 1}
                        </th>
                      ))}
                      <th className="p-2 text-right text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                        Time
                      </th>
                      <th className="p-2 text-right text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                        Delta
                      </th>
                      <th className="p-2 text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                        Valid
                      </th>
                      <th className="p-2 text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                        Best
                      </th>
                      <th className="p-2 text-xs font-semibold uppercase tracking-wider sm:px-4 sm:py-3">
                        Telemetry
                      </th>
                      <th className="w-12 whitespace-nowrap p-2 sm:px-4 sm:py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {adminLapsView.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={(data.sectorCount ?? 0) + 7}
                          className="px-2 py-10 text-center sm:px-4"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-black/20">
                              <Timer
                                className="size-5 text-muted-foreground"
                                aria-hidden
                              />
                            </div>
                            <div className="text-sm text-muted-foreground">
                              No laps for this session.
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      adminLapsView.rows.map(({ lap, sectors }) => {
                        const fastest =
                          adminLapsView.bestLapMs != null &&
                          lap.lapTimeMs === adminLapsView.bestLapMs;
                        const rowHighlights = adminLapsView.highlightMap?.get(
                          lap.lapNumber,
                        ) ?? {
                          lap: "default" as const,
                          sectors: [] as const,
                          s1: "default" as const,
                          s2: "default" as const,
                          s3: "default" as const,
                        };
                        const deltaContent =
                          adminLapsView.bestLapMs == null ? (
                            "—"
                          ) : lap.lapTimeMs === adminLapsView.bestLapMs ? (
                            <span className="inline-flex items-center gap-1">
                              <Flag className="size-3.5 shrink-0" aria-hidden />
                              BEST
                            </span>
                          ) : (
                            formatLapDeltaMsForDisplay(
                              lap.lapTimeMs - adminLapsView.bestLapMs,
                            )
                          );
                        return (
                          <tr
                            key={lap.id}
                            className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                            style={
                              fastest
                                ? { backgroundColor: "rgba(240, 28, 28, 0.08)" }
                                : undefined
                            }
                          >
                            <td className="p-2 align-middle font-medium tabular-nums text-foreground sm:px-4 sm:py-3">
                              <span className="inline-flex items-center gap-1.5">
                                {lap.lapNumber}
                                {fastest && (
                                  <Flag
                                    className="size-4 shrink-0 text-foreground/90"
                                    aria-hidden
                                  />
                                )}
                              </span>
                            </td>
                            {Array.from({ length: data.sectorCount ?? sectors.length }, (_, index) => (
                              <td
                                key={index}
                                className={`p-2 text-right align-middle font-mono text-sm tabular-nums sm:px-4 sm:py-3 ${timingHighlightClass(rowHighlights.sectors[index] ?? "default")}`}
                              >
                                {formatLapMs(sectors[index])}
                              </td>
                            ))}
                            <td className="p-2 text-right align-middle font-mono tabular-nums sm:px-4 sm:py-3">
                              <span
                                className={timingHighlightClass(
                                  rowHighlights.lap,
                                  {
                                    isLapTime: true,
                                  },
                                )}
                              >
                                {formatLapMs(lap.lapTimeMs)}
                              </span>
                            </td>
                            <td
                              className={`p-2 text-right align-middle text-sm sm:px-4 sm:py-3 ${
                                lap.lapTimeMs === adminLapsView.bestLapMs
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {deltaContent}
                            </td>
                            <td className="p-2 align-middle sm:px-4 sm:py-3">
                              {lap.isValid ? "yes" : "no"}
                            </td>
                            <td className="p-2 align-middle sm:px-4 sm:py-3">
                              {lap.isBestLap ? "★" : "—"}
                            </td>
                            <td className="p-2 align-middle text-xs text-muted-foreground sm:px-4 sm:py-3">
                              {lap.hasTelemetry
                                ? lap.telemetrySampleCount != null
                                  ? `${lap.telemetrySampleCount} pts`
                                  : "yes"
                                : "—"}
                            </td>
                            <td className="p-2 text-right align-middle sm:px-4 sm:py-3">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Lap actions"
                                  >
                                    <MoreHorizontal className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      lapSaveMutation.reset();
                                      setLapEdit({
                                        lapTimeMs: formatMsToLapTime(
                                          lap.lapTimeMs,
                                        ),
                                        sectors: lap.sectorTimesMs.map((value) =>
                                          value != null ? formatMsToLapTime(value) : "",
                                        ),
                                        isValid: lap.isValid,
                                        isBestLap: lap.isBestLap,
                                      });
                                      setLapDialog({ mode: "edit", lap });
                                    }}
                                  >
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      if (lapDeleteMutation.isPending) return;
                                      setLapDeleteTarget(lap);
                                    }}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {includeTelemetry && (
                <div className="border-t border-white/10 p-4">
                  <h3 className="text-sm font-medium text-foreground">
                    Per-lap telemetry (JSON)
                  </h3>
                  {isFetching ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Loading telemetry fields…
                    </div>
                  ) : data.laps.some((l) => l.telemetry != null) ? (
                    <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-muted-foreground">
                      {JSON.stringify(
                        data.laps.map((l) => ({
                          lapNumber: l.lapNumber,
                          telemetry: l.telemetry,
                        })),
                        null,
                        2,
                      )}
                    </pre>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No per-lap telemetry JSON is stored for this session. Many
                      ingest paths only persist lap times and sectors.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <BaseModal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditFormError(null);
        }}
        title="Edit activity"
        size="sm"
        mobileVariant="fullscreen"
        bodyClassName="min-h-0"
      >
        {data ? (
          <>
            <AdminSessionCatalogBanner
              sim={data.sim}
              trackToken={data.track}
              carToken={data.car}
            />
            <ManualActivityForm
              key={`admin-edit-${id}-${data.laps.length}`}
              initialData={manualActivityInitialFromAdminDetail(data)}
              onSubmit={handleActivitySubmit}
              submitLabel="Save changes"
              submittingLabel="Saving…"
              isSubmitting={activityMutation.isPending}
              errorMessage={editFormError}
            />
          </>
        ) : null}
      </BaseModal>

      <BaseAlertDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete session?"
        description={
          <>
            This removes all laps and cannot be undone. Type{" "}
            <span className="font-mono text-destructive">delete</span> to
            confirm.
          </>
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                deleteConfirm.trim().toLowerCase() !== "delete" ||
                deleteMutation.isPending
              }
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </>
        }
      >
        <Input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="delete"
        />
        {deleteMutation.isError && (
          <p className="text-sm text-destructive">
            {apiErrorText(deleteMutation.error, "Delete failed")}
          </p>
        )}
      </BaseAlertDialog>

      <BaseAlertDialog
        isOpen={lapDeleteTarget != null}
        onClose={() => {
          if (lapDeleteMutation.isPending) return;
          lapDeleteMutation.reset();
          setLapDeleteTarget(null);
        }}
        title="Delete lap?"
        description="Delete this lap? Best-lap flags and leaderboard summaries will be recomputed."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={lapDeleteMutation.isPending}
              onClick={() => {
                lapDeleteMutation.reset();
                setLapDeleteTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={lapDeleteMutation.isPending || !lapDeleteTarget}
              onClick={() => {
                if (!lapDeleteTarget) return;
                lapDeleteMutation.mutate(lapDeleteTarget.id);
              }}
            >
              {lapDeleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting...
                </>
              ) : (
                "Delete lap"
              )}
            </Button>
          </>
        }
      >
        {lapDeleteMutation.isError ? (
          <p className="text-sm text-destructive">
            {withRequestId(
              lapDeleteMutation.error instanceof Error
                ? lapDeleteMutation.error.message
                : "Delete failed",
              lapDeleteMutation.error,
            )}
          </p>
        ) : null}
      </BaseAlertDialog>

      <BaseModal
        isOpen={lapDialog != null}
        onClose={() => {
          lapSaveMutation.reset();
          setLapDialog(null);
        }}
        title={lapDialog?.mode === "create" ? "Add lap" : "Edit lap"}
        description={
          <>
            Lap time uses the same strict format as manual activity (
            <span className="font-mono">m:ss.mmm</span> or{" "}
            <span className="font-mono">ss.mmm</span>, seconds two digits with a
            colon). Sectors accept those formats, or shorter splits like{" "}
            <span className="font-mono">28.500</span>, or raw milliseconds.
            Saving runs best-lap normalization.
          </>
        }
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                lapSaveMutation.reset();
                setLapDialog(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={lapSaveMutation.isPending}
              onClick={() => lapSaveMutation.mutate()}
            >
              {lapSaveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </>
        }
      >
        {lapDialog?.mode === "edit" && (
          <div className="grid gap-3">
            <label className="text-xs text-muted-foreground">
              Lap time
              <Input
                className="mt-1 font-mono"
                placeholder="1:32.456"
                autoComplete="off"
                value={lapEdit.lapTimeMs}
                onChange={(e) =>
                  setLapEdit((x) => ({ ...x, lapTimeMs: e.target.value }))
                }
              />
            </label>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
              {lapEdit.sectors.map((value, index) => (
              <label key={index} className="text-xs text-muted-foreground">
                S{index + 1} <span className="text-muted-foreground/70">(optional)</span>
                <Input
                  className="mt-1 font-mono text-xs"
                  placeholder="0:28.500"
                  autoComplete="off"
                  value={value}
                  onChange={(e) =>
                    setLapEdit((x) => ({
                      ...x,
                      sectors: x.sectors.map((old, i) => i === index ? e.target.value : old),
                    }))
                  }
                />
              </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lapEdit.isValid}
                onChange={(e) =>
                  setLapEdit((x) => ({ ...x, isValid: e.target.checked }))
                }
              />
              Valid for stats
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lapEdit.isBestLap}
                onChange={(e) =>
                  setLapEdit((x) => ({ ...x, isBestLap: e.target.checked }))
                }
              />
              Mark as best (server may normalize)
            </label>
          </div>
        )}
        {lapDialog?.mode === "create" && (
          <div className="grid gap-3">
            <label className="text-xs text-muted-foreground">
              Lap time
              <Input
                className="mt-1 font-mono"
                placeholder="1:32.456"
                autoComplete="off"
                value={lapCreate.lapTimeMs}
                onChange={(e) =>
                  setLapCreate((x) => ({ ...x, lapTimeMs: e.target.value }))
                }
              />
            </label>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
              {lapCreate.sectors.map((value, index) => (
              <label key={index} className="text-xs text-muted-foreground">
                S{index + 1} <span className="text-muted-foreground/70">(optional)</span>
                <Input
                  className="mt-1 font-mono text-xs"
                  placeholder="0:28.500"
                  autoComplete="off"
                  value={value}
                  onChange={(e) =>
                    setLapCreate((x) => ({
                      ...x,
                      sectors: x.sectors.map((old, i) => i === index ? e.target.value : old),
                    }))
                  }
                />
              </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lapCreate.isValid}
                onChange={(e) =>
                  setLapCreate((x) => ({ ...x, isValid: e.target.checked }))
                }
              />
              Valid for stats
            </label>
          </div>
        )}
        {lapSaveMutation.isError && (
          <p className="text-sm text-destructive">
            {withRequestId(
              lapSaveMutation.error instanceof Error
                ? lapSaveMutation.error.message
                : "Save failed",
              lapSaveMutation.error,
            )}
          </p>
        )}
      </BaseModal>
    </>
  );
}
