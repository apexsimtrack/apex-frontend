import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { apiErrorText, ApiError, withRequestId } from "@/lib/api/errors";
import { deleteSession, patchSessionCaption } from "@/lib/api/manualAndUpload";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { publicSessionUrl } from "@/lib/siteMeta";
import { buildPageTitle } from "@/lib/seo";
import {
  buildHighlightMapFromLaps,
  EMPTY_SESSION_TIMING_MINIMA,
} from "@/lib/sessionLapDisplay";
import {
  buildSessionShareText,
  calcConsistencyScore,
  resolveSessionFields,
  sanitizeLapTimesForConsistency,
} from "@/lib/sessionShareText";
import { formatLapDelta } from "@/lib/utils";
import { parseApexAnalysisDisplay } from "@/features/session-detail/apexAnalysisDisplay";
import {
  fetchSessionDetail,
  isManualActivity,
  normalizeLaps,
  sessionDetailDeniedMessage,
  type RawLap,
} from "@/features/session-detail/sessionDetailData";
import { sessionDetailQueryKey } from "@/lib/sessions/sessionDetailPrefetch";
import { bumpSessionCommentCountInCaches } from "@/lib/sessionSocialCache";
import { useSessionLike } from "@/hooks/useSessionLike";
import { useAuth, useIsProUser } from "@/contexts/AuthContext";
import { invalidateSessionDerivedCaches } from "@/lib/profileQueryKeys";
import { toast } from "sonner";
import PageMeta from "@/components/PageMeta";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import {
  useTelemetrySummary,
  useTelemetryTraces,
} from "@/features/telemetry-analysis/useSessionTelemetry";
import { isAgentOnlyTelemetryGate } from "@/features/telemetry-analysis/telemetryEligibility";
import { PageSuspense } from "@/routes/PageSuspense";
import SessionDetailBadges from "./session/SessionDetailBadges";
import SessionDetailHero from "./session/SessionDetailHero";
import SessionDetailHeroStats from "./session/SessionDetailHeroStats";
import SessionCaptionEditor from "@/components/sessions/SessionCaptionEditor";
import SessionDetailSectorBreakdown from "./session/SessionDetailSectorBreakdown";
import SessionDetailAnalysisGrid from "./session/SessionDetailAnalysisGrid";
import SessionDetailLapConsistency, {
  buildConsistencyVisual,
} from "./session/SessionDetailLapConsistency";
import SessionDetailSkeleton, {
  SessionDetailBodySkeleton,
} from "./session/SessionDetailSkeleton";
import SessionLapTable from "./session/SessionLapTable";
import { SessionCommentsModal } from "./session/SessionCommentsModal";
import UgcOverflowMenu from "@/components/ugc/UgcOverflowMenu";
import { sessionModerationTargets } from "@/components/ugc/sessionModerationTargets";
import {
  aggregateTyreWearPct,
  telemetryOverviewFromTraces,
} from "./session/telemetry/telemetryOverviewHelpers";
import SessionTelemetrySkeleton from "./session/telemetry/SessionTelemetrySkeleton";
import {
  coerceSectorTimesMs,
  isLegacyEstimatedSectorSource,
} from "@/lib/sectors";

const SessionTelemetry = lazy(
  () =>
    import(
      /* webpackChunkName: "telemetry-charts" */ "./session/telemetry/SessionTelemetry"
    ),
);

const SessionShareModal = lazy(
  () =>
    import(
      /* webpackChunkName: "session-share" */ "@/components/SessionShareModal"
    ),
);

const SESSIONS_PATH = "/sessions";
const HOME_PATH = "/";

const PAGE_SHELL_CLASS =
  "mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-4 px-6 py-8";

function ordinalSuffix(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (abs % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

type SessionNavState = { from?: string } | null;

function SessionBackLink({ fromHome }: { fromHome: boolean }) {
  return (
    <Link
      to={fromHome ? HOME_PATH : SESSIONS_PATH}
      className="inline-flex items-center gap-1.5 font-apex-body text-sm text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
    >
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      {fromHome ? "Home" : "Sessions"}
    </Link>
  );
}

function PageShell({
  children,
  fromHome,
}: {
  children: ReactNode;
  fromHome: boolean;
}) {
  return (
    <div className={PAGE_SHELL_CLASS}>
      <SessionBackLink fromHome={fromHome} />
      {children}
    </div>
  );
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = (location.state as SessionNavState)?.from === "home";
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const isPro = useIsProUser();
  const [showAllLaps, setShowAllLaps] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedLap, setSelectedLap] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [captionPending, setCaptionPending] = useState(false);

  const sid = id?.trim() ?? "";
  const detailPath = sid ? `/sessions/${sid}` : SESSIONS_PATH;
  const targetCommentId = location.hash.startsWith("#comment-")
    ? decodeURIComponent(location.hash.slice("#comment-".length))
    : null;

  useEffect(() => {
    if (targetCommentId) setCommentsOpen(true);
  }, [targetCommentId]);

  const {
    data: sessionPayload,
    isPending: loading,
    error: queryError,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: sessionDetailQueryKey(sid),
    queryFn: () => fetchSessionDetail(sid),
    enabled: Boolean(sid),
  });

  const session = sessionPayload?.session ?? null;
  const apexAnalysis = sessionPayload?.apexAnalysis ?? null;
  const apexAnalysisV2 = sessionPayload?.apexAnalysisV2 ?? null;
  const proFeaturesLocked = sessionPayload?.proFeaturesLocked ?? false;
  /** Seeded list rows omit laps; full GET always includes a laps array. */
  const sessionHydrated = Array.isArray(session?.laps);

  const hydrationAttemptedForSid = useRef<string | null>(null);
  useEffect(() => {
    hydrationAttemptedForSid.current = null;
  }, [sid]);

  // Safety net: partial list seed must not block the real GET forever.
  useEffect(() => {
    if (!sid || !session || sessionHydrated || isFetching) return;
    if (hydrationAttemptedForSid.current === sid) return;
    hydrationAttemptedForSid.current = sid;
    void refetch();
  }, [sid, session, sessionHydrated, isFetching, refetch]);

  useEffect(() => {
    if (!session) return;
    setCommentCount(Number(session.commentCount ?? 0));
  }, [session]);

  const likedByMe = Boolean(session?.likedByMe);
  const likeCount = Number(session?.likeCount ?? 0);
  const { toggleLike, likePending } = useSessionLike(sid, likedByMe, likeCount);

  const shareUrl = useMemo(() => (sid ? publicSessionUrl(sid) : ""), [sid]);

  const onSelectLap = useCallback((lapNumber: number) => {
    setSelectedLap(lapNumber);
  }, []);

  const laps = useMemo(() => {
    if (!session) return [];
    return normalizeLaps(session.laps as RawLap[] | undefined)
      .filter((l) => Number.isFinite(l.lap) && l.lap > 0)
      .sort((a, b) => a.lap - b.lap);
  }, [session]);

  const sessionMinima = useMemo(() => {
    const raw = session?.sessionTimingMinima;
    if (!raw) return EMPTY_SESSION_TIMING_MINIMA;
    return {
      ...raw,
      sectorTimesMs: coerceSectorTimesMs(
        raw.sectorTimesMs,
        {
          sector1Ms: raw.s1Ms,
          sector2Ms: raw.s2Ms,
          sector3Ms: raw.s3Ms,
        },
        session?.sectorCount,
      ),
    };
  }, [session?.sessionTimingMinima, session?.sectorCount]);

  const lapHighlights = useMemo(() => {
    if (laps.length === 0) return new Map();
    return (
      buildHighlightMapFromLaps(laps) ??
      buildHighlightMapFromLaps(laps, { missingAsDefault: true }) ??
      new Map()
    );
  }, [laps]);

  const idealLapMs = useMemo(() => {
    if (!session) return null;
    const fromApi = session.idealLap?.lapTimeMs;
    if (fromApi != null && Number.isFinite(fromApi)) return fromApi;
    if (
      sessionMinima.sectorTimesMs.length > 0 &&
      sessionMinima.sectorTimesMs.every((value) => value != null)
    ) {
      return (sessionMinima.sectorTimesMs as number[]).reduce(
        (sum, value) => sum + value,
        0,
      );
    }
    return sessionMinima.lapMs;
  }, [session, sessionMinima]);

  const agentOnlyGate = isAgentOnlyTelemetryGate(session?.ingestPath);
  // Start Pro telemetry as soon as we have a session id (seed or hydrate) — do not wait for laps.
  const telemetryEnabled = Boolean(
    sid && !authLoading && isPro && !agentOnlyGate && session,
  );
  const { data: telemetrySummary } = useTelemetrySummary(sid, telemetryEnabled);
  const overviewLap =
    selectedLap ??
    telemetrySummary?.defaultLapNumber ??
    session?.bestLapLapNumber ??
    null;
  const canLoadOverviewTraces = Boolean(
    telemetryEnabled &&
    telemetrySummary?.eligible &&
    telemetrySummary.hasProAccess &&
    overviewLap != null &&
    telemetrySummary.laps.some(
      (l) => l.lapNumber === overviewLap && l.hasTraces,
    ),
  );
  const { data: overviewTraces } = useTelemetryTraces(
    sid,
    overviewLap,
    null,
    canLoadOverviewTraces,
  );

  if (!sid) {
    return (
      <PageShell fromHome={fromHome}>
        <p className="font-apex-body text-sm text-apex-on-surface-variant">
          Missing session ID.
        </p>
      </PageShell>
    );
  }

  if (loading && !session) {
    return (
      <>
        <PageMeta
          title={buildPageTitle("Session")}
          description={`Loading session on ${COMPANY_NAME}.`}
          path={detailPath}
          noindex
        />
        <PageShell fromHome={fromHome}>
          <SessionDetailSkeleton />
        </PageShell>
      </>
    );
  }

  const deniedMessage = sessionDetailDeniedMessage(queryError);
  const errorMessage = isError
    ? (deniedMessage ??
      withRequestId(
        queryError instanceof Error
          ? queryError.message
          : "Failed to load session.",
        queryError,
      ))
    : null;

  if (errorMessage || !session) {
    return (
      <>
        <PageMeta
          title={buildPageTitle("Session")}
          description={errorMessage ?? "Session not found."}
          path={detailPath}
          noindex
        />
        <PageShell fromHome={fromHome}>
          <div className="rounded-xl bg-apex-surface-container-low p-6 font-apex-body text-sm text-apex-on-surface-variant shadow-lg">
            {errorMessage ?? "Session not found."}
          </div>
        </PageShell>
      </>
    );
  }

  const resolved = resolveSessionFields(session);
  const totalLapsCount =
    typeof session.lapCount === "number" && session.lapCount > 0
      ? session.lapCount
      : laps.length;
  const isManual = isManualActivity(session);
  const isOwner = user?.id != null && session.userId === user.id;
  const canEditSession = isOwner;
  const canEditCaption = isOwner;
  /** Auth is settled via ProtectedRoute; lock sectors for free viewers. */
  const sectorsLocked = !isPro || proFeaturesLocked;

  const apexDisplay = parseApexAnalysisDisplay(apexAnalysis, apexAnalysisV2);
  const canFocusApexTargetLap =
    apexDisplay.targetLapNumber != null &&
    laps.some((lap) => lap.lap === apexDisplay.targetLapNumber);

  const bestLapMsFromLaps = sessionMinima.lapMs ?? session.bestLapMs ?? null;
  const visibleLaps = showAllLaps ? laps : laps.slice(0, 6);
  const canShowMoreLaps = !showAllLaps && laps.length > 6;

  const lapTimes = sanitizeLapTimesForConsistency(
    laps
      .filter((l) => l.lap > 1 && l.isOutLap !== true && l.isValid !== false)
      .map((l) => l.timeMs),
  );
  const realConsistency =
    session.consistencyScore != null &&
    Number.isFinite(session.consistencyScore)
      ? Math.round(session.consistencyScore)
      : calcConsistencyScore(lapTimes);
  const consistencyText = realConsistency != null ? `${realConsistency}%` : "—";
  const consistencyVisual = buildConsistencyVisual(lapTimes, bestLapMsFromLaps);

  // Baseline = first competitive lap from Lap 2 onwards (not standing start / out-lap).
  const baselineLap = laps.find(
    (l) =>
      l.lap > 1 && l.isOutLap !== true && l.timeMs > 0 && l.isValid !== false,
  );
  const improvementMs =
    baselineLap != null &&
    bestLapMsFromLaps != null &&
    baselineLap.timeMs > bestLapMsFromLaps
      ? baselineLap.timeMs - bestLapMsFromLaps
      : null;
  const improvementFromLap =
    improvementMs != null && improvementMs > 0 ? baselineLap!.lap : null;

  const showPosition =
    session.position != null &&
    Number.isFinite(session.position) &&
    session.position > 0;
  const displayPositionLabel = showPosition
    ? session.totalDrivers != null && session.totalDrivers > 0
      ? `P${session.position} / ${session.totalDrivers}`
      : `P${session.position}`
    : null;
  const showQualiGrid =
    session.qualifyingPosition != null && session.qualifyingPosition > 0;
  const qualiGridLabel = showQualiGrid
    ? session.totalDrivers != null && session.totalDrivers > 0
      ? `P${session.qualifyingPosition} / ${session.totalDrivers}`
      : `P${session.qualifyingPosition}`
    : null;

  const wearPct = aggregateTyreWearPct(telemetrySummary ?? null);
  const overview = telemetryOverviewFromTraces(overviewTraces);
  const overviewRows: Array<{
    label: string;
    value: string;
    scope: "lap" | "session";
  }> = [
    {
      label: "Top speed",
      scope: "lap",
      value:
        overview.topSpeedKmh != null
          ? `${Math.round(overview.topSpeedKmh)} km/h`
          : "—",
    },
    {
      label: "Avg brake force",
      scope: "lap",
      value:
        overview.avgBrakePct != null
          ? `${Math.round(overview.avgBrakePct)}%`
          : "—",
    },
    {
      label:
        overview.highestGear != null
          ? `Distance in ${overview.highestGear}${ordinalSuffix(overview.highestGear)} gear`
          : "Top gear share",
      scope: "lap",
      value:
        overview.topGearDistancePct != null
          ? `${Math.round(overview.topGearDistancePct)}%`
          : overview.highestGear != null
            ? `Gear ${overview.highestGear}`
            : "—",
    },
  ];
  if (telemetrySummary?.sessionMeta?.airTempC != null) {
    overviewRows.push({
      label: "Air temp",
      scope: "session",
      value: `${telemetrySummary.sessionMeta.airTempC.toFixed(1)}°C`,
    });
  }
  if (telemetrySummary?.sessionMeta?.trackTempC != null) {
    overviewRows.push({
      label: "Track temp",
      scope: "session",
      value: `${telemetrySummary.sessionMeta.trackTempC.toFixed(1)}°C`,
    });
  }

  // Manual activities never carry telemetry, and an uploaded/agent session that
  // resolved to nothing would render a card of em dashes. Hide it in both cases.
  const hasTelemetryOverviewData =
    !isManual &&
    (overview.topSpeedKmh != null ||
      overview.avgBrakePct != null ||
      overview.highestGear != null ||
      telemetrySummary?.sessionMeta?.airTempC != null ||
      telemetrySummary?.sessionMeta?.trackTempC != null);

  const sessionShareText = buildSessionShareText(session);
  const sessionShareTitle =
    sessionShareText.split("\n")[0]?.trim() || "Apex session";

  async function handleDelete() {
    if (!sid) return;

    try {
      await deleteSession(sid);
      invalidateSessionDerivedCaches(queryClient, {
        sessionId: sid,
        ownerUserId: session.userId ?? user?.id ?? null,
        removeSessionQueries: true,
      });
      toast.success("Session deleted", {
        description: "The session has been removed.",
      });
      navigate(SESSIONS_PATH);
    } catch (err) {
      const message =
        apiErrorText(err, "Failed to delete session. Please try again.");
      throw new Error(message);
    }
  }

  async function handleCaptionSave(next: string | null): Promise<boolean> {
    if (!sid || captionPending) return false;
    setCaptionPending(true);
    try {
      const result = await patchSessionCaption(sid, next);
      queryClient.setQueryData(
        sessionDetailQueryKey(sid),
        (prev: typeof sessionPayload) => {
          if (!prev?.session) return prev;
          return {
            ...prev,
            session: { ...prev.session, caption: result.caption },
          };
        },
      );
      invalidateSessionDerivedCaches(queryClient, {
        sessionId: sid,
        ownerUserId: session.userId ?? user?.id ?? null,
        removeSessionQueries: false,
      });
      toast.success(result.caption ? "Caption saved" : "Caption cleared");
      return true;
    } catch (err) {
      const message =
        apiErrorText(err, "Failed to save caption. Please try again.");
      toast.error(message);
      return false;
    } finally {
      setCaptionPending(false);
    }
  }

  return (
    <>
      <PageMeta
        title={sessionShareTitle}
        description={sessionShareText}
        path={detailPath}
        noindex
      />

      <PageShell fromHome={fromHome}>
        <SessionDetailBadges
          session={session}
          resolved={resolved}
          isManual={isManual}
        />

        <SessionDetailHero
          trackName={resolved.track}
          trackImageUrl={session.trackImageUrl}
          sim={resolved.sim ?? session.sim ?? undefined}
          canEditSession={canEditSession}
          canDeleteSession={isOwner}
          likeCount={likeCount}
          commentCount={commentCount}
          likedByMe={likedByMe}
          likePending={likePending}
          onLike={() => void toggleLike()}
          onComment={() => setCommentsOpen(true)}
          onShare={() => setShareModalOpen(true)}
          onEdit={() => navigate(`/sessions/${sid}/edit`)}
          onDelete={() => setShowDeleteModal(true)}
          overflowMenu={
            <UgcOverflowMenu
              signedIn={Boolean(user)}
              isOwn={isOwner}
              authorId={session.userId}
              hide={sessionModerationTargets({ sessionId: sid }).hide}
            />
          }
        />

        <SessionDetailHeroStats
          bestLapMs={session.bestLapMs}
          lapCount={totalLapsCount}
          carName={resolved.car ?? resolved.carRawForFormat ?? null}
          positionLabel={displayPositionLabel}
          qualiGridLabel={qualiGridLabel}
          bestLapLapNumber={session.bestLapLapNumber}
          improvementMs={improvementMs}
          improvementFromLap={improvementFromLap}
          totalKm={session.totalKm}
        />

        <SessionCaptionEditor
          caption={session.caption}
          canEdit={canEditCaption}
          isSaving={captionPending}
          onSave={handleCaptionSave}
        />

        <SessionDetailSectorBreakdown
          sessionMinima={sessionMinima}
          idealLapMs={idealLapMs}
          proFeaturesLocked={sectorsLocked}
          legacyEstimated={isLegacyEstimatedSectorSource(
            session.sectorTimingSource,
          )}
        />

        {!sessionHydrated ? (
          <SessionDetailBodySkeleton />
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
                  Lap history
                </h2>
                {laps.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-apex-body text-[11px] text-apex-on-surface-variant">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-purple-400">
                        ●
                      </span>
                      Session best
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono">●</span>
                      Normal
                    </span>
                  </div>
                )}
              </div>
              <SessionLapTable
                laps={visibleLaps}
                lapHighlights={lapHighlights}
                bestLapMsFromLaps={bestLapMsFromLaps}
                canShowMore={canShowMoreLaps}
                onShowMore={() => setShowAllLaps(true)}
                selectedLap={selectedLap}
                onSelectLap={onSelectLap}
                hideSectorColumns={sectorsLocked}
                sectorCount={session.sectorCount ?? 0}
              />
            </section>

            <SessionDetailAnalysisGrid
              apexAnalysis={apexDisplay}
              apexConsistencyText={consistencyText}
              tireWearText={wearPct != null ? `${Math.round(wearPct)}%` : "—"}
              overviewRows={overviewRows}
              overviewLapNumber={overviewLap}
              showTelemetryOverview={hasTelemetryOverviewData}
              showApexAnalysis={isOwner}
              canFocusTargetLap={canFocusApexTargetLap}
              onFocusTargetLap={() => {
                if (apexDisplay.targetLapNumber != null) {
                  setSelectedLap(apexDisplay.targetLapNumber);
                }
              }}
            />

            <PageSuspense fallback={<SessionTelemetrySkeleton />}>
              <SessionTelemetry
                sessionId={sid}
                ingestPath={session.ingestPath}
                laps={laps}
                selectedLap={selectedLap}
                onSelectLap={onSelectLap}
                bestLapLapNumber={session.bestLapLapNumber}
                sectorStartsPct={session.sectorStartsPct}
              />
            </PageSuspense>

            <SessionDetailLapConsistency
              consistencyText={consistencyText}
              dots={consistencyVisual.dots}
              narrative={consistencyVisual.narrative}
            />

            {session.compareToPrevious && (
              <section className="rounded-xl bg-apex-surface-container-low p-4 shadow-lg">
                <h2 className="mb-2 font-apex-headline text-lg font-bold tracking-tight text-apex-on-surface">
                  vs previous session
                </h2>
                <div className="flex flex-wrap gap-4 font-apex-body text-xs text-apex-on-surface-variant">
                  {session.compareToPrevious.bestLapDiffMs != null && (
                    <span>
                      Best lap{" "}
                      <strong className="text-apex-on-surface">
                        {session.compareToPrevious.bestLapDiffMs < 0
                          ? "faster "
                          : "slower "}
                        {formatLapDelta(
                          Math.abs(session.compareToPrevious.bestLapDiffMs),
                        )}
                      </strong>
                    </span>
                  )}
                  {session.compareToPrevious.medianLapDiffMs != null && (
                    <span>
                      Median{" "}
                      <strong className="text-apex-on-surface">
                        {session.compareToPrevious.medianLapDiffMs < 0
                          ? "faster "
                          : "slower "}
                        {formatLapDelta(
                          Math.abs(session.compareToPrevious.medianLapDiffMs),
                        )}
                      </strong>
                    </span>
                  )}
                  {session.compareToPrevious.consistencyDiffPct != null && (
                    <span>
                      Consistency{" "}
                      <strong className="text-apex-on-surface">
                        {session.compareToPrevious.consistencyDiffPct > 0
                          ? "+"
                          : ""}
                        {session.compareToPrevious.consistencyDiffPct.toFixed(
                          1,
                        )}{" "}
                        pts
                      </strong>
                    </span>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {import.meta.env.DEV &&
          session.processingDurationMs != null &&
          Number.isFinite(session.processingDurationMs) && (
            <p className="font-apex-body text-[10px] text-apex-on-surface-variant/60">
              Processing {Math.round(session.processingDurationMs)} ms
            </p>
          )}
      </PageShell>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete this session?"
        message="This cannot be undone."
      />

      <SessionCommentsModal
        sessionId={sid}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={() => {
          setCommentCount((c) => c + 1);
          bumpSessionCommentCountInCaches(queryClient, sid, 1);
        }}
        onCommentDeleted={(countDelta) => {
          setCommentCount((c) => Math.max(0, c - countDelta));
          bumpSessionCommentCountInCaches(queryClient, sid, -countDelta);
        }}
        onRefreshSession={() => {
          void queryClient.invalidateQueries({
            queryKey: sessionDetailQueryKey(sid),
          });
        }}
        targetCommentId={targetCommentId}
      />

      {shareModalOpen ? (
        <Suspense fallback={null}>
          <SessionShareModal
            open={shareModalOpen}
            onOpenChange={setShareModalOpen}
            shareUrl={shareUrl}
            shareText={sessionShareText}
          />
        </Suspense>
      ) : null}
    </>
  );
}
