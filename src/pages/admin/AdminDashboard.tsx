import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  useQueries,
  useQueryClient,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import {
  apiErrorText,
  fetchAdminAccountsMetrics,
  fetchAdminAuthSignalsMetrics,
  fetchAdminCommunityMetrics,
  fetchAdminCompetitionMetrics,
  fetchAdminAuthSessionsMetrics,
  fetchAdminRacingMetrics,
  fetchAdminSocialMetrics,
  type AccountsMetrics,
  type AuthSignalsMetrics,
  type CommunityMetrics,
  type CompetitionMetrics,
  type AuthSessionsMetrics,
  type RacingMetrics,
  type SocialMetrics,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SkeletonBlock } from "@/components/ui/skeleton";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { cn } from "@/lib/utils";

const SECTION_STALE_TIME_MS = 60_000;

type SectionKey =
  | "accounts"
  | "racing"
  | "authSessions"
  | "community"
  | "social"
  | "competition"
  | "authSignals";

type SectionDataMap = {
  accounts: AccountsMetrics;
  racing: RacingMetrics;
  authSessions: AuthSessionsMetrics;
  community: CommunityMetrics;
  social: SocialMetrics;
  competition: CompetitionMetrics;
  authSignals: AuthSignalsMetrics;
};

function formatInt(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/**
 * Coarse refresh labels (no per-second counter). Updates only at bucket boundaries.
 */
function formatStableRefreshSuffix(msAgo: number): string {
  if (msAgo < 30_000) return "just now";
  if (msAgo < 60_000) return "30 seconds ago";
  const minutesTotal = Math.floor(msAgo / 60_000);
  if (minutesTotal < 60) return `${minutesTotal} min`;
  const hoursTotal = Math.floor(msAgo / 3_600_000);
  if (hoursTotal < 24) return `${hoursTotal} hr`;
  const daysTotal = Math.floor(msAgo / 86_400_000);
  return daysTotal === 1 ? "1 day" : `${daysTotal} days`;
}

/** Milliseconds until `formatStableRefreshSuffix` would return a different string. */
function msUntilNextStableRefreshSuffix(dataUpdatedAt: number): number {
  const msAgo = Date.now() - dataUpdatedAt;
  if (msAgo < 0) return 250;

  if (msAgo < 30_000) return 30_000 - msAgo;
  if (msAgo < 60_000) return 60_000 - msAgo;

  const minutesTotal = Math.floor(msAgo / 60_000);
  if (minutesTotal < 60) return (minutesTotal + 1) * 60_000 - msAgo;

  const hoursTotal = Math.floor(msAgo / 3_600_000);
  if (hoursTotal < 24) return (hoursTotal + 1) * 3_600_000 - msAgo;

  const daysTotal = Math.floor(msAgo / 86_400_000);
  return (daysTotal + 1) * 86_400_000 - msAgo;
}

/**
 * Shows "just now" → "30 seconds ago" → "1 min" → "2 min" → … with updates only when the label changes.
 */
function useStableRefreshSuffix(dataUpdatedAt: number): string {
  const [suffix, setSuffix] = useState(() =>
    dataUpdatedAt ? formatStableRefreshSuffix(Date.now() - dataUpdatedAt) : "",
  );

  useEffect(() => {
    if (!dataUpdatedAt) {
      setSuffix("");
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const bump = () => {
      if (cancelled) return;
      const msAgo = Date.now() - dataUpdatedAt;
      setSuffix(formatStableRefreshSuffix(msAgo));
      const wait = msUntilNextStableRefreshSuffix(dataUpdatedAt);
      timeoutId = window.setTimeout(
        bump,
        Math.min(Math.max(wait, 250), 86_400_000 * 366),
      );
    };

    bump();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [dataUpdatedAt]);

  return suffix;
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/30 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  query,
}: {
  title: string;
  query: UseQueryResult<unknown>;
}) {
  const refreshSuffix = useStableRefreshSuffix(query.dataUpdatedAt);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {query.isSuccess && query.dataUpdatedAt > 0 && refreshSuffix && (
          <span>Refreshed {refreshSuffix}</span>
        )}
        {query.isFetching && query.isSuccess && (
          <span className="inline-flex items-center gap-1 text-foreground/70">
            <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
            Refreshing…
          </span>
        )}
      </div>
    </div>
  );
}

function SectionSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

function SectionError({ error }: { error: unknown }) {
  const message =
    apiErrorText(error, "Could not load this section. Try again later.");
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

function MetricsSection<K extends SectionKey>({
  title,
  cardCount,
  query,
  children,
}: {
  title: string;
  cardCount: number;
  query: UseQueryResult<SectionDataMap[K]>;
  children: (data: SectionDataMap[K]) => React.ReactNode;
}) {
  return (
    <section>
      <SectionHeader title={title} query={query} />
      {query.isPending ? (
        <SectionSkeleton count={cardCount} />
      ) : query.isError ? (
        <SectionError error={query.error} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {children(query.data)}
        </div>
      )}
    </section>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  const [
    accountsQ,
    racingQ,
    authSessionsQ,
    communityQ,
    socialQ,
    competitionQ,
    authSignalsQ,
  ] = useQueries({
    queries: [
      {
        queryKey: ["admin", "metrics", "accounts"],
        queryFn: fetchAdminAccountsMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<AccountsMetrics>,
      {
        queryKey: ["admin", "metrics", "racing"],
        queryFn: fetchAdminRacingMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<RacingMetrics>,
      {
        queryKey: ["admin", "metrics", "authSessions"],
        queryFn: fetchAdminAuthSessionsMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<AuthSessionsMetrics>,
      {
        queryKey: ["admin", "metrics", "community"],
        queryFn: fetchAdminCommunityMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<CommunityMetrics>,
      {
        queryKey: ["admin", "metrics", "social"],
        queryFn: fetchAdminSocialMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<SocialMetrics>,
      {
        queryKey: ["admin", "metrics", "competition"],
        queryFn: fetchAdminCompetitionMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<CompetitionMetrics>,
      {
        queryKey: ["admin", "metrics", "auth-signals"],
        queryFn: fetchAdminAuthSignalsMetrics,
        staleTime: SECTION_STALE_TIME_MS,
      } satisfies UseQueryOptions<AuthSignalsMetrics>,
    ],
  }) as [
    UseQueryResult<AccountsMetrics>,
    UseQueryResult<RacingMetrics>,
    UseQueryResult<AuthSessionsMetrics>,
    UseQueryResult<CommunityMetrics>,
    UseQueryResult<SocialMetrics>,
    UseQueryResult<CompetitionMetrics>,
    UseQueryResult<AuthSignalsMetrics>,
  ];

  const anySectionFetching =
    accountsQ.isFetching ||
    racingQ.isFetching ||
    authSessionsQ.isFetching ||
    communityQ.isFetching ||
    socialQ.isFetching ||
    competitionQ.isFetching ||
    authSignalsQ.isFetching;

  const title = `Admin · Overview | ${COMPANY_NAME}`;

  return (
    <>
      <PageMeta
        path="/admin"
        title={title}
        description="Administrator overview and platform metrics."
        noindex
      />
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Platform metrics and activity at a glance.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={anySectionFetching}
            onClick={() => {
              void queryClient.invalidateQueries({
                queryKey: ["admin", "metrics"],
              });
            }}
          >
            <RefreshCw
              className={cn("size-4", anySectionFetching && "animate-spin")}
              aria-hidden
            />
            Refresh all
          </Button>
        </div>

        <div className="space-y-10">
          <MetricsSection<"accounts">
            title="Accounts"
            cardCount={4}
            query={accountsQ}
          >
            {(m) => (
              <>
                <MetricCard
                  label="Registered users"
                  value={formatInt(m.usersTotal)}
                />
                <MetricCard
                  label="Active (non-deleted)"
                  value={formatInt(m.usersActiveNonDeleted)}
                />
                <MetricCard
                  label="New signups (7 days)"
                  value={formatInt(m.usersNewLast7Days)}
                />
                <MetricCard
                  label="Admin users"
                  value={formatInt(m.usersAdmins)}
                />
              </>
            )}
          </MetricsSection>

          <MetricsSection<"racing">
            title="Racing data"
            cardCount={5}
            query={racingQ}
          >
            {(m) => (
              <>
                <MetricCard
                  label="Sessions"
                  value={formatInt(m.sessionsTotal)}
                />
                <MetricCard label="Laps" value={formatInt(m.lapsTotal)} />
                <MetricCard
                  label="Personal bests"
                  value={formatInt(m.personalBestsTotal)}
                />
                <MetricCard
                  label="Session likes"
                  value={formatInt(m.sessionLikesTotal)}
                />
                <MetricCard
                  label="Session comments"
                  value={formatInt(m.sessionCommentsTotal)}
                />
              </>
            )}
          </MetricsSection>

          <MetricsSection<"authSessions">
            title="Agent & sessions"
            cardCount={2}
            query={authSessionsQ}
          >
            {(m) => (
              <>
                <MetricCard
                  label="Auth sessions (all)"
                  value={formatInt(m.authSessionsTotal)}
                />
                <MetricCard
                  label="Auth sessions (active)"
                  value={formatInt(m.authSessionsActive)}
                />
              </>
            )}
          </MetricsSection>

          <MetricsSection<"community">
            title="Community"
            cardCount={4}
            query={communityQ}
          >
            {(m) => (
              <>
                <MetricCard
                  label="Discussions"
                  value={formatInt(m.discussionsTotal)}
                />
                <MetricCard
                  label="Discussion comments"
                  value={formatInt(m.discussionCommentsTotal)}
                />
                <MetricCard
                  label="Discussion likes"
                  value={formatInt(m.discussionLikesTotal)}
                />
                <MetricCard
                  label="Discussion views"
                  value={formatInt(m.discussionViewsTotal)}
                />
              </>
            )}
          </MetricsSection>

          <MetricsSection<"social">
            title="Social"
            cardCount={3}
            query={socialQ}
          >
            {(m) => (
              <>
                <MetricCard label="Follows" value={formatInt(m.followsTotal)} />
                <MetricCard
                  label="Follow requests"
                  value={formatInt(m.followRequestsTotal)}
                />
                <MetricCard
                  label="Notifications"
                  value={formatInt(m.notificationsTotal)}
                />
              </>
            )}
          </MetricsSection>

          <MetricsSection<"competition">
            title="Subscriptions & challenges"
            cardCount={12}
            query={competitionQ}
          >
            {(m) => (
              <>
                <MetricCard
                  label="Pro access (active)"
                  value={formatInt(m.proAccessActive)}
                />
                <MetricCard
                  label="Cancel at period end"
                  value={formatInt(m.proCanceledAtPeriodEnd)}
                />
                <MetricCard label="Past due" value={formatInt(m.proPastDue)} />
                <MetricCard
                  label="Expired subscriptions"
                  value={formatInt(m.proExpired)}
                />
                <MetricCard
                  label="Pro new (7d)"
                  value={formatInt(m.proNewLast7d)}
                />
                <MetricCard
                  label="Churned (7d)"
                  value={formatInt(m.proChurnedLast7d)}
                />
                <MetricCard
                  label="Monthly (active)"
                  value={formatInt(m.byIntervalMonthly)}
                />
                <MetricCard
                  label="Annual (active)"
                  value={formatInt(m.byIntervalAnnual)}
                />
                <MetricCard
                  label="Stale sync (&gt;24h)"
                  value={formatInt(m.staleSyncCount)}
                />
                <MetricCard
                  label="Challenge joins"
                  value={formatInt(m.challengeJoinsTotal)}
                />
                <MetricCard
                  label="Challenges with joins"
                  value={formatInt(m.challengesWithJoins)}
                />
                <div className="flex items-end sm:col-span-2 lg:col-span-4">
                  <Link
                    to="/admin/subscriptions"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    View all subscriptions →
                  </Link>
                </div>
              </>
            )}
          </MetricsSection>

          <MetricsSection<"authSignals">
            title="Auth & support signals"
            cardCount={2}
            query={authSignalsQ}
          >
            {(m) => (
              <>
                <MetricCard
                  label="Email verification codes"
                  value={formatInt(m.emailCodesTotal)}
                />
                <MetricCard
                  label="Pending password resets"
                  value={formatInt(m.passwordResetCodesPending)}
                />
              </>
            )}
          </MetricsSection>
        </div>
      </div>
    </>
  );
}
