/**
 * Shared session-detail fetch + parse logic for the session page.
 *
 * Uses React Query key `["sessions","detail",id]` and endpoint `/api/sessions/:id`.
 */
import { apiGet, ApiError, withRequestId } from "@/lib/api";
import {
  coerceSessionDetailLaps,
  type LapTimingHighlights,
  type SessionTimingMinima,
} from "@/lib/sessionLapDisplay";
import {
  type ApexAnalysisPayload,
  type ApexAnalysisV2Payload,
  parseApexAnalysisV2Payload,
} from "@/features/session-detail/apexAnalysisDisplay";
import type { SectorTimingSource } from "@/lib/sectors";
import { coerceSectorTimesMs } from "@/lib/sectors";

export type RawLap = {
  lap: number;
  lapNumber?: number;
  timeMs?: number;
  lapTimeMs?: number;
  deltaMs?: number;
  isValid?: boolean;
  isBestLap?: boolean;
  isOutLap?: boolean;
  sector1Ms?: number | null;
  sector2Ms?: number | null;
  sector3Ms?: number | null;
  sectorTimesMs?: (number | null)[];
  sectorsEstimated?: boolean;
  highlights?: LapTimingHighlights | { lap: LapTimingHighlights["lap"] } | null;
};

export type NormalizedLap = {
  lap: number;
  timeMs: number;
  deltaMs?: number;
  isValid?: boolean;
  isBestLap?: boolean;
  isOutLap?: boolean;
  sector1Ms?: number | null;
  sector2Ms?: number | null;
  sector3Ms?: number | null;
  sectorTimesMs: (number | null)[];
  sectorsEstimated?: boolean;
  highlights?: LapTimingHighlights | { lap: LapTimingHighlights["lap"] } | null;
};

export function normalizeLaps(laps: RawLap[] | undefined): NormalizedLap[] {
  if (!laps) return [];
  return laps.map((l) => ({
    lap: l.lapNumber ?? l.lap,
    timeMs: l.lapTimeMs ?? l.timeMs ?? 0,
    deltaMs: typeof l.deltaMs === "number" ? l.deltaMs : undefined,
    isValid: l.isValid,
    isBestLap: l.isBestLap,
    isOutLap: l.isOutLap === true,
    sector1Ms: l.sector1Ms,
    sector2Ms: l.sector2Ms,
    sector3Ms: l.sector3Ms,
    sectorTimesMs: coerceSectorTimesMs(l.sectorTimesMs, l),
    sectorsEstimated: l.sectorsEstimated,
    highlights: l.highlights,
  }));
}

export type SessionSource = "TELEMETRY" | "MANUAL_ACTIVITY" | "AGENT" | string;

export type SessionDetail = {
  id: string;
  sessionType?:
    | "PRACTICE"
    | "RACE"
    | "SPRINT"
    | "QUALIFY"
    | "QUALIFYING"
    | "MANUAL_ACTIVITY"
    | "WARMUP"
    | "TIME_TRIAL"
    | "UNKNOWN"
    | string
    | null;
  sim?: string | null;
  game?: string | null;
  track: string | null;
  trackName?: string | null;
  trackId?: string | null;
  car: string | null;
  carName?: string | null;
  carId?: string | null;
  vehicleDisplay?: string;
  position?: number | null;
  qualifyingPosition?: number | null;
  totalDrivers?: number | null;
  bestLapMs?: number | null;
  bestLapLapNumber?: number | null;
  lapCount?: number | null;
  /** Distance (km): track length × laps, or telemetry fallback. */
  totalKm?: number | null;
  laps?: RawLap[];
  /** Server-precomputed session minima for Ideal Lap panel (Pro). */
  sessionTimingMinima?: SessionTimingMinima | null;
  idealLap?: {
    lapTimeMs: number;
    sectorTimesMs?: (number | null)[];
    sector1Ms?: number;
    sector2Ms?: number;
    sector3Ms?: number;
  } | null;
  /** Server-computed from valid lap times (same as activity feed). */
  consistencyScore?: number | null;
  compareToPrevious?: {
    previousSessionId: string;
    bestLapDiffMs: number | null;
    medianLapDiffMs: number | null;
    consistencyDiffPct: number | null;
  } | null;
  processingDurationMs?: number | null;
  source?: SessionSource | null;
  ingestPath?: string | null;
  caption?: string | null;
  driverName?: string | null;
  likeCount?: number | null;
  commentCount?: number | null;
  likedByMe?: boolean;
  /** Track weather conditions when set (manual form / future telemetry). */
  conditions?: "DRY" | "WET" | "MIXED" | null;
  /** Catalog track image URL when present. */
  trackImageUrl?: string | null;
  /** Normalized weather metrics from IBT telemetryMeta (scalars only). */
  weather?: {
    airTempC?: number | null;
    trackTempC?: number | null;
    humidityPct?: number | null;
    windVelMs?: number | null;
    skies?: string | null;
    airPressure?: number | null;
    trackWetness?: string | null;
    precipitation?: string | null;
  } | null;
  userId?: string | null;
  /** Role of the session owner, when included by the public detail API. */
  authorRole?: "USER" | "ADMIN";
  /** Backward-compatible alias used by some session detail payloads. */
  userRole?: "USER" | "ADMIN";
  /** Challenge linkage for user-submitted session entries. */
  challengeId?: string | null;
  /** Manual rows only: PRACTICE | QUALIFY | RACE */
  manualSessionKind?: string | null;
  sectorCount?: number | null;
  sectorStartsPct?: number[] | null;
  sectorLayoutKey?: string | null;
  sectorTimingSource?: SectorTimingSource | null;
};

type BackendLapLite = {
  lapNumber: number;
  lapTimeMs: number;
  deltaMs?: number;
  isValid: boolean;
  isBestLap: boolean;
  isOutLap?: boolean;
  sector1Ms?: number | null;
  sector2Ms?: number | null;
  sector3Ms?: number | null;
  sectorTimesMs?: (number | null)[];
  sectorsEstimated?: boolean;
  highlights?: LapTimingHighlights | { lap: LapTimingHighlights["lap"] } | null;
};

type SessionDetailResponse =
  | SessionDetail
  | {
      session: SessionDetail;
      laps?: BackendLapLite[];
      trackName?: string | null;
      carName?: string | null;
      game?: string | null;
      sim?: string | null;
      proFeaturesLocked?: boolean;
      ingestPath?: string | null;
      apexAnalysis?: unknown;
      apexAnalysisV2?: unknown;
    };

export type ParsedSessionDetail = {
  session: SessionDetail;
  proFeaturesLocked: boolean;
  /** Null when the viewer is not the session owner. */
  apexAnalysis: ApexAnalysisPayload | null;
  /** Additive structured coaching payload; null for non-owners or invalid data. */
  apexAnalysisV2: ApexAnalysisV2Payload | null;
};

function attachNormalizedLaps(
  session: SessionDetail,
  lapsPayload: unknown[] | null,
): SessionDetail {
  if (!lapsPayload || lapsPayload.length === 0) return session;
  return { ...session, laps: coerceSessionDetailLaps(lapsPayload) };
}

function normalizeApexAnalysisPayload(
  raw: unknown,
): ApexAnalysisPayload | null {
  if (raw == null) return null;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    "locked" in raw
  ) {
    return raw as ApexAnalysisPayload;
  }
  return { locked: false, insights: [] };
}

export function parseSessionDetailApiResponse(
  data: SessionDetailResponse,
): ParsedSessionDetail {
  if (data && typeof data === "object" && "session" in (data as object)) {
    const d = data as Exclude<SessionDetailResponse, SessionDetail>;
    const base =
      (d.session as any)?.session &&
      typeof (d.session as any).session === "object"
        ? ((d.session as any).session as SessionDetail)
        : d.session;
    const outer = d.session as any;
    const mergedSession: SessionDetail = {
      ...(outer && typeof outer === "object" ? outer : {}),
      ...(base && typeof base === "object" ? base : {}),
      trackName:
        (base as any)?.trackName ??
        (outer as any)?.trackName ??
        (d as any).trackName ??
        null,
      carName:
        (base as any)?.carName ??
        (outer as any)?.carName ??
        (d as any).carName ??
        null,
      game:
        (base as any)?.game ?? (outer as any)?.game ?? (d as any).game ?? null,
      sim: (base as any)?.sim ?? (outer as any)?.sim ?? (d as any).sim ?? null,
      ingestPath:
        (base as any)?.ingestPath ??
        (outer as any)?.ingestPath ??
        (d as any).ingestPath ??
        null,
    };
    const lapsPayload =
      (Array.isArray(d.laps) ? d.laps : null) ??
      (Array.isArray((d as any).laps)
        ? ((d as any).laps as unknown[])
        : null) ??
      (Array.isArray((outer as any)?.laps)
        ? ((outer as any).laps as unknown[])
        : null) ??
      (Array.isArray((base as any)?.laps)
        ? ((base as any).laps as unknown[])
        : null);

    const apexRaw = normalizeApexAnalysisPayload(
      (d as { apexAnalysis?: unknown }).apexAnalysis ??
        (mergedSession as { apexAnalysis?: unknown }).apexAnalysis,
    );
    return {
      session: attachNormalizedLaps(mergedSession, lapsPayload),
      proFeaturesLocked: Boolean(
        (d as { proFeaturesLocked?: boolean }).proFeaturesLocked,
      ),
      apexAnalysis: apexRaw,
      apexAnalysisV2: parseApexAnalysisV2Payload(
        (d as { apexAnalysisV2?: unknown }).apexAnalysisV2 ??
          (mergedSession as { apexAnalysisV2?: unknown }).apexAnalysisV2,
      ),
    };
  }

  const flat = data as SessionDetail & {
    proFeaturesLocked?: boolean;
    apexAnalysis?: unknown;
    apexAnalysisV2?: unknown;
    ingestPath?: string | null;
    laps?: unknown[];
  };
  const flatLaps = Array.isArray(flat.laps) ? flat.laps : null;
  return {
    session: attachNormalizedLaps(flat, flatLaps),
    proFeaturesLocked: Boolean(flat.proFeaturesLocked),
    apexAnalysis: normalizeApexAnalysisPayload(flat.apexAnalysis),
    apexAnalysisV2: parseApexAnalysisV2Payload(flat.apexAnalysisV2),
  };
}

export async function fetchSessionDetail(
  id: string,
): Promise<ParsedSessionDetail> {
  const raw = await apiGet<SessionDetailResponse>(`/api/sessions/${id}`);
  return parseSessionDetailApiResponse(raw);
}

export function isManualActivity(session: SessionDetail): boolean {
  const st = (session.sessionType ?? "").toUpperCase();
  if (st === "MANUAL_ACTIVITY") return true;
  const src = (session.source ?? "").toString().toUpperCase();
  if (src === "MANUAL" || src === "MANUAL_ACTIVITY") return true;
  if (src === "TELEMETRY" || src === "AGENT") return false;
  const hasNoLaps = !session.laps || session.laps.length === 0;
  const hasNoTelemetryFields =
    session.lapCount === 0 ||
    session.lapCount == null ||
    session.bestLapLapNumber == null;
  return hasNoLaps && hasNoTelemetryFields;
}

/** Access-control denied message for GET /api/sessions/:id 403 responses. */
export function sessionDetailDeniedMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 403) return null;
  switch (error.code) {
    case "SESSION_HISTORY_LOCKED":
      return withRequestId(
        "This session is outside the free plan history window. Upgrade to Apex Pro for unlimited session access.",
        error,
      );
    case "SESSION_VISIBILITY_PRIVATE":
      return withRequestId(
        "This session is private. Only the driver can view it.",
        error,
      );
    case "SESSION_VISIBILITY_FOLLOWERS_ONLY":
      return withRequestId(
        "This session is limited to the driver's followers. Sign in and follow them to view it, or ask the driver to change session visibility in settings.",
        error,
      );
    default:
      return withRequestId(
        error.message || "You don’t have access to this session.",
        error,
      );
  }
}
