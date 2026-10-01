import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trophy } from "lucide-react";
import ChallengeFeaturedHero from "@/pages/challenges/ChallengeFeaturedHero";
import ChallengeBrowseRow from "@/pages/challenges/ChallengeBrowseRow";
import ChallengeBrowseListSkeleton from "@/pages/challenges/ChallengeBrowseListSkeleton";
import ChallengesSeasonStats from "@/pages/challenges/ChallengesSeasonStats";
import ChallengesSeasonStatsSkeleton from "@/pages/challenges/ChallengesSeasonStatsSkeleton";
import AppListPaginationFooter from "@/components/app-ui/AppListPaginationFooter";
import AppNativeSelect from "@/components/app-ui/AppNativeSelect";
import {
  getChallengeList,
  getChallengesMeta,
  getChallengesSeasonRank,
  getChallengesSocialPreview,
  joinChallenge,
  type ChallengeListParams,
  type ChallengesMeta,
} from "@/lib/api/challenges";
import { withRequestId } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { STATIC_SEO } from "@/config/seoMeta";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthRedirectState } from "@/auth/authRedirect";
import { AUTH_PATHS } from "@/config/navigation";
import { MANUAL_ACTIVITY_SIMS } from "@/lib/manualActivityData";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { challengeLiveRefetchIntervalMs } from "@/hooks/useChallengeLiveState";
import { useAfterFirstPaint } from "@/hooks/useAfterFirstPaint";
import { useSharedNowMs } from "@/hooks/useSharedNowMs";

const CHALLENGES_PATH = STATIC_SEO.challenges.path;

const PAGE_SIZE = 12;
const SKELETON_ROW_COUNT = 5;
const META_STALE_MS = 5 * 60_000;

const TAB_CONFIG = [
  ["upcoming", "Upcoming"],
  ["live", "Live"],
  ["past", "Past"],
  ["joined", "Joined"],
] as const;

type BrowseTab = (typeof TAB_CONFIG)[number][0];

const TAB_SECTION_LABEL: Record<BrowseTab, string> = {
  upcoming: "Upcoming challenges",
  live: "Live challenges",
  past: "Past challenges",
  joined: "Joined challenges",
};

/** Community-style fields; radius stays `rounded-apex-sm`; height matches `AppNativeSelect` (`h-12`). */
const CHALLENGES_FIELD_CLASS =
  "h-12 rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container font-apex-body text-sm text-apex-on-surface transition-colors placeholder:text-apex-on-surface-variant/60 focus:border-apex-primary/40 focus:outline-none";

function listParamsForTab(tab: BrowseTab): ChallengeListParams {
  switch (tab) {
    case "upcoming":
      return { status: "UPCOMING", sort: "startsAtAsc" };
    case "live":
      return { status: "ACTIVE", sort: "startsAtDesc" };
    case "past":
      return { status: "ENDED", sort: "startsAtDesc" };
    case "joined":
      return { joinedOnly: true, sort: "startsAtDesc" };
    default:
      return {};
  }
}

export default function Challenges() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [joinError, setJoinError] = useState<string | null>(null);
  /** Provisional "upcoming" so list can start in parallel with meta. */
  const [tab, setTab] = useState<BrowseTab | null>("upcoming");
  const userPickedTabRef = useRef(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedQ = useDebouncedValue(searchInput.trim(), 300);
  const [simFilter, setSimFilter] = useState<string>("");
  const [carClassFilter, setCarClassFilter] = useState("");
  const debouncedCarClass = useDebouncedValue(carClassFilter.trim(), 300);
  const seasonRankReady = useAfterFirstPaint(Boolean(user));

  const hasActiveFilters = Boolean(
    debouncedQ || simFilter || debouncedCarClass,
  );

  const { data: meta, isPending: metaLoading } = useQuery({
    queryKey: ["challenges", "meta", user?.id ?? "anon"],
    queryFn: () => getChallengesMeta(),
    staleTime: META_STALE_MS,
  });

  useEffect(() => {
    if (hasActiveFilters) {
      if (tab === null) setTab("upcoming");
      return;
    }
    if (userPickedTabRef.current || !meta) return;
    setTab(meta.defaultTab);
  }, [hasActiveFilters, tab, meta]);

  const selectTab = useCallback((key: BrowseTab) => {
    userPickedTabRef.current = true;
    setTab(key);
  }, []);

  const joinedTabLoggedOut = tab === "joined" && !user;

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedQ, simFilter, debouncedCarClass]);

  const listParams = tab
    ? {
        page,
        pageSize: PAGE_SIZE,
        ...listParamsForTab(tab),
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(simFilter ? { sim: simFilter } : {}),
        ...(debouncedCarClass ? { carClass: debouncedCarClass } : {}),
      }
    : null;

  const listQueryKey = useMemo(
    () =>
      [
        "challenges",
        "list",
        user?.id ?? "anon",
        tab,
        page,
        debouncedQ,
        simFilter,
        debouncedCarClass,
      ] as const,
    [user?.id, tab, page, debouncedQ, simFilter, debouncedCarClass],
  );

  const {
    data: listData,
    isPending: listLoading,
    isFetching: listFetching,
    error: listError,
    isError: listFailed,
  } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => getChallengeList(listParams!),
    enabled: Boolean(listParams) && !joinedTabLoggedOut,
    // Soft-keep only for page flips within the same tab+filters.
    // Tab/filter changes must clear so the list skeleton shows (not stale cards).
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prev = previousQuery.queryKey;
      if (
        prev[3] === tab &&
        prev[5] === debouncedQ &&
        prev[6] === simFilter &&
        prev[7] === debouncedCarClass
      ) {
        return previousData;
      }
      return undefined;
    },
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasLive = items.some((c) => c.status === "ACTIVE");
      const hasUpcoming = items.some((c) => c.status === "UPCOMING");
      if (hasLive) return challengeLiveRefetchIntervalMs("ACTIVE") as number;
      if (hasUpcoming) return challengeLiveRefetchIntervalMs("UPCOMING") as number;
      return false;
    },
  });

  const challengeIds = useMemo(
    () => (listData?.items ?? []).map((c) => c.id),
    [listData?.items],
  );

  const { data: socialData } = useQuery({
    queryKey: ["challenges", "social", user?.id, challengeIds],
    queryFn: () => getChallengesSocialPreview(challengeIds),
    enabled: Boolean(user) && challengeIds.length > 0,
  });

  const { data: seasonRank } = useQuery({
    queryKey: ["challenges", "season-rank", user?.id],
    queryFn: getChallengesSeasonRank,
    enabled: Boolean(user) && seasonRankReady,
    staleTime: META_STALE_MS,
  });

  const joinMutation = useMutation({
    mutationFn: (challengeId: string) => joinChallenge(challengeId),
    onSuccess: (_, challengeId) => {
      void queryClient.invalidateQueries({ queryKey: ["challenges", "list"] });
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "social"],
      });
      void queryClient.invalidateQueries({ queryKey: ["challenges", "meta"] });
      void queryClient.invalidateQueries({
        queryKey: ["challenges", "detail", challengeId],
      });
    },
    onError: (e: unknown) => {
      console.error(e);
      setJoinError(
        withRequestId(
          typeof (e as Error)?.message === "string"
            ? (e as Error).message
            : "Join failed",
          e,
        ),
      );
    },
  });

  const joinMutate = joinMutation.mutate;

  const handleJoin = useCallback(
    (challengeId: string) => {
      if (!user) {
        const state: AuthRedirectState = {
          message: "Sign in to join challenges and track your results.",
          from: `${location.pathname}${location.search}`,
        };
        navigate(AUTH_PATHS.login, { state });
        return;
      }
      setJoinError(null);
      joinMutate(challengeId);
    },
    [user, location.pathname, location.search, navigate, joinMutate],
  );

  const joiningId = joinMutation.isPending
    ? (joinMutation.variables ?? null)
    : null;

  const error = listFailed
    ? withRequestId(
        listError instanceof Error ? listError.message : String(listError),
        listError,
      )
    : null;

  const items = useMemo(() => {
    const base = listData?.items ?? [];
    if (!socialData?.previews) return base;
    return base.map((item) => {
      const social = socialData.previews[item.id];
      if (!social) return item;
      return {
        ...item,
        followedWhoJoined: social.preview,
        followedWhoJoinedMoreCount: social.moreCount,
      };
    });
  }, [listData?.items, socialData]);

  const needsLiveClock = useMemo(
    () =>
      items.some(
        (c) => c.status === "ACTIVE" || c.status === "UPCOMING",
      ),
    [items],
  );
  const nowMs = useSharedNowMs(needsLiveClock);

  const totalPages = listData?.totalPages ?? 1;
  const total = joinedTabLoggedOut ? 0 : (listData?.total ?? 0);
  const listQueryEnabled = Boolean(listParams) && !joinedTabLoggedOut;

  const allTabsEmpty =
    !hasActiveFilters &&
    !metaLoading &&
    meta?.defaultTab === null &&
    tab === null;

  const showListSkeleton =
    !joinedTabLoggedOut &&
    !listFailed &&
    !allTabsEmpty &&
    listQueryEnabled &&
    listLoading &&
    !listData;

  const yourRank =
    seasonRank?.yourRank != null && Number.isFinite(seasonRank.yourRank)
      ? seasonRank.yourRank
      : null;

  const showFeatured =
    tab === "live" && page === 1 && !showListSkeleton && !error && total > 0;
  const listItems = showFeatured ? items.slice(1) : items;
  const listSectionLabel =
    tab && showFeatured && listItems.length > 0
      ? "More live challenges"
      : tab
        ? TAB_SECTION_LABEL[tab]
        : "";

  const emptyMessage = joinedTabLoggedOut
    ? "Sign in to see challenges you've joined."
    : debouncedQ || simFilter || debouncedCarClass
      ? "No challenges match your filters."
      : tab === "joined"
        ? "You haven't joined any challenges yet."
        : "No challenges in this tab right now.";

  const seasonMeta: ChallengesMeta | null = meta ?? null;

  return (
    <>
      <PageMeta
        title={STATIC_SEO.challenges.title}
        description={STATIC_SEO.challenges.description}
        path={CHALLENGES_PATH}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        <header>
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Challenges
          </h1>
          <p className="mt-2 max-w-3xl font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            Time-limited competitions: set your best lap at a specific track and
            car class, climb the leaderboard, and earn badges. Manual entries
            show as unverified; .ibt uploads are verified telemetry.
          </p>
        </header>

        {user &&
          (metaLoading ? (
            <ChallengesSeasonStatsSkeleton />
          ) : (
            <ChallengesSeasonStats meta={seasonMeta} yourRank={yourRank} />
          ))}

        <section className="flex gap-2 overflow-x-auto pb-1">
          {TAB_CONFIG.map(([key, label]) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key)}
                className={cn(
                  "shrink-0 rounded-apex-sm px-4 py-2 font-apex-body text-xs font-bold transition-colors",
                  isActive
                    ? "bg-apex-primary text-white"
                    : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                  isActive &&
                    key === "live" &&
                    "shadow-[0_0_20px_hsl(var(--apex-primary)/0.12)]",
                )}
              >
                {label}
              </button>
            );
          })}
        </section>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-3">
          <div className="relative w-full shrink-0 lg:min-w-0 lg:flex-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-apex-on-surface-variant/60"
              aria-hidden
            />
            <input
              type="text"
              placeholder="Search title or track…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={cn(CHALLENGES_FIELD_CLASS, "w-full pl-10 pr-4")}
            />
          </div>
          <div className="w-full shrink-0 lg:min-w-0 lg:flex-1">
            <input
              type="text"
              placeholder="Car class"
              value={carClassFilter}
              onChange={(e) => setCarClassFilter(e.target.value)}
              className={cn(CHALLENGES_FIELD_CLASS, "w-full px-3")}
            />
          </div>
          <div className="w-full shrink-0 lg:w-auto lg:min-w-[140px]">
            <AppNativeSelect
              value={simFilter}
              onChange={(e) => setSimFilter(e.target.value)}
              className="w-full"
              aria-label="Simulator"
            >
              <option value="">All sims</option>
              {MANUAL_ACTIVITY_SIMS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </AppNativeSelect>
          </div>
        </div>

        {joinError && (
          <div className="font-apex-body text-sm text-apex-error">{joinError}</div>
        )}

        {showListSkeleton && (
          <ChallengeBrowseListSkeleton
            showHero={tab === "live"}
            rowCount={SKELETON_ROW_COUNT}
          />
        )}

        {allTabsEmpty && (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-6 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-apex-surface-container-high ring-1 ring-apex-outline-variant/20">
              <Trophy
                className="size-7 text-apex-on-surface-variant/50"
                aria-hidden
              />
            </div>
            <div className="max-w-md space-y-2">
              <p className="font-apex-headline text-base font-semibold text-apex-on-surface">
                No challenges right now
              </p>
              <p className="font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                There are no upcoming, live, past, or joined challenges at the
                moment. Check back soon — new time-limited competitions are
                added regularly.
              </p>
            </div>
          </div>
        )}

        {error && !showListSkeleton && !allTabsEmpty && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-12">
            <Trophy
              className="size-10 text-apex-on-surface-variant/40"
              aria-hidden
            />
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              {error}
            </p>
          </div>
        )}

        {!showListSkeleton && !error && !allTabsEmpty && total === 0 && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-12">
            <Trophy
              className="size-10 text-apex-on-surface-variant/40"
              aria-hidden
            />
            <p className="text-center font-apex-body text-sm text-apex-on-surface-variant">
              {emptyMessage}
            </p>
          </div>
        )}

        {!showListSkeleton && !error && !allTabsEmpty && total > 0 && (
          <div className="space-y-8">
            {showFeatured && items[0] && (
              <div className="space-y-3">
                <h2 className="font-apex-body text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
                  Live challenge
                </h2>
                <ChallengeFeaturedHero
                  item={items[0]}
                  onJoin={handleJoin}
                  joiningId={joiningId}
                  detailTo={`/challenge/${items[0].id}`}
                  nowMs={nowMs}
                />
              </div>
            )}

            {listItems.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-apex-body text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
                  {listSectionLabel}
                </h2>
                <div className="space-y-3">
                  {listItems.map((c) => (
                    <ChallengeBrowseRow
                      key={c.id}
                      item={c}
                      activeTab={tab ?? "upcoming"}
                      isLoggedIn={Boolean(user)}
                      onJoin={handleJoin}
                      joiningId={joiningId}
                      detailTo={`/challenge/${c.id}`}
                      showStatusChip={tab !== "live"}
                      nowMs={nowMs}
                    />
                  ))}
                </div>
              </div>
            )}

            {totalPages > 1 && (
              <AppListPaginationFooter
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                disabled={listFetching}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
