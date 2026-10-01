import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api/httpVerbs";
import { withRequestId } from "@/lib/api/errors";
import { patchSessionSocialCaches } from "@/lib/sessionSocialCache";

export function useSessionLike(
  sessionId: string,
  likedByMe: boolean,
  likeCount: number,
) {
  const queryClient = useQueryClient();
  const [likePending, setLikePending] = useState(false);

  const toggleLike = useCallback(async () => {
    const sid = sessionId.trim();
    if (!sid || likePending) return;
    setLikePending(true);
    const prevLiked = likedByMe;
    const prevCount = likeCount;
    const nextLiked = !prevLiked;
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));
    patchSessionSocialCaches(queryClient, sid, {
      likedByMe: nextLiked,
      likeCount: nextCount,
    });
    try {
      const data = await apiPost<{ liked: boolean; likeCount: number }>(
        `/api/sessions/${sid}/like`,
        {},
      );
      patchSessionSocialCaches(queryClient, sid, {
        likedByMe: Boolean(data.liked),
        likeCount: Number(data.likeCount ?? 0),
      });
    } catch (e) {
      patchSessionSocialCaches(queryClient, sid, {
        likedByMe: prevLiked,
        likeCount: prevCount,
      });
      toast.error(withRequestId("Could not update like. Please try again.", e));
    } finally {
      setLikePending(false);
    }
  }, [sessionId, likePending, likedByMe, likeCount, queryClient]);

  return { toggleLike, likePending };
}
