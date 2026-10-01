import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAdminLeaderboards,
  ADMIN_LEADERBOARD_MAX_LIMIT,
  type AdminLeaderboardUserFilter,
  type LeaderboardRow,
} from "@/lib/api";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { LEADERBOARD_FILTER_SIM_OPTIONS } from "@/lib/leaderboardFilterSims";
import SimBadge from "@/components/SimBadge";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";

const TITLE = `Admin · Global leaderboards | ${COMPANY_NAME}`;

const TAB_METRICS = {
  wins: "wins",
  races: "races",
  podiums: "podiums",
  mostlaps: "totalLaps",
  avgfinish: "avgFinish",
} as const;

type TabKey = keyof typeof TAB_METRICS;

const LIMIT_OPTIONS = [25, 50, 100, 200, 500] as const;

const TAB_LABEL: Record<TabKey, string> = {
  wins: "Most wins",
  races: "Most races",
  podiums: "Podiums",
  mostlaps: "Most laps",
  avgfinish: "Avg finish",
};

const USER_FILTER_OPTIONS: ReadonlyArray<{
  value: AdminLeaderboardUserFilter;
  label: string;
}> = [
  { value: "active", label: "Active only" },
  { value: "withBanned", label: "Include banned" },
  { value: "withDeleted", label: "Include deleted" },
  { value: "all", label: "Include all" },
];

function formatValue(row: LeaderboardRow, metric: string): string {
  if (metric === "avgFinish") {
    const v = row.value;
    if (v == null) return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${Math.round(n)} (${n.toFixed(1)})`;
  }
  const v = row.value;
  return v != null && Number.isFinite(Number(v))
    ? String(Math.floor(Number(v)))
    : "—";
}

export default function AdminLeaderboards() {
  const [activeTab, setActiveTab] = useState<TabKey>("wins");
  const [simFilter, setSimFilter] = useState("");
  const [limit, setLimit] = useState<number>(50);
  const [userFilter, setUserFilter] =
    useState<AdminLeaderboardUserFilter>("active");

  const metric = TAB_METRICS[activeTab];

  const listParams = useMemo(
    () => ({
      metric,
      limit,
      userFilter,
      ...(simFilter.trim() ? { sim: simFilter.trim() } : {}),
    }),
    [metric, limit, simFilter, userFilter],
  );

  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["admin", "globalLeaderboards", listParams],
    queryFn: () => fetchAdminLeaderboards(listParams),
  });

  const rows = data?.rows ?? [];
  const responseSim = data?.sim;
  const updating = isFetching && !isPending;

  return (
    <>
      <PageMeta
        path="/admin/leaderboards"
        title={TITLE}
        description="Inspect global leaderboard metrics."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Global leaderboards
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Derived from race sessions and laps (same rules as the public
              site). Use this to verify rankings and support users. Public page:{" "}
              <Link
                to="/leaderboards"
                className="text-primary underline-offset-4 hover:underline"
              >
                leaderboards
              </Link>{" "}
              (top 10).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={`mr-1.5 size-4 ${updating ? "animate-spin" : ""}`}
                aria-hidden
              />
              Refresh
            </Button>
          </div>
        </div>

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load leaderboards.")}
          </div>
        )}

        <div className="mb-6 overflow-x-auto border-b border-white/10 pb-2">
          <div className="flex min-w-max gap-4 sm:gap-8">
            {(Object.keys(TAB_METRICS) as TabKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`whitespace-nowrap pb-2 text-sm font-semibold transition-all ${
                  activeTab === key
                    ? "border-b-2 border-[rgb(240,28,28)] text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABEL[key]}
              </button>
            ))}
          </div>
        </div>

        {!isError && (
          <div className={ADMIN_TABLE_CARD}>
            <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <select
                  className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={simFilter}
                  onChange={(e) => setSimFilter(e.target.value)}
                  aria-label="Sim filter"
                >
                  <option value="">All sims</option>
                  {LEADERBOARD_FILTER_SIM_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="shrink-0">Users</span>
                  <select
                    className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm text-foreground"
                    value={userFilter}
                    onChange={(e) =>
                      setUserFilter(
                        e.target.value as AdminLeaderboardUserFilter,
                      )
                    }
                    aria-label="User filter"
                  >
                    {USER_FILTER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="shrink-0">Rows</span>
                  <select
                    className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm text-foreground"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    aria-label="Row limit"
                  >
                    {LIMIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-white/40">
                    (max {ADMIN_LEADERBOARD_MAX_LIMIT})
                  </span>
                </label>
                {responseSim && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    Filter: <SimBadge sim={responseSim} size="sm" />
                  </span>
                )}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                {isPending
                  ? "Loading…"
                  : `${rows.length} driver${rows.length === 1 ? "" : "s"}`}
                {updating && " · Updating…"}
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
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                No rows for this metric and filter.
              </div>
            ) : (
              <div className={ADMIN_TABLE_SCROLL}>
                <table className={adminTable("min-w-[36rem]")}>
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className={ADMIN_TH}>Rank</th>
                      <th className={ADMIN_TH}>Driver</th>
                      <th className={ADMIN_TH}>Value</th>
                      <th className={`${ADMIN_TH} font-mono text-xs`}>
                        User ID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${row.rank}-${row.userId}`}
                        className="border-b border-white/5"
                      >
                        <td
                          className={`${ADMIN_TD} tabular-nums text-foreground`}
                        >
                          {row.rank}
                        </td>
                        <td className={ADMIN_TD}>
                          <Link
                            to={`/user/${encodeURIComponent(row.userId ?? "")}`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {row.displayName || "—"}
                          </Link>
                        </td>
                        <td
                          className={`${ADMIN_TD} tabular-nums text-foreground`}
                        >
                          {formatValue(row, metric)}
                        </td>
                        <td
                          className={`${ADMIN_TD} font-mono text-xs text-muted-foreground`}
                        >
                          {row.userId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 rounded-xl border border-white/10 p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
            How these metrics are computed
          </h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>
              Rankings are{" "}
              <strong className="text-foreground/90">computed on demand</strong>{" "}
              from <code className="text-xs">Session</code> and{" "}
              <code className="text-xs">Lap</code> rows; there is no separate
              leaderboard table to edit.
            </li>
            <li>
              Wins, races, podiums, and average finish only count{" "}
              <strong className="text-foreground/90">race-type sessions</strong>
              : telemetry <code className="text-xs">RACE</code> /{" "}
              <code className="text-xs">SPRINT</code>, or manual activities with
              session kind Race (
              <code className="text-xs">MANUAL_ACTIVITY</code> +{" "}
              <code className="text-xs">manualSessionKind = RACE</code>).
            </li>
            <li>
              Wins, podiums, and average finish require a{" "}
              <strong className="text-foreground/90">
                valid finish position
              </strong>{" "}
              (position within grid when grid size is known).
            </li>
            <li>
              Most laps uses each user&apos;s{" "}
              <strong className="text-foreground/90">
                sum of session lap counts
              </strong>{" "}
              (<code className="text-xs">SUM(lapCount)</code>) across eligible
              sessions of{" "}
              <strong className="text-foreground/90">all session types</strong>{" "}
              (practice, qualifying, race, etc.), still under ingest and
              ingest-time eligibility filters (historical Pro sessions stay
              ranked after expiry).
            </li>
            <li>
              The public site shows the top{" "}
              <strong className="text-foreground/90">10</strong> drivers per
              tab; this admin view can load up to{" "}
              <strong className="text-foreground/90">
                {ADMIN_LEADERBOARD_MAX_LIMIT}
              </strong>{" "}
              rows for investigation.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
