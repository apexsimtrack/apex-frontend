import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getLeaderboards, type LeaderboardRow } from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import PageMeta from "@/components/PageMeta";
import UserAvatar from "@/components/UserAvatar";
import { STATIC_SEO } from "@/config/seoMeta";
import LeaderboardsListSkeleton from "@/pages/leaderboards/LeaderboardsListSkeleton";

const LEADERBOARDS_PATH = STATIC_SEO.leaderboards.path;

const TAB_METRICS = {
  wins: "wins",
  races: "races",
  podiums: "podiums",
  mostlaps: "totalLaps",
  avgfinish: "avgFinish",
} as const;

type TabKey = keyof typeof TAB_METRICS;

const TAB_CONFIG: Record<TabKey, { label: string; suffix: string }> = {
  wins: { label: "Most Wins", suffix: "WINS" },
  races: { label: "Most Races", suffix: "RACES" },
  podiums: { label: "Podiums", suffix: "PODIUMS" },
  mostlaps: { label: "Most Laps", suffix: "LAPS" },
  avgfinish: { label: "Avg Finish", suffix: "AVG" },
};

const LB_LIMIT = 10;

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

function rankBadgeClassName(rank: number): string {
  if (rank === 1) return "bg-[#ffd700] text-black";
  if (rank === 2) return "bg-silver text-black";
  if (rank === 3) return "bg-bronze text-black";
  return "bg-[#3a3a3a] text-white";
}

export default function Leaderboards() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("wins");

  const metric = TAB_METRICS[activeTab];
  const metricSuffix = TAB_CONFIG[activeTab].suffix;

  const {
    data: rows = [],
    isPending: loading,
    isFetching,
    error,
    isError,
  } = useQuery({
    queryKey: ["leaderboards", metric, LB_LIMIT],
    queryFn: async () => {
      const data = await getLeaderboards(metric, LB_LIMIT);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 90_000,
    refetchOnWindowFocus: false,
  });

  const updating = isFetching && !loading;
  const err =
    error instanceof Error
      ? withRequestId(error.message, error)
      : isError
        ? withRequestId("Failed to load leaderboard.", error)
        : null;

  return (
    <>
      <PageMeta
        title={STATIC_SEO.leaderboards.title}
        description={STATIC_SEO.leaderboards.description}
        path={LEADERBOARDS_PATH}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <section className="mb-5">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Leaderboards
          </h1>
          <p className="mt-1 font-apex-body text-[10px] font-semibold uppercase tracking-widest text-apex-on-surface-variant">
            Compete and climb the rankings
          </p>
        </section>

        <section className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(TAB_CONFIG) as TabKey[]).map((tabKey) => {
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={cn(
                  "shrink-0 rounded-apex-sm px-4 py-2 font-apex-body text-xs font-bold transition-colors",
                  isActive
                    ? "bg-apex-primary text-white"
                    : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                )}
              >
                {TAB_CONFIG[tabKey].label}
              </button>
            );
          })}
        </section>

        {loading ? (
          <LeaderboardsListSkeleton />
        ) : (
          <section className="rounded-xl bg-apex-surface-container-low p-2">
            {updating && rows.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1.5 font-apex-body text-xs text-apex-on-surface-variant">
                <Loader2
                  className="size-3.5 animate-spin text-apex-primary"
                  aria-hidden
                />
                Refreshing standings…
              </div>
            )}

            {isError && (
              <p className="px-2 py-8 font-apex-body text-sm text-apex-on-surface-variant">
                {err}
              </p>
            )}

            {!isError && rows.length === 0 && (
              <p className="px-2 py-8 font-apex-body text-sm text-apex-on-surface-variant">
                No rankings yet.
              </p>
            )}

            {!isError && rows.length > 0 && (
              <div
                className={cn(updating && "pointer-events-none opacity-60")}
                aria-busy={updating || undefined}
              >
                {rows.map((row, index) => {
                  const rank = row.rank ?? index + 1;
                  const name = row.displayName ?? "";
                  const value = formatValue(row, metric ?? "wins");
                  const uid = row.userId?.trim();
                  const isTopThree = rank <= 3;

                  return (
                    <button
                      key={`${rank}-${name}-${index}`}
                      type="button"
                      onClick={() => {
                        if (uid) {
                          navigate(`/user/${encodeURIComponent(uid)}`);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-apex-outline-variant/10 px-2 py-3 text-left transition-colors last:border-b-0 hover:bg-apex-surface-container-high/50",
                        !uid && "cursor-default",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-xl font-apex-headline text-xs font-bold",
                          rankBadgeClassName(rank),
                        )}
                      >
                        {rank}
                      </div>

                      <UserAvatar
                        name={name || "Driver"}
                        size="md"
                        className="rounded-xl ring-apex-outline-variant/30"
                      />

                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate font-apex-body text-sm",
                          isTopThree
                            ? "font-bold text-apex-on-surface"
                            : "font-medium text-apex-on-surface",
                        )}
                      >
                        {name || "—"}
                      </p>

                      <p className="shrink-0 font-apex-headline font-bold text-apex-primary">
                        {value}
                        <span className="ml-1 font-apex-body text-[10px] font-medium text-apex-on-surface-variant">
                          {metricSuffix}
                        </span>
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
