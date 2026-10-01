import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import {
  apiPost,
  ApiError,
  withRequestId,
  getSessionCommentsPage,
  createSessionComment,
  updateSessionComment,
  deleteSessionComment,
  getSessionCommentReplies,
  SESSION_COMMENTS_PAGE_DEFAULT_LIMIT,
  SESSION_COMMENT_MAX_LENGTH,
  type SessionCommentFilter,
  type SessionCommentItem,
  type SessionCommentsPageResult,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { RaceHistoryPagination } from "@/components/RaceHistoryPagination";
import { cn } from "@/lib/utils";
import {
  appManualTextareaClassName,
  appOutlineButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import CommentThread from "@/components/comments/CommentThread";
import { Skeleton } from "@/components/ui/skeleton";
import { commentDeleteCountDelta } from "@/components/comments/commentUi";
import {
  COMMENT_REPLIES_PAGE_SIZE,
  mergeCommentReplies,
  nextCommentRepliesOffset,
  preserveLoadedReplies,
} from "@/components/comments/replyPagination";

const COMMENTS_MODAL_LIMIT = SESSION_COMMENTS_PAGE_DEFAULT_LIMIT;
const SEARCH_DEBOUNCE_MS = 300;

const FILTER_OPTIONS: { value: SessionCommentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "owner", label: "Owner" },
];

type SessionCommentsModalProps = {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
  onCommentDeleted?: (countDelta: number) => void;
  onRefreshSession?: () => void;
  targetCommentId?: string | null;
};

export function SessionCommentsModal({
  sessionId,
  isOpen,
  onClose,
  onCommentAdded,
  onCommentDeleted,
  onRefreshSession,
  targetCommentId,
}: SessionCommentsModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<SessionCommentFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [threadReplyOpenId, setThreadReplyOpenId] = useState<string | null>(
    null,
  );
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditError, setCommentEditError] = useState<string | null>(null);
  const [threadReplyError, setThreadReplyError] = useState<string | null>(null);
  const [loadingMoreRootId, setLoadingMoreRootId] = useState<string | null>(
    null,
  );
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const commentsQueryKey = [
    "sessions",
    sessionId,
    "modal-comments",
    page,
    COMMENTS_MODAL_LIMIT,
    filter,
    debouncedSearch.trim(),
  ] as const;

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    setCommentText("");
    setCommentError(null);
    setPage(1);
    setFilter("all");
    setSearchInput("");
  }, [isOpen, sessionId]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const {
    data: commentsPage,
    isPending: commentsLoading,
    error: commentsQueryError,
    isError: commentsFailed,
    refetch,
  } = useQuery({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const cached =
        queryClient.getQueryData<SessionCommentsPageResult>(commentsQueryKey);
      const fresh = await getSessionCommentsPage(sessionId, {
        page,
        limit: COMMENTS_MODAL_LIMIT,
        filter,
        q: debouncedSearch.trim() || undefined,
      });
      return {
        ...fresh,
        comments: preserveLoadedReplies(fresh.comments, cached?.comments),
      };
    },
    enabled: isOpen && Boolean(sessionId),
  });

  const comments = commentsPage?.comments ?? [];

  useEffect(() => {
    if (!isOpen || !commentsPage || !targetCommentId) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(`comment-${targetCommentId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [commentsPage, isOpen, targetCommentId]);
  const total = commentsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / COMMENTS_MODAL_LIMIT) || 1);
  const range =
    total === 0
      ? null
      : {
          start: (page - 1) * COMMENTS_MODAL_LIMIT + 1,
          end: Math.min(page * COMMENTS_MODAL_LIMIT, total),
        };

  const commentsError = commentsFailed
    ? withRequestId(
        "Can't load comments. Backend may be offline.",
        commentsQueryError,
      )
    : null;

  const hasActiveFilters = filter !== "all" || searchInput.trim().length > 0;

  const charCount = commentText.length;
  const overLimit = charCount > SESSION_COMMENT_MAX_LENGTH;

  const postMutation = useMutation({
    mutationFn: (body: string) =>
      apiPost<{ comment: SessionCommentItem }>(
        `/api/sessions/${sessionId}/comments`,
        { body },
      ),
    onSuccess: async () => {
      setCommentText("");
      setCommentError(null);
      onCommentAdded();
      onRefreshSession?.();
      setFilter("all");
      setSearchInput("");
      setPage(1);
      await queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.message.trim()) {
        setCommentError(withRequestId(err.message, err));
        return;
      }
      setCommentError(
        withRequestId("Can't post right now. Backend may be offline.", err),
      );
    },
  });

  const patchComments = (
    updater: (page: SessionCommentsPageResult) => SessionCommentsPageResult,
  ) => {
    queryClient.setQueryData<SessionCommentsPageResult>(
      commentsQueryKey,
      (prev) => (prev ? updater(prev) : prev),
    );
  };

  const nestedReplyMutation = useMutation({
    mutationFn: ({ parentId, body }: { parentId: string; body: string }) =>
      createSessionComment(sessionId, body, parentId),
    onMutate: async ({ parentId, body }) => {
      await queryClient.cancelQueries({
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
      const previous =
        queryClient.getQueryData<SessionCommentsPageResult>(commentsQueryKey);
      const optimistic: SessionCommentItem = {
        id: `temp-${Date.now()}`,
        userId: user?.id ?? "",
        body,
        createdAt: new Date().toISOString(),
        parentId,
        author: {
          id: user?.id ?? "",
          displayName: user?.displayName ?? user?.name ?? "You",
          avatarUrl: user?.avatarUrl ?? null,
        },
        replies: [],
        replyCount: 0,
      };
      patchComments((pageData) => ({
        ...pageData,
        comments: pageData.comments.map((item) =>
          item.id === parentId
            ? {
                ...item,
                replies: [optimistic, ...(item.replies ?? [])],
                replyCount: (item.replyCount ?? item.replies?.length ?? 0) + 1,
              }
            : item,
        ),
        total: pageData.total,
      }));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous)
        queryClient.setQueryData(commentsQueryKey, ctx.previous);
      setThreadReplyError(
        withRequestId(err instanceof Error ? err.message : "Failed to post reply.", err),
      );
    },
    onSuccess: () => {
      setThreadReplyError(null);
      setThreadReplyOpenId(null);
      onCommentAdded();
      onRefreshSession?.();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      updateSessionComment(sessionId, commentId, body),
    onMutate: async ({ commentId, body }) => {
      await queryClient.cancelQueries({
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
      const previous =
        queryClient.getQueryData<SessionCommentsPageResult>(commentsQueryKey);
      patchComments((pageData) => ({
        ...pageData,
        comments: pageData.comments.map((item) => {
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
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      deleteSessionComment(sessionId, commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
      const previous =
        queryClient.getQueryData<SessionCommentsPageResult>(commentsQueryKey);
      const targetRoot = previous?.comments.find(
        (item) => item.id === commentId,
      );
      // Deleting a root takes its replies with it, so the thread leaves the list
      // whether the server hard-deletes it or tombstones the whole thread.
      const removesThread = targetRoot != null;
      const countDelta = commentDeleteCountDelta(targetRoot);
      patchComments((pageData) => ({
        ...pageData,
        comments: removesThread
          ? pageData.comments.filter((item) => item.id !== commentId)
          : pageData.comments.map((item) => ({
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
        total: removesThread ? Math.max(0, pageData.total - 1) : pageData.total,
      }));
      return { previous, countDelta };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous)
        queryClient.setQueryData(commentsQueryKey, ctx.previous);
    },
    onSuccess: (_data, _vars, ctx) => {
      onRefreshSession?.();
      onCommentDeleted?.(ctx?.countDelta ?? 1);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["sessions", sessionId, "modal-comments"],
      });
    },
  });

  const commentPending = postMutation.isPending;

  const submitComment = useCallback(() => {
    const body = commentText.trim();
    if (!body || commentPending || body.length > SESSION_COMMENT_MAX_LENGTH) {
      return;
    }
    setCommentError(null);
    postMutation.mutate(body);
  }, [commentText, commentPending, postMutation]);

  const clearFilters = useCallback(() => {
    setFilter("all");
    setSearchInput("");
    setPage(1);
  }, []);

  const emptyMessage = useMemo(() => {
    if (hasActiveFilters) {
      return "No comments match your filters.";
    }
    return "No comments yet. Be the first to leave feedback.";
  }, [hasActiveFilters]);

  return (
    <AppBaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Comments"
      size="xl"
      mobileVariant="sheet"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4"
      footer={
        <div className="flex w-full flex-col gap-2">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void submitComment();
              }
            }}
            placeholder="Add a comment…"
            rows={3}
            maxLength={SESSION_COMMENT_MAX_LENGTH + 50}
            disabled={commentPending}
            className={cn(
              appManualTextareaClassName,
              "max-h-32 min-h-[5.5rem] overflow-y-auto",
            )}
            aria-label="Comment text"
          />
          <div className="flex items-center justify-between gap-3">
            <p
              className={cn(
                "font-apex-body text-xs tabular-nums",
                overLimit ? "text-apex-error" : "text-apex-on-surface-variant",
              )}
            >
              {charCount}/{SESSION_COMMENT_MAX_LENGTH}
            </p>
            <button
              type="button"
              className={cn(
                appPrimaryButtonClassName,
                "inline-flex shrink-0 items-center justify-center px-4 py-2",
              )}
              disabled={commentPending || !commentText.trim() || overLimit}
              onClick={() => void submitComment()}
            >
              {commentPending ? "Posting…" : "Post"}
            </button>
          </div>
          {commentError ? (
            <div className="font-apex-body text-xs text-apex-error">
              {commentError}
            </div>
          ) : (
            <p className="font-apex-body text-[11px] text-apex-on-surface-variant">
              Press Ctrl/Cmd+Enter to post
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-apex-on-surface-variant/60"
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search comments"
            className="w-full rounded-lg border border-apex-outline-variant/15 bg-apex-surface-container px-10 py-2.5 font-apex-body text-sm text-apex-on-surface transition-colors placeholder:text-apex-on-surface-variant/60 focus:border-apex-primary/40 focus:outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
            aria-label="Search comments"
          />
          {searchInput.length > 0 ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-apex-primary transition-colors hover:text-apex-primary/80"
              aria-label="Clear search"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-apex-body text-[10px] font-bold uppercase tracking-wide transition-colors",
                  isActive
                    ? "bg-apex-primary text-white"
                    : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
                )}
              >
                {opt.label}
              </button>
            );
          })}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-apex-outline-variant/20 px-2.5 py-1.5 font-apex-body text-[10px] font-bold uppercase tracking-wide text-apex-on-surface-variant transition-colors hover:bg-apex-surface-container hover:text-apex-on-surface"
            >
              <X className="size-3 text-apex-primary" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {commentsLoading ? (
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label="Loading comments"
        >
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex gap-3 rounded-lg bg-apex-surface-container-low/60 p-3"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : commentsError ? (
        <div className="space-y-2">
          <p className="font-apex-body text-sm text-apex-on-surface-variant">
            {commentsError}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className={cn(
              appOutlineButtonClassName,
              "font-apex-body text-xs underline",
            )}
          >
            Retry
          </button>
        </div>
      ) : comments.length === 0 ? (
        <p className="font-apex-body text-sm text-apex-on-surface-variant">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <CommentThread
              key={c.id}
              comment={{
                ...c,
                author: c.author,
              }}
              variant="session"
              currentUserId={user?.id ?? null}
              isAdmin={user?.role === "ADMIN"}
              signedIn={Boolean(user)}
              maxLength={SESSION_COMMENT_MAX_LENGTH}
              replyOpen={threadReplyOpenId === c.id}
              editingId={editingCommentId}
              editError={commentEditError}
              replyError={threadReplyOpenId === c.id ? threadReplyError : null}
              posting={
                nestedReplyMutation.isPending ||
                editCommentMutation.isPending ||
                deleteCommentMutation.isPending
              }
              onToggleReply={(rootId) => {
                if (!user) {
                  navigate("/login");
                  return;
                }
                setThreadReplyError(null);
                setThreadReplyOpenId((cur) => (cur === rootId ? null : rootId));
              }}
              onToggleEdit={(commentId) => {
                setCommentEditError(null);
                setEditingCommentId(commentId);
              }}
              onSubmitReply={(rootId, body) =>
                nestedReplyMutation.mutate({ parentId: rootId, body })
              }
              onSubmitEdit={(commentId, body) =>
                editCommentMutation.mutate({ commentId, body })
              }
              onDelete={(commentId) => deleteCommentMutation.mutate(commentId)}
              loadingMore={loadingMoreRootId === c.id}
              onLoadMoreReplies={(rootId) => {
                if (loadingMoreRootId) return;
                const current = queryClient
                  .getQueryData<SessionCommentsPageResult>(commentsQueryKey)
                  ?.comments.find((item) => item.id === rootId);
                const offset = nextCommentRepliesOffset(
                  current?.replies?.length ?? 0,
                );
                setLoadingMoreRootId(rootId);
                void getSessionCommentReplies(sessionId, rootId, {
                  offset,
                  limit: COMMENT_REPLIES_PAGE_SIZE,
                })
                  .then((res) => {
                    patchComments((pageData) => ({
                      ...pageData,
                      comments: pageData.comments.map((item) =>
                        item.id === rootId
                          ? {
                              ...item,
                              replies: mergeCommentReplies(
                                item.replies,
                                res.items,
                              ),
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
          ))}
        </ul>
      )}

      {total > 0 && !commentsLoading && !commentsError ? (
        <div className="space-y-3 border-t border-apex-outline-variant/15 pt-4">
          {range ? (
            <p className="text-center font-apex-body text-xs text-apex-on-surface-variant">
              Showing {range.start}–{range.end} of {total}
            </p>
          ) : null}
          <RaceHistoryPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            disabled={commentsLoading}
          />
        </div>
      ) : null}
    </AppBaseModal>
  );
}
