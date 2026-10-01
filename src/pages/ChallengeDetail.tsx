import { useState, useEffect, useCallback, lazy, Suspense, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { formatSimEnum } from "@/lib/enumFormat";
import {
  getChallenge,
  getChallengeLeaderboard,
  getChallengeEntrantSessions,
  joinChallenge,
  leaveChallenge,
  type ChallengeApiStatus,
} from "@/lib/api/challenges";
import { ApiError, withRequestId } from "@/lib/api/errors";
import { formatChallengeDateTime } from "@/lib/datetime";
import { cn, formatTrackName } from "@/lib/utils";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { useAuth } from "@/contexts/AuthContext";
import ChallengeDetailHero, {
  challengeStatusLabel,
} from "@/pages/challenges/ChallengeDetailHero";
import ChallengeDetailOverview from "@/pages/challenges/ChallengeDetailOverview";
import ChallengeDetailSkeleton from "@/pages/challenges/ChallengeDetailSkeleton";
import { ChallengeLiveTimeProvider } from "@/pages/challenges/ChallengeLiveTime";
import { challengeLiveRefetchIntervalMs } from "@/hooks/useChallengeLiveState";
import {
  challengeDetailQueryKey,
} from "@/lib/challenges/challengeDetailPrefetch";

const ChallengeDetailLeaderboard = lazy(
  () => import("@/pages/challenges/ChallengeDetailLeaderboard"),
);
const ChallengeDetailSessions = lazy(
  () => import("@/pages/challenges/ChallengeDetailSessions"),
);

const CHALLENGES_PATH = "/challenges";
const LEADERBOARD_PAGE_SIZE = 20;
const SESSIONS_PAGE_SIZE = 20;

const PAGE_SHELL_CLASS =
  "mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8";

type Tab = "overview" | "leaderboard" | "sessions";

const TAB_CONFIG: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "sessions", label: "Session links" },
];

function ChallengesBackLink() {
  return (
    <Link
      to={CHALLENGES_PATH}
      className="inline-flex items-center gap-1.5 font-apex-body text-sm text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
    >
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      Challenges
    </Link>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className={PAGE_SHELL_CLASS}>
      <ChallengesBackLink />
      {children}
    </div>
  );
}

function TabPanelFallback() {
  return (
    <p className="py-6 font-apex-body text-sm text-apex-on-surface-variant">
      Loading…
    </p>
  );
}

export default function ChallengeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [joinBanMessage, setJoinBanMessage] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const userKey = user?.id?.trim() || "anon";

  useEffect(() => {
    setLeaderboardPage(1);
    setSessionsPage(1);
    setJoinBanMessage(null);
    setLeaveError(null);
    setConfirmingLeave(false);
  }, [id]);

  const {
    data: challenge,
    isPending: loading,
    error: queryError,
    isError,
    refetch: refetchChallenge,
  } = useQuery({
    queryKey: challengeDetailQueryKey(id ?? "", userKey),
    queryFn: async () => {
      if (!id) throw new Error("Missing challenge ID");
      const data = await getChallenge(id);
      if (!data) throw new Error("Challenge not found");
      return data;
    },
    enabled: Boolean(id) && !authLoading,
    refetchInterval: (query) =>
      challengeLiveRefetchIntervalMs(query.state.data?.status),
  });

  useEffect(() => {
    if (tab !== "sessions") return;
    if (!user || (challenge != null && !challenge.joined)) {
      setTab("overview");
    }
  }, [tab, user, challenge]);

  const onBoundaryCrossed = useCallback(() => {
    void refetchChallenge();
    void queryClient.invalidateQueries({ queryKey: ["challenges", "list"] });
    void queryClient.invalidateQueries({ queryKey: ["challenges", "meta"] });
    if (id) {
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "leaderboard", id],
      });
    }
  }, [refetchChallenge, queryClient, id]);

  const {
    data: leaderboardData,
    isPending: leaderboardLoading,
    isFetching: leaderboardFetching,
  } = useQuery({
    queryKey: ["challenges", "leaderboard", id, leaderboardPage],
    queryFn: () =>
      getChallengeLeaderboard(id!, leaderboardPage, LEADERBOARD_PAGE_SIZE),
    enabled: Boolean(id) && tab === "leaderboard",
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prev = previousQuery.queryKey;
      if (prev[2] === id) return previousData;
      return undefined;
    },
    refetchInterval: () => {
      if (challenge?.status !== "ACTIVE" || tab !== "leaderboard") return false;
      if (typeof document !== "undefined" && document.hidden) return false;
      return 15_000;
    },
  });

  const {
    data: sessionsData,
    isPending: sessionsLoading,
    isFetching: sessionsFetching,
    error: sessionsError,
  } = useQuery({
    queryKey: ["challenges", "entrant-sessions", id, sessionsPage],
    queryFn: () =>
      getChallengeEntrantSessions(id!, sessionsPage, SESSIONS_PAGE_SIZE),
    enabled:
      Boolean(id) &&
      tab === "sessions" &&
      Boolean(user) &&
      Boolean(challenge?.joined),
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prev = previousQuery.queryKey;
      if (prev[2] === id) return previousData;
      return undefined;
    },
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const joinMutation = useMutation({
    mutationFn: () => joinChallenge(id!),
    onSuccess: () => {
      setJoinBanMessage(null);
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "detail", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "summary"],
      });
    },
    onError: (e) => {
      if (
        e instanceof ApiError &&
        e.status === 403 &&
        (e.code === "BANNED" || e.message === "banned")
      ) {
        setJoinBanMessage(
          withRequestId(
            e.message && e.message !== "banned"
              ? e.message
              : "You are banned from this challenge",
            e,
          ),
        );
      }
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveChallenge(id!),
    onSuccess: () => {
      setLeaveError(null);
      setConfirmingLeave(false);
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "detail", id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "summary"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "list"],
      });
    },
    onError: (e) => {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        (e.code === "HAS_POSTS" || e.message === "has_posts")
      ) {
        setLeaveError(
          withRequestId(
            e.message && e.message !== "has_posts"
              ? e.message
              : "You have already posted to this challenge — leaving is no longer allowed.",
            e,
          ),
        );
      } else if (e instanceof Error) {
        setLeaveError(withRequestId(e.message || "Failed to leave challenge", e));
      } else {
        setLeaveError(withRequestId("Failed to leave challenge", e));
      }
      setConfirmingLeave(false);
    },
  });

  const error = isError
    ? withRequestId(
        queryError instanceof Error
          ? queryError.message
          : "Failed to load challenge",
        queryError,
      )
    : null;

  const detailPath = id ? `/challenge/${id}` : CHALLENGES_PATH;

  if (!id) {
    return (
      <>
        <PageMeta
          title={`Challenges | ${COMPANY_NAME}`}
          description={`Sim racing challenges on ${COMPANY_NAME}.`}
          path={CHALLENGES_PATH}
          noindex
        />
        <PageShell>
          <p className="font-apex-body text-sm text-apex-on-surface-variant">
            Missing challenge ID
          </p>
        </PageShell>
      </>
    );
  }

  if ((loading || authLoading) && !challenge) {
    return (
      <>
        <PageMeta
          title={`Challenge | ${COMPANY_NAME}`}
          description={`Loading challenge on ${COMPANY_NAME}.`}
          path={detailPath}
        />
        <PageShell>
          <ChallengeDetailSkeleton />
        </PageShell>
      </>
    );
  }

  if ((error || !challenge) && !loading) {
    return (
      <>
        <PageMeta
          title={`Challenge | ${COMPANY_NAME}`}
          description={error ?? "Challenge not found."}
          path={detailPath}
          noindex
        />
        <PageShell>
          <p className="font-apex-body text-sm text-apex-on-surface-variant">
            {error ?? "Challenge not found."}
          </p>
        </PageShell>
      </>
    );
  }

  if (!challenge) {
    return (
      <>
        <PageMeta
          title={`Challenge | ${COMPANY_NAME}`}
          description={`Loading challenge on ${COMPANY_NAME}.`}
          path={detailPath}
        />
        <PageShell>
          <ChallengeDetailSkeleton />
        </PageShell>
      </>
    );
  }

  if (challenge.banned) {
    const banText = challenge.banReason
      ? `You are banned from this challenge for this reason: ${challenge.banReason}`
      : "You are banned from this challenge";
    return (
      <>
        <PageMeta
          title={`${challenge.title} | ${COMPANY_NAME}`}
          description={banText}
          path={detailPath}
          noindex
        />
        <PageShell>
          <div className="rounded-apex-lg border border-apex-error/30 bg-apex-error/10 p-6 font-apex-body text-sm text-apex-error">
            <h1 className="mb-2 font-apex-headline text-lg font-semibold text-apex-on-surface">
              {challenge.title}
            </h1>
            <p>{banText}</p>
          </div>
        </PageShell>
      </>
    );
  }

  const status = challengeStatusLabel(challenge.status as ChallengeApiStatus);
  const upcomingScheduleText =
    challenge.status === "UPCOMING" && challenge.startsAt
      ? `Starts ${formatChallengeDateTime(challenge.startsAt)}`
      : null;

  const challengeDesc =
    challenge.description?.trim() ||
    `${formatSimEnum(challenge.sim)} · ${formatTrackName(challenge.track)} — ${COMPANY_NAME} challenge.`;

  const canJoin = Boolean(
    user && !challenge.joined && challenge.status !== "ENDED",
  );

  const canLeave = Boolean(user && challenge.joined && challenge.canLeave);
  const showLeaveLockedHint = Boolean(
    user && challenge.joined && challenge.canLeave === false,
  );

  const showSessionsTab = Boolean(user && challenge.joined);

  const visibleTabs = TAB_CONFIG.filter(
    ({ key }) => key !== "sessions" || showSessionsTab,
  );

  const followPreview = challenge.followedWhoJoined ?? [];
  const followMore = challenge.followedWhoJoinedMoreCount ?? 0;

  return (
    <>
      <PageMeta
        title={`${challenge.title} | ${COMPANY_NAME}`}
        description={`${challengeDesc.slice(0, 160)}${challengeDesc.length > 160 ? "…" : ""}`}
        path={detailPath}
        ogType="article"
      />
      <PageShell>
        <ChallengeLiveTimeProvider
          status={challenge.status}
          startsAt={challenge.startsAt}
          endsAt={challenge.endsAt}
          onBoundaryCrossed={onBoundaryCrossed}
        >
          <ChallengeDetailHero
            challenge={challenge}
            status={status}
            isLoggedIn={Boolean(user)}
            canJoin={canJoin}
            canLeave={canLeave}
            showLeaveLockedHint={showLeaveLockedHint}
            joinPending={joinMutation.isPending}
            leavePending={leaveMutation.isPending}
            joinBanMessage={joinBanMessage}
            leaveError={leaveError}
            confirmingLeave={confirmingLeave}
            onJoin={() => joinMutation.mutate()}
            onConfirmLeave={() => leaveMutation.mutate()}
            onCancelLeave={() => setConfirmingLeave(false)}
            onStartLeave={() => {
              setLeaveError(null);
              setConfirmingLeave(true);
            }}
          />

          {(followPreview.length > 0 || followMore > 0) && (
            <div className="rounded-2xl border border-apex-outline-variant/15 bg-apex-surface-container px-4 py-3 font-apex-body text-sm text-apex-on-surface-variant">
              <span className="text-apex-on-surface">
                {followPreview.map((f) => f.displayName).join(", ")}
                {followMore > 0
                  ? `${followPreview.length > 0 ? " " : ""}+${followMore} more`
                  : ""}
              </span>{" "}
              {followPreview.length + followMore === 1 ? "has" : "have"} joined —
              compete with people you follow.
            </div>
          )}

          <section className="flex gap-2 overflow-x-auto pb-1">
            {visibleTabs.map(({ key, label }) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={cn(
                    "shrink-0 rounded-apex-sm px-4 py-2 font-apex-body text-xs font-bold transition-colors",
                    isActive
                      ? "bg-apex-primary text-white"
                      : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </section>

          {tab === "overview" && (
            <ChallengeDetailOverview
              challenge={challenge}
              challengeId={id}
              status={status}
              upcomingScheduleText={upcomingScheduleText}
            />
          )}

          {tab === "leaderboard" && (
            <Suspense fallback={<TabPanelFallback />}>
              <ChallengeDetailLeaderboard
                loading={leaderboardLoading}
                data={leaderboardData}
                page={leaderboardPage}
                pageSize={LEADERBOARD_PAGE_SIZE}
                fetching={leaderboardFetching}
                onPageChange={setLeaderboardPage}
              />
            </Suspense>
          )}

          {tab === "sessions" && showSessionsTab && (
            <Suspense fallback={<TabPanelFallback />}>
              <ChallengeDetailSessions
                signedIn={Boolean(user)}
                loading={sessionsLoading}
                data={sessionsData}
                error={sessionsError}
                page={sessionsPage}
                pageSize={SESSIONS_PAGE_SIZE}
                fetching={sessionsFetching}
                onPageChange={setSessionsPage}
              />
            </Suspense>
          )}
        </ChallengeLiveTimeProvider>
      </PageShell>
    </>
  );
}
