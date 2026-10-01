import { apiGet, apiPost } from "./httpVerbs";
import {
  buildApiAuthHeaders,
  fetchApi,
  notifyAuthExpired,
} from "./fetchClient";
import { API_BASE } from "./config";
import { ApiError } from "./errors";
import { responseRequestId } from "./requestId";

/** Matches GET /api/challenges summary rows */
export type ChallengeApiStatus = "UPCOMING" | "ACTIVE" | "ENDED";

export type ChallengeSummary = {
  id: string;
  title: string;
  sim: string;
  track: string;
  vehicle: string;
  kind?: "challenge";
  status: ChallengeApiStatus;
  participants: number;
  startsAt: string | null;
  endsAt: string | null;
  targetTimeMs: number | null;
  yourBestLapMs: number | null;
  fastestLapMs: number | null;
  yourPosition: number | null;
  timeRemainingSec: number | null;
  joined: boolean;
  isSupported?: boolean;
};

export type ChallengeDetail = ChallengeSummary & {
  description?: string | null;
  carClass?: string;
  endedEarlyAt?: string | null;
  fastestLapMs: number | null;
  followedWhoJoined?: { id: string; displayName: string }[];
  /** Additional followed joiners beyond the preview cap (aligned with browse). */
  followedWhoJoinedMoreCount?: number;
  countdownTargetIso?: string;
  /** Set when the viewer is banned from this challenge — payload is a skeleton. */
  banned?: boolean;
  banReason?: string | null;
  /** True when the viewer is joined and has posted no sessions yet. */
  canLeave?: boolean;
  /** Null when no custom cover uploaded; client resolves default hero image. */
  coverImageUrl?: string | null;
};

export type ChallengesMeta = {
  tabCounts: {
    upcoming: number;
    live: number;
    past: number;
    joined: number;
  };
  defaultTab: "upcoming" | "live" | "past" | "joined" | null;
  activeChallenges?: number;
  joinedThisSeason?: number;
  yourRank?: number | null;
};

export async function getChallengesMeta(): Promise<ChallengesMeta> {
  return apiGet<ChallengesMeta>("/api/challenges/meta");
}

export type ChallengesSeasonRank = {
  yourRank: number | null;
};

export async function getChallengesSeasonRank(): Promise<ChallengesSeasonRank> {
  return apiGet<ChallengesSeasonRank>("/api/challenges/season-rank");
}

export type ChallengeSocialPreview = {
  preview: { id: string; displayName: string }[];
  moreCount: number;
};

export type ChallengeSocialPreviewResponse = {
  previews: Record<string, ChallengeSocialPreview>;
};

export async function getChallengesSocialPreview(
  challengeIds: string[],
): Promise<ChallengeSocialPreviewResponse> {
  if (challengeIds.length === 0) {
    return { previews: {} };
  }
  const sp = new URLSearchParams({ ids: challengeIds.join(",") });
  return apiGet<ChallengeSocialPreviewResponse>(
    `/api/challenges/social-preview?${sp}`,
  );
}

export async function getChallengeSummary(): Promise<ChallengeSummary[]> {
  const raw = await apiGet<ChallengeSummary[]>("/api/challenges/summary");
  return Array.isArray(raw) ? raw.map(normalizeChallengeSummaryRow) : [];
}

function normalizeChallengeSummaryRow(row: ChallengeSummary): ChallengeSummary {
  const fastest =
    typeof row.fastestLapMs === "number" && Number.isFinite(row.fastestLapMs)
      ? row.fastestLapMs
      : null;
  const your =
    typeof row.yourBestLapMs === "number" && Number.isFinite(row.yourBestLapMs)
      ? row.yourBestLapMs
      : null;
  return {
    ...row,
    fastestLapMs: fastest,
    yourBestLapMs: your,
  };
}

export type ChallengeListItem = {
  id: string;
  title: string;
  sim: string;
  track: string;
  carClass: string;
  vehicle: string;
  kind: "challenge";
  status: ChallengeApiStatus;
  participants: number;
  startsAt: string;
  endsAt: string;
  fastestLapMs: number | null;
  targetTimeMs: number | null;
  /** Present on GET /api/challenges when viewer is signed in (session/JWT). */
  joined: boolean;
  yourBestLapMs: number | null;
  yourPosition: number | null;
  followedWhoJoined: { id: string; displayName: string }[];
  followedWhoJoinedMoreCount: number;
  timeRemainingSec: number | null;
  /** Null when no custom cover uploaded; client resolves default hero image. */
  coverImageUrl?: string | null;
};

export type ChallengeListResponse = {
  items: ChallengeListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ChallengeListParams = {
  page?: number;
  pageSize?: number;
  /** Comma-separated UPCOMING,ACTIVE,ENDED */
  status?: string;
  sim?: string;
  q?: string;
  carClass?: string;
  /** Only challenges the current user has joined (ignored when logged out). */
  joinedOnly?: boolean;
  /** startsAtAsc | startsAtDesc — default desc on server. */
  sort?: "startsAtAsc" | "startsAtDesc";
};

export async function getChallengeList(
  params?: ChallengeListParams,
): Promise<ChallengeListResponse> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.status) sp.set("status", params.status);
  if (params?.sim) sp.set("sim", params.sim);
  if (params?.q) sp.set("q", params.q);
  if (params?.carClass) sp.set("carClass", params.carClass);
  if (params?.joinedOnly === true) sp.set("joinedOnly", "true");
  if (params?.sort) sp.set("sort", params.sort);
  const qs = sp.toString();
  const path = qs ? `/api/challenges?${qs}` : "/api/challenges";
  return apiGet<ChallengeListResponse>(path);
}

export async function getChallenge(
  id: string,
): Promise<ChallengeDetail | null> {
  try {
    const data = await apiGet<ChallengeDetail>(
      `/api/challenges/${encodeURIComponent(id)}`,
    );
    if (!data || typeof data !== "object") return null;
    return normalizeChallengeSummaryRow(
      data as ChallengeSummary,
    ) as ChallengeDetail;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    return null;
  }
}

export async function joinChallenge(
  id: string,
): Promise<{ ok: boolean; challengeId: string }> {
  return apiPost<{ ok: boolean; challengeId: string }>(
    `/api/challenges/${encodeURIComponent(id)}/join`,
    {},
  );
}

/**
 * Leave a challenge the viewer joined. Server returns 409 HAS_POSTS when
 * the viewer has any Session attached to the challenge.
 */
export async function leaveChallenge(id: string): Promise<{ ok: true }> {
  return fetchApi(
    "DELETE",
    `/api/challenges/${encodeURIComponent(id)}/leave`,
    undefined,
    false,
  );
}

export type LeaderboardVerification = "UNVERIFIED" | "VERIFIED";

export type ChallengeLeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  bestLapMs: number;
  bestLapAt: string;
  attemptCount: number;
  verification: LeaderboardVerification;
  bestSessionId: string | null;
  isPro?: boolean;
};

export async function getChallengeLeaderboard(
  challengeId: string,
  page = 1,
  pageSize = 50,
): Promise<{
  items: ChallengeLeaderboardRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiGet(
    `/api/challenges/${encodeURIComponent(challengeId)}/leaderboard?${sp}`,
  );
}

export type EntrantSessionRow = {
  userId: string;
  username: string;
  bestLapMs: number;
  verification: LeaderboardVerification;
  sessionId: string | null;
};

export async function getChallengeEntrantSessions(
  challengeId: string,
  page = 1,
  pageSize = 50,
): Promise<{
  items: EntrantSessionRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiGet(
    `/api/challenges/${encodeURIComponent(challengeId)}/entrant-sessions?${sp}`,
  );
}

/** Admin API — Bearer JWT */
export type AdminChallengeRow = {
  id: string;
  title: string;
  status: ChallengeApiStatus;
  sim: string;
  track: string;
  carClass: string;
  startsAt: string;
  endsAt: string;
  participantCount: number;
  fastestLapMs: number | null;
  createdByDisplayName: string | null;
  coverImageUrl?: string | null;
};

export async function fetchAdminChallengeList(
  params?: ChallengeListParams,
): Promise<{
  items: AdminChallengeRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams();
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.pageSize != null) sp.set("pageSize", String(params.pageSize));
  if (params?.status) sp.set("status", params.status);
  if (params?.sim) sp.set("sim", params.sim);
  if (params?.q) sp.set("q", params.q);
  if (params?.carClass) sp.set("carClass", params.carClass);
  const qs = sp.toString();
  return fetchApi(
    "GET",
    `/api/admin/challenges${qs ? `?${qs}` : ""}`,
    undefined,
    false,
  );
}

export async function fetchAdminChallengeDetail(id: string): Promise<unknown> {
  return fetchApi(
    "GET",
    `/api/admin/challenges/${encodeURIComponent(id)}`,
    undefined,
    false,
  );
}

export async function createAdminChallenge(body: {
  title: string;
  description: string;
  sim: string;
  track: string;
  carClass: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ id: string }> {
  return fetchApi("POST", "/api/admin/challenges", body, false);
}

export async function patchAdminChallenge(
  id: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return fetchApi(
    "PATCH",
    `/api/admin/challenges/${encodeURIComponent(id)}`,
    body,
    false,
  );
}

export async function deleteAdminChallenge(
  id: string,
  confirmation: string,
): Promise<{ ok: boolean }> {
  return fetchApi(
    "DELETE",
    `/api/admin/challenges/${encodeURIComponent(id)}`,
    { confirmation },
    false,
  );
}

export async function uploadAdminChallengeCover(
  challengeId: string,
  file: File,
): Promise<{ coverImageUrl: string }> {
  const formData = new FormData();
  formData.append("cover", file);

  const headers = buildApiAuthHeaders();
  const url = `${API_BASE}/api/admin/challenges/${encodeURIComponent(challengeId)}/cover`;

  const res = await fetch(url, {
    method: "POST",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: formData,
  });

  if (!res.ok) {
    let message = "Cover upload failed";
    let body: unknown;
    try {
      const text = await res.text();
      if (text) {
        try {
          const json = JSON.parse(text) as { message?: string; error?: string };
          body = json;
          message = json.message ?? json.error ?? message;
        } catch {
          message = text;
        }
      }
    } catch {
      // keep default message
    }
    await notifyAuthExpired(false, res.status);
    throw new ApiError(
      res.status,
      message,
      undefined,
      undefined,
      responseRequestId(res.headers.get("x-request-id"), body),
    );
  }

  const data = (await res.json()) as { coverImageUrl?: string };
  if (!data?.coverImageUrl) {
    throw new ApiError(
      500,
      "No cover URL in response",
      undefined,
      undefined,
      responseRequestId(res.headers.get("x-request-id"), data),
    );
  }
  return { coverImageUrl: data.coverImageUrl };
}

export async function deleteAdminChallengeCover(
  challengeId: string,
): Promise<{ ok: true }> {
  return fetchApi(
    "DELETE",
    `/api/admin/challenges/${encodeURIComponent(challengeId)}/cover`,
    undefined,
    false,
  );
}

export type AdminChallengeBanInfo = {
  reason: string | null;
  createdAt: string;
};

export type AdminChallengeLeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  bestLapMs: number;
  bestLapAt: string;
  attemptCount: number;
  verification: LeaderboardVerification;
  bestSessionId: string | null;
  ban?: AdminChallengeBanInfo | null;
};

export async function fetchAdminChallengeLeaderboard(
  challengeId: string,
  page = 1,
  pageSize = 20,
): Promise<{
  items: AdminChallengeLeaderboardRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return fetchApi(
    "GET",
    `/api/admin/challenges/${encodeURIComponent(challengeId)}/leaderboard?${sp}`,
    undefined,
    false,
  );
}

export type AdminChallengeParticipantRow = {
  userId: string;
  displayName: string;
  joinedAt: string;
  ban?: AdminChallengeBanInfo | null;
};

export async function fetchAdminChallengeParticipants(
  challengeId: string,
  params: { page?: number; pageSize?: number; q?: string } = {},
): Promise<{
  items: AdminChallengeParticipantRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page ?? 1));
  sp.set("pageSize", String(params.pageSize ?? 20));
  if (params.q?.trim()) sp.set("q", params.q.trim());
  return fetchApi(
    "GET",
    `/api/admin/challenges/${encodeURIComponent(challengeId)}/participants?${sp}`,
    undefined,
    false,
  );
}

/** Remove a participant: clean wipe (user can rejoin freely). */
export async function removeAdminChallengeParticipant(
  challengeId: string,
  userId: string,
): Promise<{ ok: true }> {
  return fetchApi(
    "DELETE",
    `/api/admin/challenges/${encodeURIComponent(
      challengeId,
    )}/participants/${encodeURIComponent(userId)}`,
    undefined,
    false,
  );
}

export type AdminBanResponse = {
  ok: true;
  ban: {
    challengeId: string;
    userId: string;
    reason: string | null;
    createdAt: string;
  };
};

export async function banAdminChallengeParticipant(
  challengeId: string,
  userId: string,
  reason?: string | null,
): Promise<AdminBanResponse> {
  const body: Record<string, unknown> = { userId };
  if (typeof reason === "string") {
    const trimmed = reason.trim();
    body.reason = trimmed.length > 0 ? trimmed : null;
  }
  return fetchApi(
    "POST",
    `/api/admin/challenges/${encodeURIComponent(challengeId)}/bans`,
    body,
    false,
  );
}

export async function updateAdminChallengeBan(
  challengeId: string,
  userId: string,
  reason: string | null,
): Promise<AdminBanResponse> {
  const trimmed = typeof reason === "string" ? reason.trim() : null;
  return fetchApi(
    "PATCH",
    `/api/admin/challenges/${encodeURIComponent(
      challengeId,
    )}/bans/${encodeURIComponent(userId)}`,
    { reason: trimmed && trimmed.length > 0 ? trimmed : null },
    false,
  );
}

export async function unbanAdminChallengeParticipant(
  challengeId: string,
  userId: string,
): Promise<{ ok: true }> {
  return fetchApi(
    "DELETE",
    `/api/admin/challenges/${encodeURIComponent(
      challengeId,
    )}/bans/${encodeURIComponent(userId)}`,
    undefined,
    false,
  );
}
