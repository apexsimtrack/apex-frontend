import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkDeleteAdminSessions,
  fetchAdminDuplicateClusters,
  fetchAdminSessionList,
  mergeAdminDuplicateSessions,
  type AdminDuplicateCluster,
  type AdminSessionListRow,
} from "@/lib/api";
import { apiErrorText, ApiError, withRequestId } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreHorizontal, Trash2, Download } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";
import { MANUAL_ACTIVITY_SIMS, type SimOption } from "@/lib/manualActivityData";
import SimBadge from "@/components/SimBadge";
import SessionTypeTag from "@/components/SessionTypeTag";
import { formatCarName, formatLapMs, formatTrackName } from "@/lib/utils";

const TITLE = `Admin · Sessions & laps | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;

const SESSION_TYPE_FILTER_OPTIONS = [
  { value: "", label: "All types" },
  { value: "MANUAL_ACTIVITY", label: "Manual activity" },
  { value: "RACE", label: "Race" },
  { value: "SPRINT", label: "Sprint" },
  { value: "PRACTICE", label: "Practice" },
  { value: "QUALIFYING", label: "Qualifying" },
  { value: "WARMUP", label: "Warmup" },
  { value: "TIME_TRIAL", label: "Time trial" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

const MANUAL_KIND_FILTER_OPTIONS = [
  { value: "", label: "All manual kinds" },
  { value: "PRACTICE", label: "Practice" },
  { value: "QUALIFY", label: "Qualifying" },
  { value: "RACE", label: "Race" },
] as const;

const PRESET_SELECT_CLASS =
  "rounded-md border border-white/10 bg-card px-3 py-2 text-sm";

function downloadCsv(filename: string, rows: string[][]): void {
  const esc = (c: string) => {
    if (c.includes(",") || c.includes('"') || c.includes("\n")) {
      return `"${c.replace(/"/g, '""')}"`;
    }
    return c;
  };
  const body = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSessions() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const debouncedQ = useDebouncedValue(qInput, SEARCH_DEBOUNCE_MS);
  const [userIdFilter, setUserIdFilter] = useState("");
  const debouncedUserId = useDebouncedValue(userIdFilter, SEARCH_DEBOUNCE_MS);
  const [simFilter, setSimFilter] = useState<string>("");
  const [challengeIdFilter, setChallengeIdFilter] = useState("");
  const debouncedChallengeId = useDebouncedValue(
    challengeIdFilter,
    SEARCH_DEBOUNCE_MS,
  );
  const [fromIso, setFromIso] = useState("");
  const [toIso, setToIso] = useState("");
  const debouncedFromIso = useDebouncedValue(fromIso, SEARCH_DEBOUNCE_MS);
  const debouncedToIso = useDebouncedValue(toIso, SEARCH_DEBOUNCE_MS);
  const [maxLapMsInput, setMaxLapMsInput] = useState("");
  const debouncedMaxLap = useDebouncedValue(maxLapMsInput, SEARCH_DEBOUNCE_MS);

  const [zeroLaps, setZeroLaps] = useState(false);
  const [processingStuck, setProcessingStuck] = useState(false);
  const [hasInvalidLaps, setHasInvalidLaps] = useState(false);
  const [missingTelemetry, setMissingTelemetry] = useState(false);
  const [multipleBestLaps, setMultipleBestLaps] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [keepByCluster, setKeepByCluster] = useState<Record<string, string>>(
    {},
  );
  const [mergeTarget, setMergeTarget] = useState<{
    cluster: AdminDuplicateCluster;
    keepSessionId: string;
  } | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState("");
  const [sessionTypeFilter, setSessionTypeFilter] = useState("");
  const [manualKindFilter, setManualKindFilter] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState("");

  useEffect(() => {
    setPage(1);
  }, [
    debouncedQ,
    debouncedUserId,
    simFilter,
    debouncedChallengeId,
    debouncedFromIso,
    debouncedToIso,
    debouncedMaxLap,
    zeroLaps,
    processingStuck,
    hasInvalidLaps,
    missingTelemetry,
    multipleBestLaps,
    sessionTypeFilter,
    manualKindFilter,
  ]);

  const maxLapParsed = useMemo(() => {
    const t = debouncedMaxLap.trim();
    if (!t) return undefined;
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [debouncedMaxLap]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
      ...(debouncedUserId.trim() ? { userId: debouncedUserId.trim() } : {}),
      ...(simFilter.trim() ? { sim: simFilter.trim() } : {}),
      ...(debouncedChallengeId.trim()
        ? { challengeId: debouncedChallengeId.trim() }
        : {}),
      ...(debouncedFromIso.trim() ? { from: debouncedFromIso.trim() } : {}),
      ...(debouncedToIso.trim() ? { to: debouncedToIso.trim() } : {}),
      ...(maxLapParsed != null ? { maxLapMs: maxLapParsed } : {}),
      ...(zeroLaps ? { zeroLaps: true } : {}),
      ...(processingStuck ? { processingStuck: true } : {}),
      ...(hasInvalidLaps ? { hasInvalidLaps: true } : {}),
      ...(missingTelemetry ? { missingTelemetry: true } : {}),
      ...(multipleBestLaps ? { multipleBestLaps: true } : {}),
      ...(sessionTypeFilter.trim()
        ? { sessionType: sessionTypeFilter.trim() }
        : {}),
      ...(sessionTypeFilter === "MANUAL_ACTIVITY" && manualKindFilter.trim()
        ? { manualSessionKind: manualKindFilter.trim() }
        : {}),
    }),
    [
      page,
      debouncedQ,
      debouncedUserId,
      simFilter,
      debouncedChallengeId,
      debouncedFromIso,
      debouncedToIso,
      maxLapParsed,
      zeroLaps,
      processingStuck,
      hasInvalidLaps,
      missingTelemetry,
      multipleBestLaps,
      sessionTypeFilter,
      manualKindFilter,
    ],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "sessions", listParams],
    queryFn: () => fetchAdminSessionList(listParams),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteAdminSessions(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
      setSelected(new Set());
      setBulkOpen(false);
      setBulkConfirm("");
    },
  });

  const duplicatesQuery = useQuery({
    queryKey: ["admin", "sessions", "duplicates", debouncedUserId, simFilter],
    queryFn: () =>
      fetchAdminDuplicateClusters({
        ...(debouncedUserId.trim() ? { userId: debouncedUserId.trim() } : {}),
        ...(simFilter.trim() ? { sim: simFilter.trim() } : {}),
        windowHours: 48,
      }),
    enabled: showDuplicates,
  });

  const mergeDuplicatesMutation = useMutation({
    mutationFn: ({
      cluster,
      keepSessionId,
    }: {
      cluster: AdminDuplicateCluster;
      keepSessionId: string;
    }) =>
      mergeAdminDuplicateSessions({
        keepSessionId,
        mergeSessionIds: cluster.sessionIds.filter(
          (id) => id !== keepSessionId,
        ),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sessions"] });
      qc.invalidateQueries({ queryKey: ["admin", "sessions", "duplicates"] });
      setMergeTarget(null);
      setMergeConfirm("");
    },
  });

  const rows: AdminSessionListRow[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;

  const rangeLabel = useMemo(() => {
    if (total === 0) return "No results";
    const pageSize = 20;
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    const noun = total === 1 ? "session" : "sessions";
    return `Showing ${start}–${end} of ${total} ${noun}`;
  }, [total, currentPage]);

  /** True when every row on the current page is selected (not merely `selected.size === rows.length`). */
  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAllVisible(): void {
    const pageIds = rows.map((r) => r.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allInPage =
        pageIds.length > 0 && pageIds.every((id) => next.has(id));
      if (allInPage) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv(): void {
    const header = [
      "id",
      "userId",
      "user",
      "sim",
      "track",
      "car",
      "laps",
      "bestLapMs",
      "invalidLaps",
      "challengeId",
      "createdAt",
    ];
    const lines: string[][] = [header];
    for (const r of rows) {
      lines.push([
        r.id,
        r.userId,
        r.userDisplayName,
        r.sim,
        r.track,
        r.car,
        String(r.lapCount),
        r.bestLapMs != null ? String(r.bestLapMs) : "",
        String(r.invalidLapCount),
        r.challengeId ?? "",
        r.createdAt,
      ]);
    }
    downloadCsv(`admin-sessions-page-${currentPage}.csv`, lines);
  }

  const hasActiveFilters =
    qInput.trim() ||
    userIdFilter.trim() ||
    simFilter ||
    challengeIdFilter.trim() ||
    fromIso.trim() ||
    toIso.trim() ||
    maxLapMsInput.trim() ||
    zeroLaps ||
    processingStuck ||
    hasInvalidLaps ||
    missingTelemetry ||
    multipleBestLaps ||
    sessionTypeFilter ||
    manualKindFilter;

  return (
    <>
      <PageMeta
        path="/admin/sessions"
        title={TITLE}
        description="Session review and moderation."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Sessions & laps
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Investigate uploads, fix laps, and manage sessions (with
              leaderboard &amp; personal-best reconciliation on the server).
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <Link
                to="/admin/tracks"
                className="text-primary underline-offset-4 hover:underline"
              >
                Tracks &amp; catalogs
              </Link>{" "}
              — cross-check unknown track/car tokens.{" "}
              <Link
                to="/admin/leaderboards"
                className="text-primary underline-offset-4 hover:underline"
              >
                Global leaderboards
              </Link>{" "}
              for competitive context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDuplicates((v) => !v)}
            >
              {showDuplicates ? "Hide duplicate review" : "Review duplicates"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={rows.length === 0}
            >
              <Download className="mr-1.5 size-4" aria-hidden />
              Export CSV (this page)
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => {
                setBulkConfirm("");
                setBulkOpen(true);
              }}
            >
              <Trash2 className="mr-1.5 size-4" aria-hidden />
              Delete selected ({selected.size})
            </Button>
          </div>
        </div>

        {showDuplicates && (
          <div className={`${ADMIN_TABLE_CARD} mb-6 p-4`}>
            <h2 className="text-sm font-semibold text-foreground">
              Duplicate session clusters (48h)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Consecutive uploads with the same driver, session type, car,
              track, best lap time, and lap count. Choose which session to keep
              (default: earliest upload), then merge to delete the rest.
            </p>
            {duplicatesQuery.isPending ? (
              <div className="flex justify-center py-8">
                <Loader2
                  className="size-5 animate-spin text-muted-foreground"
                  aria-hidden
                />
              </div>
            ) : duplicatesQuery.isError ? (
              <p className="mt-4 text-sm text-destructive">
                {withRequestId(
                  "Failed to load duplicate clusters.",
                  duplicatesQuery.error,
                )}
              </p>
            ) : (duplicatesQuery.data?.clusters.length ?? 0) === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No duplicate clusters found.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {duplicatesQuery.data!.clusters.map((cluster) => {
                  const clusterKey = cluster.sessionIds.join("|");
                  const selectedKeepId =
                    keepByCluster[clusterKey] ?? cluster.keepSessionId;
                  const sortedSessions = [...cluster.sessions].sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() -
                      new Date(b.createdAt).getTime(),
                  );

                  return (
                    <li
                      key={clusterKey}
                      className="rounded-md border border-white/10 bg-card/50 p-3 text-sm"
                    >
                      <div className="font-medium">
                        {formatTrackName(cluster.track)} ·{" "}
                        {formatCarName(cluster.car)} · {cluster.sessionType}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        User {cluster.userId} · {cluster.lapCount} lap(s) · best{" "}
                        {formatLapMs(cluster.bestLapMs)} ·{" "}
                        {cluster.sessionIds.length} duplicate uploads
                      </div>
                      <div className={`${ADMIN_TABLE_SCROLL} mt-3`}>
                        <table className={adminTable("min-w-[36rem]")}>
                          <thead>
                            <tr className="border-b border-white/10 text-muted-foreground">
                              <th className={`${ADMIN_TH} w-16`}>Keep</th>
                              <th className={ADMIN_TH}>Uploaded</th>
                              <th className={ADMIN_TH}>Session</th>
                              <th className={ADMIN_TH}>Dedupe key</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedSessions.map((s) => {
                              const isSuggested =
                                s.id === cluster.keepSessionId;
                              return (
                                <tr
                                  key={s.id}
                                  className="border-b border-white/5"
                                >
                                  <td className="p-2 align-middle">
                                    <input
                                      type="radio"
                                      name={`keep-${clusterKey}`}
                                      checked={selectedKeepId === s.id}
                                      onChange={() =>
                                        setKeepByCluster((prev) => ({
                                          ...prev,
                                          [clusterKey]: s.id,
                                        }))
                                      }
                                      aria-label={`Keep session ${s.id}`}
                                      className="rounded-full border-white/20"
                                    />
                                  </td>
                                  <td className="whitespace-nowrap p-2 align-middle text-xs text-muted-foreground">
                                    {new Date(s.createdAt).toLocaleString()}
                                    {isSuggested && (
                                      <span className="ml-2 text-[10px] text-primary">
                                        suggested
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2 align-middle">
                                    <Link
                                      to={`/admin/sessions/${encodeURIComponent(s.id)}`}
                                      className="font-mono text-[11px] text-primary hover:underline"
                                    >
                                      {s.id}
                                    </Link>
                                  </td>
                                  <td className="max-w-[12rem] truncate p-2 align-middle font-mono text-[10px] text-muted-foreground">
                                    {s.clientSessionId ?? "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={mergeDuplicatesMutation.isPending}
                          onClick={() => {
                            setMergeTarget({
                              cluster,
                              keepSessionId: selectedKeepId,
                            });
                            setMergeConfirm("");
                          }}
                        >
                          Merge {cluster.sessionIds.length} sessions…
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {mergeDuplicatesMutation.isError && !mergeTarget && (
              <p className="mt-3 text-sm text-destructive">
                {apiErrorText(mergeDuplicatesMutation.error, "Merge failed.")}
              </p>
            )}
          </div>
        )}

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load sessions.")}
          </div>
        )}

        {!isError && (
          <div className={ADMIN_TABLE_CARD}>
            <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <Input
                    placeholder="Search track, car, driver name…"
                    value={qInput}
                    onChange={(e) => setQInput(e.target.value)}
                    className="w-full min-w-[12rem] max-w-xs"
                  />
                  <Input
                    placeholder="User ID…"
                    value={userIdFilter}
                    onChange={(e) => setUserIdFilter(e.target.value)}
                    className="w-full min-w-[10rem] max-w-[14rem] font-mono text-xs"
                  />
                  <Input
                    placeholder="Challenge ID…"
                    value={challengeIdFilter}
                    onChange={(e) => setChallengeIdFilter(e.target.value)}
                    className="w-full min-w-[10rem] max-w-[14rem] font-mono text-xs"
                  />
                  <select
                    className={PRESET_SELECT_CLASS}
                    value={simFilter}
                    onChange={(e) => {
                      setPage(1);
                      setSimFilter(e.target.value);
                    }}
                    aria-label="Sim"
                  >
                    <option value="">All sims</option>
                    {MANUAL_ACTIVITY_SIMS.map((s: SimOption) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={PRESET_SELECT_CLASS}
                    value={sessionTypeFilter}
                    onChange={(e) => {
                      setPage(1);
                      const next = e.target.value;
                      setSessionTypeFilter(next);
                      if (next !== "MANUAL_ACTIVITY") setManualKindFilter("");
                    }}
                    aria-label="Session type"
                  >
                    {SESSION_TYPE_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value || "all"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {sessionTypeFilter === "MANUAL_ACTIVITY" && (
                    <select
                      className={PRESET_SELECT_CLASS}
                      value={manualKindFilter}
                      onChange={(e) => {
                        setPage(1);
                        setManualKindFilter(e.target.value);
                      }}
                      aria-label="Manual session kind"
                    >
                      {MANUAL_KIND_FILTER_OPTIONS.map((opt) => (
                        <option
                          key={opt.value || "all-manual"}
                          value={opt.value}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    placeholder="From (ISO datetime)"
                    value={fromIso}
                    onChange={(e) => setFromIso(e.target.value)}
                    className="min-w-[12rem] max-w-xs font-mono text-xs"
                  />
                  <Input
                    placeholder="To (ISO datetime)"
                    value={toIso}
                    onChange={(e) => setToIso(e.target.value)}
                    className="min-w-[12rem] max-w-xs font-mono text-xs"
                  />
                  <Input
                    placeholder="Suspicious: max lap ms (≤)"
                    value={maxLapMsInput}
                    onChange={(e) => setMaxLapMsInput(e.target.value)}
                    className="w-full min-w-[10rem] max-w-[12rem] font-mono text-xs"
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={zeroLaps}
                      onChange={(e) => setZeroLaps(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Zero laps
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={processingStuck}
                      onChange={(e) => setProcessingStuck(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Processing stuck
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={hasInvalidLaps}
                      onChange={(e) => setHasInvalidLaps(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Has invalid laps
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={missingTelemetry}
                      onChange={(e) => setMissingTelemetry(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Missing lap telemetry
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={multipleBestLaps}
                      onChange={(e) => setMultipleBestLaps(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Multiple &quot;best&quot; flags
                  </label>
                </div>
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
                  No sessions match
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try clearing filters or search terms.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="mt-4 text-sm text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setQInput("");
                      setUserIdFilter("");
                      setChallengeIdFilter("");
                      setSimFilter("");
                      setFromIso("");
                      setToIso("");
                      setMaxLapMsInput("");
                      setZeroLaps(false);
                      setProcessingStuck(false);
                      setHasInvalidLaps(false);
                      setMissingTelemetry(false);
                      setMultipleBestLaps(false);
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
                      <th className="w-10 whitespace-nowrap p-3">
                        <input
                          type="checkbox"
                          aria-label="Select all on page"
                          checked={allOnPageSelected}
                          onChange={toggleAllVisible}
                          className="rounded border-white/20"
                        />
                      </th>
                      <th className={ADMIN_TH}>When</th>
                      <th className={ADMIN_TH}>User</th>
                      <th className={ADMIN_TH}>Sim</th>
                      <th className={ADMIN_TH}>Type</th>
                      <th className={ADMIN_TH}>Track / car</th>
                      <th className={ADMIN_TH}>Laps</th>
                      <th className={ADMIN_TH}>Best</th>
                      <th className={ADMIN_TH}>Dedupe key</th>
                      <th className={ADMIN_TH}>Challenge</th>
                      <th className="w-12 whitespace-nowrap p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="p-3 align-middle">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`Select session ${r.id}`}
                            className="rounded border-white/20"
                          />
                        </td>
                        <td className="whitespace-nowrap p-3 align-middle text-xs text-muted-foreground">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 align-middle">
                          <Link
                            to={`/admin/users/${encodeURIComponent(r.userId)}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.userDisplayName}
                          </Link>
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {r.userId}
                          </div>
                        </td>
                        <td className="p-3 align-middle">
                          <SimBadge sim={r.sim} size="md" />
                        </td>
                        <td className="p-3 align-middle">
                          <SessionTypeTag
                            sessionType={r.sessionType}
                            manualSessionKind={r.manualSessionKind}
                          />
                        </td>
                        <td className="p-3 align-middle">
                          <div className="font-medium">
                            {formatTrackName(r.track)}
                          </div>
                          <div className="text-muted-foreground">
                            {formatCarName(r.car)}
                          </div>
                          {r.invalidLapCount > 0 && (
                            <div className="mt-1 text-xs text-amber-400">
                              {r.invalidLapCount} invalid lap(s)
                            </div>
                          )}
                        </td>
                        <td className="p-3 align-middle tabular-nums">
                          {r.lapCount}
                        </td>
                        <td className="min-w-[6rem] p-3 align-middle tabular-nums text-muted-foreground">
                          {formatLapMs(r.bestLapMs)}
                        </td>
                        <td className="max-w-[8rem] truncate p-3 align-middle font-mono text-[10px] text-muted-foreground">
                          {r.clientSessionId ?? "—"}
                        </td>
                        <td className="p-3 align-middle text-xs">
                          {r.challengeId ? (
                            <>
                              <Link
                                to={`/admin/challenges/${encodeURIComponent(r.challengeId)}`}
                                className="text-primary hover:underline"
                              >
                                {r.challengeTitle ?? r.challengeId}
                              </Link>
                              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                {r.challengeId}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right align-middle">
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
                                <Link to={`/admin/sessions/${r.id}`}>
                                  View / edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  to={`/sessions/${r.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open public session
                                </Link>
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
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Page {currentPage} / {totalPages}
            </span>
          </div>
        )}
      </div>

      {mergeTarget && (
        <BaseAlertDialog
          isOpen={Boolean(mergeTarget)}
          onClose={() => {
            setMergeTarget(null);
            setMergeConfirm("");
          }}
          title="Merge duplicate sessions"
          description={
            <>
              Keep one session and permanently delete{" "}
              {mergeTarget.cluster.sessionIds.length - 1} duplicate upload(s).
              All sessions in this cluster share the same lap count (
              {mergeTarget.cluster.lapCount}) and best time (
              {formatLapMs(mergeTarget.cluster.bestLapMs)}).
              <span className="mt-3 block font-mono text-xs text-muted-foreground">
                Keeping: {mergeTarget.keepSessionId}
              </span>
              <span className="mt-3 block text-xs">
                Type <span className="font-mono text-destructive">merge</span>{" "}
                to confirm.
              </span>
            </>
          }
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMergeTarget(null);
                  setMergeConfirm("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  mergeConfirm.trim().toLowerCase() !== "merge" ||
                  mergeDuplicatesMutation.isPending
                }
                onClick={() =>
                  mergeDuplicatesMutation.mutate({
                    cluster: mergeTarget.cluster,
                    keepSessionId: mergeTarget.keepSessionId,
                  })
                }
              >
                {mergeDuplicatesMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Merging…
                  </>
                ) : (
                  "Merge"
                )}
              </Button>
            </>
          }
        >
          <Input
            value={mergeConfirm}
            onChange={(e) => setMergeConfirm(e.target.value)}
            placeholder="merge"
            autoComplete="off"
          />
          {mergeDuplicatesMutation.isError && (
            <p className="mt-2 text-sm text-destructive">
              {apiErrorText(mergeDuplicatesMutation.error, "Merge failed.")}
            </p>
          )}
        </BaseAlertDialog>
      )}

      {bulkOpen && (
        <BaseAlertDialog
          isOpen={bulkOpen}
          onClose={() => {
            setBulkOpen(false);
            setBulkConfirm("");
          }}
          title="Delete sessions"
          description={
            <>
              Permanently delete {selected.size} session(s) and cascade laps.
              Leaderboards and personal bests will be recomputed server-side.
              <span className="mt-3 block text-xs">
                Type <span className="font-mono text-destructive">delete</span>{" "}
                to confirm.
              </span>
            </>
          }
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBulkOpen(false);
                  setBulkConfirm("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  bulkConfirm.trim().toLowerCase() !== "delete" ||
                  bulkDeleteMutation.isPending
                }
                onClick={() => bulkDeleteMutation.mutate([...selected])}
              >
                {bulkDeleteMutation.isPending ? (
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
            value={bulkConfirm}
            onChange={(e) => setBulkConfirm(e.target.value)}
            placeholder="delete"
            autoComplete="off"
          />
          {bulkDeleteMutation.isError && (
            <p className="mt-2 text-sm text-destructive">
              {apiErrorText(bulkDeleteMutation.error, "Delete failed.")}
            </p>
          )}
        </BaseAlertDialog>
      )}
    </>
  );
}
