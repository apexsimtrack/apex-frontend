import type { QueryClient } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { authMe, updateMe, uploadProfileAvatar } from "@/lib/api/authAndContact";
import { withRequestId } from "@/lib/api/errors";
import type { AuthUser } from "@/lib/api/authAndContact";
import type { ProfileSummary } from "@/lib/api/profile";
import type { WithRootError } from "@/lib/formWithRootError";
import type { ProfileEditFormValues } from "@/lib/validation/profileEdit";
import { withCacheBust, stripQuery } from "@/lib/avatarUpload";
import {
  ownedProfileUserKey,
  profileKeys,
  PROFILE_SUMMARY_ALL_QUERY_FILTER,
} from "@/lib/profileQueryKeys";

type SaveProfileIdentityArgs = {
  user: AuthUser;
  values: ProfileEditFormValues;
  avatarFile: File | null;
  avatarError: string | null;
  form: UseFormReturn<WithRootError<ProfileEditFormValues>>;
  queryClient: QueryClient;
  setUser: (user: AuthUser) => void;
  refreshMe: () => Promise<unknown>;
  /** Optional optimistic summary seed when no cached summary exists. */
  emptySummaryFromUser?: (user: AuthUser) => ProfileSummary;
};

/**
 * Upload optional avatar, PATCH /api/auth/me for name/bio, refresh auth + profile caches.
 * Returns true on success.
 */
export async function saveProfileIdentity({
  user,
  values,
  avatarFile,
  avatarError,
  form,
  queryClient,
  setUser,
  refreshMe,
  emptySummaryFromUser,
}: SaveProfileIdentityArgs): Promise<boolean> {
  if (avatarError) return false;

  const previousAvatarUrl = user.avatarUrl ?? undefined;
  const trimmedName = values.displayName.trim();

  form.clearErrors("root");

  let avatarUrlToSet: string | undefined;
  let uploadedAvatarForSession: string | undefined;

  if (avatarFile) {
    try {
      const uploadRes = await uploadProfileAvatar(avatarFile);
      avatarUrlToSet = uploadRes.avatarUrl;
      uploadedAvatarForSession = withCacheBust(avatarUrlToSet, Date.now());
    } catch (e) {
      const msg = withRequestId(
        e instanceof Error ? e.message : "Avatar upload failed.",
        e,
      );
      form.setError("root", { type: "server", message: msg });
      return false;
    }
  }

  const bioValue = values.tagline.trim() || undefined;
  const payload = {
    displayName: trimmedName,
    tagline: bioValue,
    bio: bioValue,
    avatarUrl: avatarUrlToSet ?? undefined,
  };

  try {
    const updated = await updateMe(payload);

    const u = updated as { tagline?: string; bio?: string };
    const savedBio =
      (u.bio?.trim() ?? u.tagline?.trim() ?? values.tagline.trim()) ||
      undefined;

    const userWithAvatar: AuthUser = {
      ...updated,
      avatarUrl:
        uploadedAvatarForSession ?? updated.avatarUrl ?? undefined,
    };
    setUser(userWithAvatar);

    queryClient.setQueryData<ProfileSummary>(
      profileKeys.summary(ownedProfileUserKey(user)),
      (prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                displayName: updated.displayName ?? trimmedName,
                tagline: savedBio,
                bio: savedBio,
              },
            }
          : emptySummaryFromUser
            ? emptySummaryFromUser(userWithAvatar)
            : prev,
    );

    if (avatarUrlToSet) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const freshUser = await authMe();
        const freshAvatar = freshUser.avatarUrl ?? undefined;
        const freshAvatarBase = stripQuery(freshAvatar);
        const previousAvatarBase = stripQuery(previousAvatarUrl);
        const shouldPreserveUploadedAvatar =
          !freshAvatarBase || freshAvatarBase === previousAvatarBase;
        setUser(
          shouldPreserveUploadedAvatar
            ? {
                ...freshUser,
                avatarUrl:
                  uploadedAvatarForSession ??
                  withCacheBust(avatarUrlToSet, Date.now()),
              }
            : freshUser,
        );
      } catch {
        // Keep optimistic user state if refresh fails.
      }
    } else {
      await refreshMe();
    }

    void queryClient.invalidateQueries(PROFILE_SUMMARY_ALL_QUERY_FILTER);
    const followsId = user.id?.trim();
    if (followsId) {
      void queryClient.invalidateQueries({
        queryKey: profileKeys.publicPreview(followsId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["profile", "followList", followsId],
      });
    }

    return true;
  } catch (e) {
    form.setError("root", {
      type: "server",
      message: withRequestId(
        e instanceof Error ? e.message : "Failed to update profile.",
        e,
      ),
    });
    return false;
  }
}
