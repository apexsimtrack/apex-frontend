import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProfileView } from "@/components/profile/ProfileView";
import { FollowListDialog } from "@/components/FollowListDialog";
import { useAuth } from "@/contexts/AuthContext";
import { resolveApiUrl } from "@/lib/api/config";
import { ApiError, withRequestId } from "@/lib/api/errors";
import {
  getProfileSummaryForUser,
  getProfileRaceHistoryForUser,
  RACE_HISTORY_PAGE_SIZE,
  getUserPublicProfile,
  type ProfileSummary,
} from "@/lib/api/profile";
import { followUser, unfollowUser } from "@/lib/api/followAndLeaderboards";
import { unblockUser } from "@/lib/api/ugcModeration";
import { invalidateAfterUgcModeration } from "@/lib/ugcModerationCache";
import { toast } from "sonner";
import { profileKeys, prefetchFollowList } from "@/lib/profileQueryKeys";
import ProfileSkeleton from "@/pages/profile/ProfileSkeleton";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";

const USER_PROFILE_PATH = "/user";

const contentRootClassName =
  "mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8";

function emptyProfileSummary(id: string, displayName: string): ProfileSummary {
  const emptyBuckets = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0,
  };
  return {
    user: {
      id,
      displayName,
      streakDays: 0,
    },
    totals: {
      races: 0,
      wins: null,
      podiums: null,
      poles: null,
      totalLaps: 0,
      avgFinish: null,
    },
    weekly: {
      buckets: emptyBuckets,
      totalRaces: 0,
      wins: null,
      avgFinish: null,
      totalKm: null,
    },
    mostPlayed: [],
    raceHistory: [],
    statsByGame: [],
    insight: null,
  };
}

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser, loading: authLoading } = useAuth();

  const id = userId?.trim() ?? "";

  const [raceHistoryPage, setRaceHistoryPage] = useState(1);
  const [openList, setOpenList] = useState<"followers" | "following" | null>(
    null,
  );
  const [followLoading, setFollowLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [followActionError, setFollowActionError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setRaceHistoryPage(1);
  }, [id]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const previewQuery = useQuery({
    queryKey: profileKeys.publicPreview(id),
    queryFn: () => getUserPublicProfile(id),
    enabled: Boolean(id),
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status === 404),
  });

  const preview = previewQuery.data ?? null;
  const viewerHasAccess = preview?.viewerHasAccess ?? false;

  const summaryQuery = useQuery({
    queryKey: profileKeys.userSummary(id),
    queryFn: () => getProfileSummaryForUser(id),
    enabled: Boolean(id) && viewerHasAccess,
    retry: (failureCount, err) =>
      !(err instanceof ApiError && (err.status === 404 || err.status === 403)),
  });

  const {
    data: raceHistoryData,
    isPending: raceHistoryLoading,
    isFetching: raceHistoryFetching,
    error: raceHistoryError,
  } = useQuery({
    queryKey: profileKeys.userRaceHistory(id, raceHistoryPage),
    queryFn: () =>
      getProfileRaceHistoryForUser(id, {
        page: raceHistoryPage,
        limit: RACE_HISTORY_PAGE_SIZE,
      }),
    enabled: Boolean(id) && viewerHasAccess,
    placeholderData: (previousData) => previousData,
    retry: (failureCount, err) =>
      !(err instanceof ApiError && (err.status === 404 || err.status === 403)),
  });

  const raceHistoryForbiddenCode =
    viewerHasAccess &&
    raceHistoryError instanceof ApiError &&
    raceHistoryError.status === 403
      ? raceHistoryError.code
      : undefined;

  const notFound =
    previewQuery.error instanceof ApiError && previewQuery.error.status === 404;

  const loadError =
    previewQuery.isError &&
    previewQuery.error &&
    !(
      previewQuery.error instanceof ApiError &&
      previewQuery.error.status === 404
    )
      ? withRequestId(
          previewQuery.error instanceof Error
            ? previewQuery.error.message
            : "Failed to load profile.",
          previewQuery.error,
        )
      : null;

  const previewLoading = Boolean(id) && previewQuery.isPending;

  const handleToggleFollow = useCallback(async () => {
    if (!currentUser || !id || currentUser.id === id) return;
    setFollowLoading(true);
    setFollowActionError(null);
    try {
      const isFollowing = preview?.isFollowing ?? false;
      const pending = preview?.followRelationship === "pending";
      if (isFollowing || pending) {
        await unfollowUser(id);
      } else {
        await followUser(id);
      }
      const pub = await getUserPublicProfile(id);
      queryClient.setQueryData(profileKeys.publicPreview(id), pub);
      void queryClient.invalidateQueries({
        queryKey: ["profile", "followList", id],
      });
      // Preview counts come from mutation response / setQueryData — avoid
      // refetching race-history / home feed on follow toggle.
    } catch (e) {
      setFollowActionError(
        withRequestId(e instanceof Error ? e.message : "Could not update follow status.", e),
      );
    } finally {
      setFollowLoading(false);
    }
  }, [
    currentUser,
    id,
    preview,
    queryClient,
    setFollowLoading,
    setFollowActionError,
  ]);

  const handleUnblockUser = useCallback(async () => {
    if (!currentUser || !id) return;
    setBlockLoading(true);
    setFollowActionError(null);
    try {
      await unblockUser(id);
      toast.success("User unblocked");
      invalidateAfterUgcModeration(queryClient);
      const pub = await getUserPublicProfile(id);
      queryClient.setQueryData(profileKeys.publicPreview(id), pub);
    } catch (e) {
      setFollowActionError(
        withRequestId(e instanceof Error ? e.message : "Could not unblock this user.", e),
      );
    } finally {
      setBlockLoading(false);
    }
  }, [currentUser, id, queryClient]);

  if (!id) {
    return (
      <>
        <PageMeta
          title={`Profile | ${COMPANY_NAME}`}
          description={`${COMPANY_NAME} driver profiles and race history.`}
          path={USER_PROFILE_PATH}
          noindex
        />
        <div className={contentRootClassName}>
          <p className="text-center font-apex-headline text-lg text-apex-on-surface">
            Invalid profile link.
          </p>
        </div>
      </>
    );
  }

  if (!authLoading && currentUser?.id === id) {
    return <Navigate to="/profile" replace />;
  }

  if (previewLoading || authLoading) {
    return (
      <>
        <PageMeta
          title={`Profile | ${COMPANY_NAME}`}
          description={`${COMPANY_NAME} driver profile, stats, and race history.`}
          path={`${USER_PROFILE_PATH}/${id}`}
        />
        <div className={contentRootClassName}>
          <ProfileSkeleton showBackLink />
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <PageMeta
          title={`User not found | ${COMPANY_NAME}`}
          description="This profile does not exist or was removed."
          path={`${USER_PROFILE_PATH}/${id}`}
          setCanonical={false}
          noindex
        />
        <div className={contentRootClassName}>
          <div className="text-center">
            <p className="font-apex-headline text-lg text-apex-on-surface">
              User not found
            </p>
          </div>
        </div>
      </>
    );
  }

  if (loadError || !preview) {
    return (
      <>
        <PageMeta
          title={`Profile | ${COMPANY_NAME}`}
          description={loadError ?? "Could not load profile."}
          path={`${USER_PROFILE_PATH}/${id}`}
          noindex
        />
        <div className={contentRootClassName}>
          <div className="mx-auto max-w-md text-center">
            <p className="mb-4 font-apex-body text-sm text-apex-error">
              {loadError ?? "Something went wrong."}
            </p>
            <Link
              to="/community"
              className="font-apex-body text-sm text-apex-primary transition-colors hover:text-apex-primary/80"
            >
              Back to community
            </Link>
          </div>
        </div>
      </>
    );
  }

  const profileLocked = !viewerHasAccess;

  const profileData: ProfileSummary =
    viewerHasAccess && summaryQuery.data
      ? summaryQuery.data
      : emptyProfileSummary(id, preview.displayName?.trim() || "Driver");

  const avatarUrl = resolveApiUrl(preview.avatarUrl) ?? undefined;
  const bio =
    preview.bio?.trim() ||
    (profileData.user as { tagline?: string; bio?: string }).bio?.trim() ||
    (profileData.user as { tagline?: string; bio?: string }).tagline?.trim() ||
    undefined;

  const displayProfile: ProfileSummary = {
    ...profileData,
    user: {
      ...profileData.user,
      displayName: preview.displayName || profileData.user.displayName,
    },
  };

  const showFollowUi = Boolean(currentUser && currentUser.id !== id);

  const displayName =
    preview.displayName?.trim() ||
    profileData.user.displayName?.trim() ||
    "Driver";
  const userSeoDescription = (() => {
    const t = bio?.trim() ?? "";
    if (t.length > 0) {
      return `${t.slice(0, 160)}${t.length > 160 ? "…" : ""}`;
    }
    return `${displayName} on ${COMPANY_NAME} — stats, race history, and community.`;
  })();

  return (
    <>
      <PageMeta
        title={
          preview.privateProfile
            ? `Profile | ${COMPANY_NAME}`
            : `${displayName} | ${COMPANY_NAME}`
        }
        description={
          preview.privateProfile
            ? `This ${COMPANY_NAME} driver profile is private.`
            : userSeoDescription
        }
        path={`${USER_PROFILE_PATH}/${id}`}
        image={preview.privateProfile ? undefined : avatarUrl}
        noindex={preview.privateProfile}
      />
      <div className={contentRootClassName}>
        {followActionError && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-error/10 px-4 py-3">
            <p className="font-apex-body text-sm text-apex-error">
              {followActionError}
            </p>
            <button
              type="button"
              onClick={() => setFollowActionError(null)}
              className="shrink-0 font-apex-body text-sm font-medium text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
            >
              Dismiss
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1.5 font-apex-body text-sm text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          Back
        </button>
        <ProfileView
          profile={displayProfile}
          avatarUrl={avatarUrl || undefined}
          bio={bio}
          followersCount={preview.followersCount}
          followingCount={preview.followingCount}
          isCurrentUser={false}
          isFollowing={preview.isFollowing}
          profileLocked={profileLocked}
          summaryLoading={viewerHasAccess && summaryQuery.isPending}
          followRelationship={preview.followRelationship}
          targetPrivateProfile={preview.privateProfile}
          followLoading={followLoading}
          onToggleFollow={showFollowUi ? handleToggleFollow : undefined}
          blockedByMe={Boolean(preview.blockedByMe)}
          canBlockUser={showFollowUi}
          onUnblockUser={showFollowUi ? handleUnblockUser : undefined}
          blockLoading={blockLoading}
          onOpenFollowers={
            viewerHasAccess ? () => setOpenList("followers") : undefined
          }
          onOpenFollowing={
            viewerHasAccess ? () => setOpenList("following") : undefined
          }
          onPrefetchFollowers={
            viewerHasAccess
              ? () => prefetchFollowList(queryClient, id, "followers")
              : undefined
          }
          onPrefetchFollowing={
            viewerHasAccess
              ? () => prefetchFollowList(queryClient, id, "following")
              : undefined
          }
          raceHistoryPagination={
            viewerHasAccess
              ? {
                  page: raceHistoryData?.page ?? raceHistoryPage,
                  limit: raceHistoryData?.limit ?? RACE_HISTORY_PAGE_SIZE,
                  totalPages: raceHistoryData?.totalPages ?? 1,
                  total: raceHistoryData?.total ?? 0,
                  items: raceHistoryData?.items ?? [],
                  loading: raceHistoryLoading,
                  fetching: raceHistoryFetching,
                  onPageChange: setRaceHistoryPage,
                }
              : undefined
          }
          raceHistoryForbiddenCode={raceHistoryForbiddenCode}
          isPro={preview.isPro}
          profileUserId={id}
          challengeBadges={preview.challengeBadges}
          challengeBadgeCount={preview.challengeBadgeCount}
        />
      </div>

      <FollowListDialog
        key={`${id}-${openList ?? "closed"}`}
        open={openList !== null}
        onOpenChange={(open) => !open && setOpenList(null)}
        userId={id}
        listKind={openList}
        profileLinkBase="/user"
      />
    </>
  );
}
