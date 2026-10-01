import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Upload, PenLine, Cpu, Search, LayoutGrid, List } from "lucide-react";
import { ProUpgradeCallout } from "@/components/marketing/ProUpgradeCallout";

import OnboardingEmptyState from "@/components/dashboard/OnboardingEmptyState";
import MySessionCard from "@/components/sessions/MySessionCard";
import SessionsLibraryTable from "@/components/sessions/SessionsLibraryTable";
import { ProfileKeyStats } from "@/components/profile/ProfileKeyStats";
import { ProfileStatsByGame } from "@/components/profile/ProfileStatsByGame";
import {
  appOutlineButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import AppNativeSelect from "@/components/app-ui/AppNativeSelect";
import SessionsOverviewStats from "@/pages/sessions/SessionsOverviewStats";
import SessionsOverviewStatsSkeleton from "@/pages/sessions/SessionsOverviewStatsSkeleton";
import { SessionsListSkeleton } from "@/pages/sessions/SessionsPageSkeleton";
import SessionsWeeklyStatsPanel from "@/pages/sessions/SessionsWeeklyStatsPanel";
import DiscussionCommentsPagination from "@/pages/discussion/DiscussionCommentsPagination";
import {
  getSessionsLibraryMeta,
  getSessionsLibraryList,
  getSessionsLibraryStats,
  SESSIONS_LIBRARY_DEFAULT_LIMIT,
  type SessionsLibraryTypeFilter,
  type SessionsLibrarySessionKind,
  type SessionsLibraryIngest,
  type SessionsLibraryStatsTab,
  type SessionsLibraryView,
  type SessionsLibraryFilters,
  type SessionsLibraryWeeklyStats,
  type SessionsLibraryRacingStats,
  type SessionsLibraryBySimStats,
} from "@/lib/api/sessionsLibrary";
import { isNetworkError } from "@/lib/api/profile";
import { withRequestId } from "@/lib/api/errors";
import { useAuth, useIsProUser } from "@/contexts/AuthContext";
import { usePlatform } from "@/hooks/usePlatform";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { cn } from "@/lib/utils";

const SESSIONS_PATH = "/sessions";
const sessionsTitle = `Sessions | ${COMPANY_NAME}`;
const sessionsDescription = `Browse your sim racing sessions and telemetry on ${COMPANY_NAME}.`;
const META_STALE_MS = 5 * 60_000;

function formatQueryError(err: unknown, fallback: string): string {
  if (isNetworkError(err)) {
    return "Can't reach Apex backend. Check it's running.";
  }
  if (err instanceof Error && err.message.trim()) {
    return withRequestId(err.message, err);
  }
  return withRequestId(fallback, err);
}

function hasLibrarySubFilters(
  debouncedQ: string,
  sessionKind: SessionsLibrarySessionKind,
  sim: string,
  ingest: SessionsLibraryIngest,
): boolean {
  return Boolean(
    debouncedQ || sessionKind !== "all" || sim || ingest !== "all",
  );
}

const TYPE_TABS: { value: SessionsLibraryTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "telemetry", label: "Telemetry" },
  { value: "manual", label: "Manual" },
];

const STATS_TABS: { value: SessionsLibraryStatsTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "weekly", label: "This Week" },
  { value: "racing", label: "Racing" },
  { value: "bySim", label: "By Sim" },
];

const SESSION_KIND_OPTIONS: {
  value: SessionsLibrarySessionKind;
  label: string;
}[] = [
  { value: "all", label: "All kinds" },
  { value: "practice", label: "Practice" },
  { value: "qualify", label: "Qualify" },
  { value: "race", label: "Race" },
];

const SIM_OPTIONS = [
  { value: "", label: "All sims" },
  { value: "iracing", label: "iRacing" },
  { value: "f1_25", label: "F1 25" },
  { value: "lmu", label: "Le Mans Ultimate" },
];

const INGEST_OPTIONS: { value: SessionsLibraryIngest; label: string }[] = [
  { value: "all", label: "All uploads" },
  { value: "agent_upload", label: "Agent" },
  { value: "manual_upload_ibt", label: "IBT file" },
  { value: "manual_form", label: "Manual form" },
];

const FIELD_CLASS =
  "h-12 rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container font-apex-body text-sm text-apex-on-surface transition-colors placeholder:text-apex-on-surface-variant/60 focus:border-apex-primary/40 focus:outline-none";

function parseType(v: string | null): SessionsLibraryTypeFilter {
  if (v === "telemetry" || v === "manual" || v === "all") return v;
  return "all";
}

function parseSessionKind(v: string | null): SessionsLibrarySessionKind {
  if (v === "practice" || v === "qualify" || v === "race" || v === "all") {
    return v;
  }
  return "all";
}

function parseIngest(v: string | null): SessionsLibraryIngest {
  if (
    v === "manual_form" ||
    v === "agent_upload" ||
    v === "manual_upload_ibt" ||
    v === "all"
  ) {
    return v;
  }
  return "all";
}

function parseStatsTab(v: string | null): SessionsLibraryStatsTab {
  if (v === "overview" || v === "weekly" || v === "racing" || v === "bySim") {
    return v;
  }
  return "overview";
}

function parseView(v: string | null): SessionsLibraryView {
  return v === "table" ? "table" : "cards";
}

function parsePage(v: string | null): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function EmptyManual() {
  return (
    <div className="rounded-apex-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-8 text-center">
      <p className="font-apex-body text-sm text-apex-on-surface-variant">
        No manual activities yet.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          to="/manual"
          className={`${appPrimaryButtonClassName} inline-flex h-11 items-center justify-center px-6`}
        >
          <PenLine className="mr-2 size-4" />
          Log Manual Activity
        </Link>
        <Link
          to="/upload"
          className={`${appOutlineButtonClassName} inline-flex h-11 items-center justify-center px-6`}
        >
          <Upload className="mr-2 size-4" />
          Upload Session
        </Link>
      </div>
    </div>
  );
}

function EmptyTelemetry() {
  const isPro = useIsProUser();
  const { isNative } = usePlatform();
  return (
    <div className="rounded-apex-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-8 text-center">
      <p className="font-apex-body text-sm text-apex-on-surface-variant">
        No telemetry sessions yet.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          to="/upload"
          className={`${appPrimaryButtonClassName} inline-flex h-11 items-center justify-center px-6`}
        >
          <Upload className="mr-2 size-4" />
          Upload Session
        </Link>
        {isPro && !isNative ? (
          <Link
            to="/agent"
            className={`${appOutlineButtonClassName} inline-flex h-11 items-center justify-center px-6`}
          >
            <Cpu className="mr-2 size-4" />
            Get the Agent
          </Link>
        ) : !isPro ? (
          <Link
            to={"/pricing"}
            className={`${appOutlineButtonClassName} inline-flex h-11 items-center justify-center px-6 text-apex-primary`}
          >
            Upgrade for Agent
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function Sessions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPro = useIsProUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const type = parseType(
    searchParams.get("type") ?? searchParams.get("sessionsType"),
  );
  const sessionKind = parseSessionKind(searchParams.get("sessionKind"));
  const sim = searchParams.get("sim") ?? "";
  const ingest = parseIngest(searchParams.get("ingest"));
  const statsTab = parseStatsTab(searchParams.get("statsTab"));
  const view = parseView(searchParams.get("view"));
  const page = parsePage(searchParams.get("page"));
  const qParam = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(qParam);
  const [debouncedQ, setDebouncedQ] = useState(qParam);

  useEffect(() => {
    setSearchInput(qParam);
    setDebouncedQ(qParam);
  }, [qParam]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = searchInput.trim();
      setDebouncedQ(next);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (next.has("sessionsType") && !next.has("type")) {
            next.set("type", next.get("sessionsType")!);
          }
          next.delete("sessionsType");

          for (const [k, v] of Object.entries(patch)) {
            const shouldOmit =
              v == null ||
              v === "" ||
              (k === "type" && v === "all") ||
              (k === "sessionKind" && v === "all") ||
              (k === "ingest" && v === "all") ||
              (k === "page" && v === "1") ||
              (k === "view" && v === "cards") ||
              (k === "statsTab" && v === "overview");
            if (shouldOmit) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Sync debounced search into URL (resets page)
  useEffect(() => {
    const current = (searchParams.get("q") ?? "").trim();
    if (debouncedQ === current) return;
    patchParams({ q: debouncedQ || null, page: "1" });
  }, [debouncedQ, searchParams, patchParams]);

  const filters: SessionsLibraryFilters = useMemo(
    () => ({
      type,
      sessionKind,
      sim: sim || undefined,
      ingest,
      q: debouncedQ || undefined,
    }),
    [type, sessionKind, sim, ingest, debouncedQ],
  );

  const {
    data: meta,
    isPending: metaLoading,
    error: metaError,
    refetch: refetchMeta,
  } = useQuery({
    queryKey: ["sessions-library", "meta", user?.id, filters],
    queryFn: () => getSessionsLibraryMeta(filters),
    enabled: Boolean(user?.id),
    staleTime: META_STALE_MS,
    // Soft-keep meta when only page changes (filters unchanged).
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prev = previousQuery.queryKey;
      const prevFilters = prev[3];
      if (
        JSON.stringify(prevFilters) === JSON.stringify(filters) &&
        prev[2] === user?.id
      ) {
        return previousData;
      }
      return undefined;
    },
  });

  const {
    data: listData,
    isPending: listLoading,
    isFetching: listFetching,
    error: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: [
      "sessions-library",
      "list",
      user?.id,
      filters,
      page,
      SESSIONS_LIBRARY_DEFAULT_LIMIT,
    ],
    queryFn: () =>
      getSessionsLibraryList({
        ...filters,
        page,
        limit: SESSIONS_LIBRARY_DEFAULT_LIMIT,
      }),
    enabled: Boolean(user?.id),
    // Soft-keep only for page flips within the same filters.
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prev = previousQuery.queryKey;
      if (
        prev[2] === user?.id &&
        JSON.stringify(prev[3]) === JSON.stringify(filters) &&
        prev[5] === SESSIONS_LIBRARY_DEFAULT_LIMIT
      ) {
        return previousData;
      }
      return undefined;
    },
  });

  const needsLazyStats = statsTab !== "overview";
  const { data: statsData, isPending: statsLoading } = useQuery({
    queryKey: ["sessions-library", "stats", statsTab, user?.id, filters],
    queryFn: () => getSessionsLibraryStats(statsTab, filters),
    enabled: Boolean(user?.id) && needsLazyStats,
    staleTime: META_STALE_MS,
  });

  const listErrorMessage = useMemo(
    () =>
      listError
        ? formatQueryError(listError, "Failed to load sessions.")
        : null,
    [listError],
  );

  const metaErrorMessage = useMemo(
    () =>
      metaError
        ? formatQueryError(metaError, "Failed to load session stats.")
        : null,
    [metaError],
  );

  const items = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const totalPages = listData?.totalPages ?? 1;
  const pageSize = listData?.limit ?? SESSIONS_LIBRARY_DEFAULT_LIMIT;
  const listRange =
    total === 0
      ? null
      : {
          start: (page - 1) * pageSize + 1,
          end: Math.min(page * pageSize, total),
        };
  const isEmpty = !listLoading && !listError && items.length === 0;

  const emptyMessage = useMemo(() => {
    if (hasLibrarySubFilters(debouncedQ, sessionKind, sim, ingest)) {
      return "No sessions match these filters.";
    }
    if (type === "manual") return "manual";
    if (type === "telemetry") return "telemetry";
    return "all";
  }, [type, debouncedQ, sessionKind, sim, ingest]);

  const setType = (value: SessionsLibraryTypeFilter) =>
    patchParams({ type: value, page: "1" });
  const setStatsTab = (value: SessionsLibraryStatsTab) =>
    patchParams({ statsTab: value });
  const setView = (value: SessionsLibraryView) => patchParams({ view: value });

  return (
    <>
      <PageMeta
        title={sessionsTitle}
        description={sessionsDescription}
        path={SESSIONS_PATH}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        {user && !isPro && (
          <ProUpgradeCallout
            className="mb-6"
            layout="banner"
            description="Free plan includes the last 3 months of session history. Upgrade to Apex Pro for unlimited history and analytics."
            ctaLabel="View Pro plans"
          />
        )}

        <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
              Sessions
            </h1>
            <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
              Your sim racing library — filter by sim, session type, and upload
              method
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/upload"
              className={`${appPrimaryButtonClassName} inline-flex h-10 items-center px-4`}
            >
              <Upload className="mr-2 size-4" />
              Upload
            </Link>
            <Link
              to="/manual"
              className={`${appOutlineButtonClassName} inline-flex h-10 items-center px-4`}
            >
              <PenLine className="mr-2 size-4" />
              Manual
            </Link>
          </div>
        </section>

        <div className="mb-6">
          {metaLoading ? (
            <SessionsOverviewStatsSkeleton />
          ) : metaErrorMessage ? (
            <div className="rounded-apex-lg border border-apex-error/30 bg-apex-error/10 px-4 py-4 text-center">
              <p className="font-apex-body text-sm text-apex-error">
                {metaErrorMessage}
              </p>
              <button
                type="button"
                onClick={() => void refetchMeta()}
                className={`${appOutlineButtonClassName} mt-3 px-6 py-2`}
              >
                Retry stats
              </button>
            </div>
          ) : (
            <SessionsOverviewStats overview={meta?.overview ?? null} />
          )}
        </div>

        <div
          className="mb-4 inline-flex w-full gap-2 p-1"
          role="tablist"
          aria-label="Stats"
        >
          {STATS_TABS.map((tab) => {
            const isActive = statsTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatsTab(tab.value)}
                className={cn(
                  "flex flex-1 items-center justify-center whitespace-nowrap rounded p-2 font-apex-body text-xs font-bold transition-colors max-[419px]:px-1 max-[419px]:text-[10px] sm:px-3 sm:text-sm",
                  isActive
                    ? "bg-apex-primary text-white"
                    : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mb-6 min-h-[80px]" role="tabpanel">
          {statsTab === "overview" && (
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              Overview KPIs above update with your active filters. Switch tabs
              for weekly goals, racing results, or per-sim breakdowns.
            </p>
          )}
          {statsTab === "weekly" && (
            <SessionsWeeklyStatsPanel
              data={
                (statsData as SessionsLibraryWeeklyStats | undefined) ?? null
              }
              loading={statsLoading}
            />
          )}
          {statsTab === "racing" &&
            (statsLoading ? (
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                Loading racing stats…
              </p>
            ) : (
              <ProfileKeyStats
                profileLocked={false}
                races={
                  (statsData as SessionsLibraryRacingStats | undefined)
                    ?.races ?? 0
                }
                wins={
                  (statsData as SessionsLibraryRacingStats | undefined)?.wins
                }
                podiums={
                  (statsData as SessionsLibraryRacingStats | undefined)?.podiums
                }
                poles={
                  (statsData as SessionsLibraryRacingStats | undefined)?.poles
                }
                totalLaps={
                  (statsData as SessionsLibraryRacingStats | undefined)
                    ?.totalLaps ??
                  (statsData as SessionsLibraryRacingStats | undefined)
                    ?.fastestLaps ??
                  0
                }
                avgFinish={
                  (statsData as SessionsLibraryRacingStats | undefined)
                    ?.avgFinish
                }
              />
            ))}
          {statsTab === "bySim" &&
            (statsLoading ? (
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                Loading stats by sim…
              </p>
            ) : (
              <ProfileStatsByGame
                rows={
                  (statsData as SessionsLibraryBySimStats | undefined)
                    ?.statsByGame ?? []
                }
              />
            ))}
        </div>

        <div
          className="mb-4 inline-flex w-full gap-2 p-1"
          role="tablist"
          aria-label="Session type"
        >
          {TYPE_TABS.map((tab) => {
            const isActive = type === tab.value;
            const count = meta?.filterCounts.byType[tab.value];
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setType(tab.value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded p-2 font-apex-body text-xs font-bold transition-colors max-[419px]:gap-1 max-[419px]:px-1 max-[419px]:text-[10px] sm:px-3 sm:text-sm",
                  isActive
                    ? "bg-apex-primary text-white"
                    : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                )}
              >
                {tab.label}
                {count != null ? (
                  <span
                    className={cn(
                      "tabular-nums text-[10px]",
                      isActive
                        ? "text-white/80"
                        : "text-apex-on-surface-variant/70",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-apex-on-surface-variant" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search track or car…"
              className={cn(FIELD_CLASS, "w-full pl-10 pr-3")}
              aria-label="Search track or car"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto lg:min-w-[420px]">
            <AppNativeSelect
              value={sessionKind}
              onChange={(e) =>
                patchParams({
                  sessionKind: e.target.value,
                  page: "1",
                })
              }
              className="w-full"
              aria-label="Session kind"
            >
              {SESSION_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </AppNativeSelect>
            <AppNativeSelect
              value={sim}
              onChange={(e) =>
                patchParams({ sim: e.target.value || null, page: "1" })
              }
              className="w-full"
              aria-label="Simulator"
            >
              {SIM_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </AppNativeSelect>
            <AppNativeSelect
              value={ingest}
              onChange={(e) =>
                patchParams({ ingest: e.target.value, page: "1" })
              }
              className="w-full"
              aria-label="Upload method"
            >
              {INGEST_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </AppNativeSelect>
          </div>
          <div
            className="inline-flex shrink-0 rounded-lg border border-apex-outline-variant/15 bg-apex-surface-container-low p-1"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-apex-body text-xs transition-colors",
                view === "cards"
                  ? "bg-apex-primary font-bold text-white"
                  : "text-apex-on-surface-variant hover:text-apex-on-surface",
              )}
            >
              <LayoutGrid className="size-3.5" aria-hidden />
              Cards
            </button>
            <button
              type="button"
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-apex-body text-xs transition-colors",
                view === "table"
                  ? "bg-apex-primary font-bold text-white"
                  : "text-apex-on-surface-variant hover:text-apex-on-surface",
              )}
            >
              <List className="size-3.5" aria-hidden />
              Table
            </button>
          </div>
        </div>

        <div className="min-h-[280px]">
          {listLoading && <SessionsListSkeleton />}

          {!listLoading && listErrorMessage && (
            <div className="rounded-apex-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-6 text-center">
              <p className="font-apex-body text-sm text-apex-error">
                {listErrorMessage}
              </p>
              <button
                type="button"
                onClick={() => void refetchList()}
                className={`${appOutlineButtonClassName} mt-4 px-6 py-2`}
              >
                Retry
              </button>
            </div>
          )}

          {!listLoading && !listError && isEmpty && emptyMessage === "all" && (
            <OnboardingEmptyState />
          )}
          {!listLoading &&
            !listError &&
            isEmpty &&
            emptyMessage === "manual" && <EmptyManual />}
          {!listLoading &&
            !listError &&
            isEmpty &&
            emptyMessage === "telemetry" && <EmptyTelemetry />}
          {!listLoading &&
            !listError &&
            isEmpty &&
            emptyMessage !== "all" &&
            emptyMessage !== "manual" &&
            emptyMessage !== "telemetry" && (
              <div className="rounded-apex-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-8 text-center">
                <p className="font-apex-body text-sm text-apex-on-surface-variant">
                  {emptyMessage}
                </p>
              </div>
            )}

          {!listLoading && !listError && !isEmpty && view === "cards" && (
            <div className="space-y-4">
              {items.map((row) => (
                <MySessionCard key={row.id} session={row} />
              ))}
            </div>
          )}

          {!listLoading && !listError && !isEmpty && view === "table" && (
            <SessionsLibraryTable
              items={items}
              loading={false}
              emptyMessage="No sessions yet."
              onOpenSession={(id) => navigate(`/sessions/${id}`)}
            />
          )}

          {!listLoading && !listError && !isEmpty && total > 0 && (
            <div className="mb-4 space-y-3 pt-2">
              {listRange && (
                <p className="text-center font-apex-body text-xs text-apex-on-surface-variant">
                  Showing {listRange.start}–{listRange.end} of {total}
                </p>
              )}
              <DiscussionCommentsPagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => patchParams({ page: String(p) })}
                disabled={listFetching}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
