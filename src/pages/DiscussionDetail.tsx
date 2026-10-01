import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getDiscussion,
  getDiscussionComments,
  createDiscussionComment,
  updateDiscussionComment,
  deleteDiscussionComment,
  getDiscussionCommentReplies,
  DISCUSSION_COMMENTS_PAGE_SIZE,
  likeDiscussion,
  unlikeDiscussion,
  updateDiscussion,
  deleteDiscussion,
  uploadDiscussionImage,
  deleteDiscussionImage,
  type Discussion,
  type DiscussionComment,
  type DiscussionCommentsPageResult,
} from "@/lib/api/community";
import {
  resolveDiscussionAvatarSrc,
  getDiscussionAuthorId,
} from "@/lib/api/config";
import { withRequestId, apiErrorText, ApiError } from "@/lib/api/errors";
import { discussionDetailQueryKey } from "@/lib/community/discussionDetailPrefetch";
import type { AuthRedirectState } from "@/auth/authRedirect";
import { AUTH_PATHS } from "@/config/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDiscussionAuthorDisplay,
  getDiscussionAuthorInitials,
} from "@/lib/utils";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { appOutlineButtonClassName } from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";
import DiscussionPostCard from "@/pages/discussion/DiscussionPostCard";
import DiscussionCommentList from "@/pages/discussion/DiscussionCommentList";
import DiscussionReplyForm from "@/pages/discussion/DiscussionReplyForm";
import DiscussionReplyModal from "@/pages/discussion/DiscussionReplyModal";
import DiscussionReplyFab from "@/pages/discussion/DiscussionReplyFab";
import DiscussionDetailSkeleton from "@/pages/discussion/DiscussionDetailSkeleton";
import DiscussionEditModal from "@/pages/discussion/DiscussionEditModal";
import DiscussionDeleteDialog from "@/pages/discussion/DiscussionDeleteDialog";
import DiscussionOriginalPostModal from "@/pages/discussion/DiscussionOriginalPostModal";
import {
  normalizeDiscussionReplyBody,
  DISCUSSION_REPLY_MAX_LENGTH,
} from "@/pages/discussion/discussionReplyUtils";
import { useRecordDiscussionView } from "@/hooks/useRecordDiscussionView";
import { commentDeleteCountDelta } from "@/components/comments/commentUi";
import {
  COMMENT_REPLIES_PAGE_SIZE,
  mergeCommentReplies,
  nextCommentRepliesOffset,
  preserveLoadedReplies,
} from "@/components/comments/replyPagination";

const COMMUNITY_PATH = "/community";
const COMMENTS_SORT = "desc" as const;
const DEFAULT_REPLY_BAR_HEIGHT = 120;

function discussionLoadErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) {
    return withRequestId("Discussion not found.", e);
  }
  return withRequestId("Failed to load discussion.", e);
}

function discussionPath(id: string) {
  return `/discussion/${id}`;
}

function CommunityBackLink() {
  return (
    <Link
      to={COMMUNITY_PATH}
      className="inline-flex items-center gap-1.5 font-apex-body text-sm text-apex-on-surface-variant transition-colors hover:text-apex-on-surface"
    >
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      Community
    </Link>
  );
}

function PageShell({
  children,
  replyBarPinned,
  replyBarHeight,
}: {
  children: ReactNode;
  replyBarPinned?: boolean;
  replyBarHeight?: number;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8",
        replyBarPinned && "lg:pb-[calc(var(--reply-bar-h,7.5rem)+0.5rem)]",
      )}
      style={
        replyBarPinned && replyBarHeight != null
          ? ({ "--reply-bar-h": `${replyBarHeight}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <CommunityBackLink />
        {children}
      </div>
    </div>
  );
}

export default function DiscussionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const userKey = user?.id?.trim() || "anon";
  const detailKey = discussionDetailQueryKey(id ?? "", userKey);

  const discussionQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => getDiscussion(id!),
    enabled: Boolean(id) && !authLoading,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status === 404),
  });

  const [commentsPage, setCommentsPage] = useState(1);
  const commentsQueryKey = [
    "discussion",
    "comments",
    id ?? "",
    commentsPage,
    COMMENTS_SORT,
  ] as const;
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyBarPinned, setReplyBarPinned] = useState(true);
  const [replyBarHeight, setReplyBarHeight] = useState(
    DEFAULT_REPLY_BAR_HEIGHT,
  );
  const dockAnchorRef = useRef<HTMLDivElement>(null);

  const handleDockMetricsChange = useCallback(
    (metrics: { pinned: boolean; barHeight: number }) => {
      setReplyBarPinned(metrics.pinned);
      setReplyBarHeight(metrics.barHeight);
    },
    [],
  );

  const commentsQuery = useQuery({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const cached =
        queryClient.getQueryData<DiscussionCommentsPageResult>(
          commentsQueryKey,
        );
      const fresh = await getDiscussionComments(id!, {
        page: commentsPage,
        limit: DISCUSSION_COMMENTS_PAGE_SIZE,
        sort: COMMENTS_SORT,
      });
      return {
        ...fresh,
        items: preserveLoadedReplies(fresh.items, cached?.items),
      };
    },
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

  const discussion = discussionQuery.data ?? null;
  const comments: DiscussionComment[] = commentsQuery.data?.items ?? [];

  useEffect(() => {
    if (!commentsQuery.data || !location.hash.startsWith("#comment-")) return;
    const targetId = decodeURIComponent(location.hash.slice(1));
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [commentsQuery.data, location.hash]);

  const discussionError = discussionQuery.isError
    ? discussionLoadErrorMessage(discussionQuery.error)
    : null;

  const commentsError = commentsQuery.isError
    ? withRequestId(
        commentsQuery.error instanceof Error
          ? commentsQuery.error.message
          : "Failed to load comments.",
        commentsQuery.error,
      )
    : null;

  const loading =
    Boolean(id) && !discussion && (authLoading || discussionQuery.isPending);

  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [postAvatarFailed, setPostAvatarFailed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [threadReplyOpenId, setThreadReplyOpenId] = useState<string | null>(
    null,
  );
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditError, setCommentEditError] = useState<string | null>(null);
  const [threadReplyError, setThreadReplyError] = useState<string | null>(null);
  const [loadingMoreRootId, setLoadingMoreRootId] = useState<string | null>(
    null,
  );

  const bumpDiscussionCommentCount = (delta: number) => {
    queryClient.setQueryData<Discussion>(detailKey, (prev) => {
      if (!prev) return prev;
      const prevCount =
        prev.commentsCount ?? prev.commentCount ?? prev.replies ?? 0;
      const nextCount = Math.max(0, prevCount + delta);
      return {
        ...prev,
        commentsCount: nextCount,
        commentCount: nextCount,
        replies: nextCount,
      };
    });
  };

  const patchCommentsPage = (
    updater: (
      page: DiscussionCommentsPageResult,
    ) => DiscussionCommentsPageResult,
  ) => {
    queryClient.setQueryData<DiscussionCommentsPageResult>(
      commentsQueryKey,
      (prev) => (prev ? updater(prev) : prev),
    );
  };

  const postMutation = useMutation({
    mutationFn: (body: string) => createDiscussionComment(id!, body),
    onSuccess: () => {
      setReplyBody("");
      setReplyModalOpen(false);
      if (!id) return;
      setCommentsPage(1);
      bumpDiscussionCommentCount(1);
      void queryClient.invalidateQueries({
        queryKey: ["discussion", "comments", id],
      });
      void queryClient.invalidateQueries({ queryKey: ["discussions"] });
      requestAnimationFrame(() => {
        document
          .getElementById("replies-heading")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    onError: (e: unknown) => {
      setReplyError(
        withRequestId(e instanceof Error ? e.message : "Failed to post reply.", e),
      );
    },
  });

  const nestedReplyMutation = useMutation({
    mutationFn: ({ parentId, body }: { parentId: string; body: string }) =>
      createDiscussionComment(id!, body, parentId),
    onMutate: async ({ parentId, body }) => {
      await queryClient.cancelQueries({
        queryKey: ["discussion", "comments", id],
      });
      const previous =
        queryClient.getQueryData<DiscussionCommentsPageResult>(
          commentsQueryKey,
        );
      const optimistic: DiscussionComment = {
        id: `temp-${Date.now()}`,
        body,
        createdAt: new Date().toISOString(),
        author: {
          id: user?.id ?? "",
          displayName: user?.displayName ?? user?.name ?? "You",
          avatarUrl: user?.avatarUrl ?? null,
        },
        parentId,
        replies: [],
        replyCount: 0,
      };
      patchCommentsPage((page) => ({
        ...page,
        items: page.items.map((item) =>
          item.id === parentId
            ? {
                ...item,
                replies: [optimistic, ...(item.replies ?? [])],
                replyCount: (item.replyCount ?? item.replies?.length ?? 0) + 1,
              }
            : item,
        ),
      }));
      bumpDiscussionCommentCount(1);
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(commentsQueryKey, ctx.previous);
        bumpDiscussionCommentCount(-1);
      }
      setThreadReplyError(
        withRequestId(err instanceof Error ? err.message : "Failed to post reply.", err),
      );
    },
    onSuccess: () => {
      setThreadReplyError(null);
      setThreadReplyOpenId(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["discussion", "comments", id],
      });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateDiscussionComment(id!, commentId, body),
    onMutate: async ({ commentId, body }) => {
      await queryClient.cancelQueries({
        queryKey: ["discussion", "comments", id],
      });
      const previous =
        queryClient.getQueryData<DiscussionCommentsPageResult>(
          commentsQueryKey,
        );
      patchCommentsPage((page) => ({
        ...page,
        items: page.items.map((item) => {
          if (item.id === commentId) {
            return {
              ...item,
              body,
              originalBody: item.body,
              editedAt: new Date().toISOString(),
              wasEdited: true,
            };
          }
          return {
            ...item,
            replies: (item.replies ?? []).map((r) =>
              r.id === commentId
                ? {
                    ...r,
                    body,
                    originalBody: r.body,
                    editedAt: new Date().toISOString(),
                    wasEdited: true,
                  }
                : r,
            ),
          };
        }),
      }));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous)
        queryClient.setQueryData(commentsQueryKey, ctx.previous);
      setCommentEditError(
        withRequestId(err instanceof Error ? err.message : "Failed to edit comment.", err),
      );
    },
    onSuccess: () => {
      setCommentEditError(null);
      setEditingCommentId(null);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["discussion", "comments", id],
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteDiscussionComment(id!, commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({
        queryKey: ["discussion", "comments", id],
      });
      const previous =
        queryClient.getQueryData<DiscussionCommentsPageResult>(
          commentsQueryKey,
        );
      const targetRoot = previous?.items.find((item) => item.id === commentId);
      // Deleting a root takes its replies with it, so the thread leaves the list
      // whether the server hard-deletes it or tombstones the whole thread.
      const removesThread = targetRoot != null;
      const countDelta = commentDeleteCountDelta(targetRoot);
      patchCommentsPage((page) => ({
        ...page,
        total: removesThread ? Math.max(0, page.total - 1) : page.total,
        items: removesThread
          ? page.items.filter((item) => item.id !== commentId)
          : page.items.map((item) => ({
              ...item,
              replies: (item.replies ?? []).map((r) =>
                r.id === commentId
                  ? {
                      ...r,
                      deletedAt: new Date().toISOString(),
                      body: "",
                    }
                  : r,
              ),
            })),
      }));
      bumpDiscussionCommentCount(-countDelta);
      return { previous, countDelta };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(commentsQueryKey, ctx.previous);
        bumpDiscussionCommentCount(ctx.countDelta);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["discussion", "comments", id],
      });
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: ["discussions"] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing discussion id");
      const current = queryClient.getQueryData<Discussion>(detailKey);
      return current?.likedByMe ? unlikeDiscussion(id) : likeDiscussion(id);
    },
    onSuccess: (data) => {
      if (!id) return;
      queryClient.setQueryData<Discussion>(detailKey, (prev) =>
        prev
          ? {
              ...prev,
              likeCount: data.likeCount,
              likedByMe: data.likedByMe,
            }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ["discussions"] });
    },
    onError: () => {
      if (id)
        void queryClient.invalidateQueries({
          queryKey: detailKey,
        });
    },
  });

  const posting = postMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: () => deleteDiscussion(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["discussions"] });
      setDeleteOpen(false);
      navigate(COMMUNITY_PATH);
    },
    onError: (e: unknown) => {
      console.error(e);
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing discussion id");
      const data = await updateDiscussion(id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
      });
      if (editRemoveImage) {
        await deleteDiscussionImage(id);
        return { ...data, imageUrl: null };
      }
      if (editImageFile) {
        const { imageUrl } = await uploadDiscussionImage(id, editImageFile);
        return { ...data, imageUrl };
      }
      return data;
    },
    onSuccess: (data) => {
      if (!id) return;
      queryClient.setQueryData<Discussion>(detailKey, data);
      setEditOpen(false);
      setEditError(null);
      setEditImageFile(null);
      setEditRemoveImage(false);
      void queryClient.invalidateQueries({ queryKey: ["discussions"] });
    },
    onError: (e: unknown) => {
      setEditError(
        apiErrorText(e, "Could not save changes."),
      );
    },
  });

  const handleOpenReplyModal = () => {
    if (!user) {
      const state: AuthRedirectState = {
        message: "Sign in to reply.",
        from: `${location.pathname}${location.search}`,
      };
      navigate(AUTH_PATHS.login, { state });
      return;
    }
    setReplyError(null);
    setReplyModalOpen(true);
  };

  const handleCloseReplyModal = () => {
    if (posting) return;
    setReplyModalOpen(false);
    setReplyError(null);
  };

  const handlePostReply = () => {
    const body = normalizeDiscussionReplyBody(replyBody);
    if (!body || !id) {
      if (replyBody.trim()) setReplyError("Reply cannot be empty.");
      return;
    }
    if (body.length > DISCUSSION_REPLY_MAX_LENGTH) {
      setReplyError(
        `Reply must be ${DISCUSSION_REPLY_MAX_LENGTH} characters or fewer.`,
      );
      return;
    }
    setReplyError(null);
    postMutation.mutate(body);
  };

  const handleLikeClick = () => {
    if (!user) {
      const state: AuthRedirectState = {
        message: "Sign in to like posts.",
        from: `${location.pathname}${location.search}`,
      };
      navigate(AUTH_PATHS.login, { state });
      return;
    }
    if (!id || likeMutation.isPending) return;
    likeMutation.mutate();
  };

  const loadComments = () => {
    void commentsQuery.refetch();
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    setCommentsPage(1);
  }, [id]);

  useRecordDiscussionView(id, {
    enabled: Boolean(id && discussionQuery.isSuccess && discussion),
  });

  useEffect(() => {
    setPostAvatarFailed(false);
  }, [discussion?.id, user?.id, user?.avatarUrl]);

  useEffect(() => {
    if (!editOpen || !discussion) return;
    setEditTitle(discussion.title);
    setEditDescription(
      (discussion.content ?? discussion.description ?? "").trim() || "",
    );
    setEditError(null);
    setEditImageFile(null);
    setEditRemoveImage(false);
  }, [editOpen, discussion]);

  if (!id) {
    return (
      <>
        <PageMeta
          title={`Community | ${COMPANY_NAME}`}
          description={`Discussions on ${COMPANY_NAME}.`}
          path={COMMUNITY_PATH}
          noindex
        />
        <PageShell>
          <p className="font-apex-body text-sm text-apex-on-surface-variant">
            Invalid post ID.
          </p>
        </PageShell>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageMeta
          title={`Discussion | ${COMPANY_NAME}`}
          description={`Community discussion on ${COMPANY_NAME}.`}
          path={discussionPath(id)}
        />
        <PageShell>
          <DiscussionDetailSkeleton />
        </PageShell>
      </>
    );
  }

  if (discussionError || !discussion) {
    return (
      <>
        <PageMeta
          title={`Discussion | ${COMPANY_NAME}`}
          description={discussionError ?? "Discussion not found."}
          path={discussionPath(id)}
          noindex
        />
        <PageShell>
          <div className="rounded-xl border border-dashed border-apex-outline-variant/20 bg-apex-surface-container-low px-6 py-10 text-center">
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              {discussionError ?? "Post not found."}
            </p>
            <Button
              type="button"
              variant="outline"
              className={cn("mt-5", appOutlineButtonClassName)}
              asChild
            >
              <Link to={COMMUNITY_PATH}>Back to Community</Link>
            </Button>
          </div>
        </PageShell>
      </>
    );
  }

  const authorDisplay = getDiscussionAuthorDisplay(discussion.author);
  const authorId = getDiscussionAuthorId(discussion.author);
  const description =
    discussion.content ??
    discussion.description ??
    discussion.excerpt ??
    discussion.title;
  const avatarSrc = resolveDiscussionAvatarSrc(discussion.author, user);
  const showPostAvatar = Boolean(avatarSrc?.trim()) && !postAvatarFailed;
  const initials = getDiscussionAuthorInitials(authorDisplay);

  const discussionSnippet =
    typeof description === "string"
      ? `${description.trim().slice(0, 160)}${description.trim().length > 160 ? "…" : ""}`
      : `${discussion.title} — ${COMPANY_NAME} community`;

  const isOwner =
    Boolean(user) && getDiscussionAuthorId(discussion.author) === user.id;
  const alreadyEdited = Boolean(discussion.editedAt ?? discussion.wasEdited);
  const showEditedBadge = Boolean(
    discussion.wasEdited || discussion.editedAt || discussion.originalBody,
  );

  const repliesTotal =
    discussion.commentCount ??
    discussion.commentsCount ??
    discussion.replies ??
    commentsQuery.data?.total ??
    0;
  const threadTotal = commentsQuery.data?.total ?? comments.length;
  const commentsPageSize =
    commentsQuery.data?.limit ?? DISCUSSION_COMMENTS_PAGE_SIZE;
  const commentsTotalPages = commentsQuery.data?.totalPages ?? 1;
  const commentsRange =
    threadTotal === 0
      ? null
      : {
          start: (commentsPage - 1) * commentsPageSize + 1,
          end: Math.min(commentsPage * commentsPageSize, threadTotal),
        };

  return (
    <>
      <PageMeta
        title={`${discussion.title} | ${COMPANY_NAME}`}
        description={discussionSnippet}
        path={discussionPath(id)}
        image={avatarSrc}
        ogType="article"
      />
      <PageShell
        replyBarPinned={replyBarPinned}
        replyBarHeight={replyBarHeight}
      >
        <DiscussionPostCard
          discussion={discussion}
          authorDisplay={authorDisplay}
          authorId={authorId}
          description={description}
          avatarSrc={avatarSrc}
          showPostAvatar={showPostAvatar}
          initials={initials}
          isOwner={isOwner}
          alreadyEdited={alreadyEdited}
          showEditedBadge={showEditedBadge}
          signedIn={Boolean(user)}
          onPostAvatarError={() => setPostAvatarFailed(true)}
          onLikeClick={handleLikeClick}
          likePending={likeMutation.isPending}
          onEditClick={() => setEditOpen(true)}
          onDeleteClick={() => setDeleteOpen(true)}
          onOriginalClick={() => setOriginalOpen(true)}
        />

        <DiscussionCommentList
          repliesTotal={repliesTotal}
          threadTotal={threadTotal}
          comments={comments}
          commentsError={commentsError}
          commentsPage={commentsPage}
          commentsTotalPages={commentsTotalPages}
          commentsFetching={commentsQuery.isFetching}
          commentsRange={commentsRange}
          onRetryComments={loadComments}
          onPageChange={setCommentsPage}
          dockAnchorRef={dockAnchorRef}
          currentUserId={user?.id ?? null}
          isAdmin={user?.role === "ADMIN"}
          signedIn={Boolean(user)}
          replyOpenId={threadReplyOpenId}
          editingId={editingCommentId}
          editError={commentEditError}
          replyError={threadReplyError}
          posting={
            nestedReplyMutation.isPending ||
            editCommentMutation.isPending ||
            deleteCommentMutation.isPending
          }
          onToggleReply={(rootId) => {
            setThreadReplyError(null);
            setThreadReplyOpenId((cur) => (cur === rootId ? null : rootId));
          }}
          onToggleEdit={(commentId) => {
            setCommentEditError(null);
            setEditingCommentId(commentId);
          }}
          onSubmitReply={(rootId, body) => {
            if (!user) {
              const state: AuthRedirectState = {
                message: "Sign in to reply.",
                from: `${location.pathname}${location.search}`,
              };
              navigate(AUTH_PATHS.login, { state });
              return;
            }
            nestedReplyMutation.mutate({ parentId: rootId, body });
          }}
          onSubmitEdit={(commentId, body) =>
            editCommentMutation.mutate({ commentId, body })
          }
          onDelete={(commentId) => deleteCommentMutation.mutate(commentId)}
          loadingMoreRootId={loadingMoreRootId}
          onLoadMoreReplies={(rootId) => {
            if (!id || loadingMoreRootId) return;
            const current = queryClient
              .getQueryData<DiscussionCommentsPageResult>(commentsQueryKey)
              ?.items.find((item) => item.id === rootId);
            const offset = nextCommentRepliesOffset(
              current?.replies?.length ?? 0,
            );
            setLoadingMoreRootId(rootId);
            void getDiscussionCommentReplies(id, rootId, {
              offset,
              limit: COMMENT_REPLIES_PAGE_SIZE,
            })
              .then((res) => {
                patchCommentsPage((pageData) => ({
                  ...pageData,
                  items: pageData.items.map((item) =>
                    item.id === rootId
                      ? {
                          ...item,
                          replies: mergeCommentReplies(item.replies, res.items),
                          replyCount: res.total,
                          hasMoreReplies: res.hasMore,
                        }
                      : item,
                  ),
                }));
              })
              .finally(() => setLoadingMoreRootId(null));
          }}
        />

        <DiscussionReplyForm
          dockAnchorRef={dockAnchorRef}
          onDockMetricsChange={handleDockMetricsChange}
          replyBody={replyBody}
          replyError={replyError}
          posting={posting}
          onReplyBodyChange={setReplyBody}
          onPostReply={handlePostReply}
        />
      </PageShell>

      <DiscussionReplyFab onClick={handleOpenReplyModal} />

      <DiscussionReplyModal
        open={replyModalOpen}
        onClose={handleCloseReplyModal}
        replyBody={replyBody}
        replyError={replyError}
        posting={posting}
        onReplyBodyChange={setReplyBody}
        onPostReply={handlePostReply}
      />

      <DiscussionEditModal
        open={editOpen}
        editTitle={editTitle}
        editDescription={editDescription}
        editError={editError}
        saving={editMutation.isPending}
        currentImageUrl={discussion.imageUrl}
        imageFile={editImageFile}
        removeImage={editRemoveImage}
        onClose={() => setEditOpen(false)}
        onSave={() => editMutation.mutate()}
        onTitleChange={setEditTitle}
        onDescriptionChange={setEditDescription}
        onImageFileChange={setEditImageFile}
        onRemoveImageChange={setEditRemoveImage}
      />

      <DiscussionOriginalPostModal
        open={originalOpen}
        discussion={discussion}
        onClose={() => setOriginalOpen(false)}
      />

      <DiscussionDeleteDialog
        open={deleteOpen}
        deleting={deleteMutation.isPending}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
