import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminCommunityDiscussionDetail,
  patchAdminCommunityDiscussion,
  softDeleteAdminCommunityDiscussion,
  restoreAdminCommunityDiscussion,
  hardDeleteAdminCommunityDiscussion,
  deleteAdminCommunityComment,
  uploadAdminCommunityDiscussionImage,
  deleteAdminCommunityDiscussionImage,
  getDiscussionCategoryLabel,
} from "@/lib/api";
import { apiErrorText, withRequestId } from "@/lib/api/errors";
import { validateDiscussionImageFile } from "@/lib/api/community";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TITLE_BASE = `Admin · Discussion | ${COMPANY_NAME}`;

export default function AdminCommunityDiscussionDetail() {
  const { discussionId: rawId } = useParams<{ discussionId: string }>();
  const discussionId = rawId?.trim() ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [commentsPage, setCommentsPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  /** Edit modal only — patch failures; never reuse for permanent delete. */
  const [formError, setFormError] = useState<string | null>(null);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  /** Shown inside the permanent-delete confirmation dialog only. */
  const [hardDeleteError, setHardDeleteError] = useState<string | null>(null);
  const [commentDeleteTarget, setCommentDeleteTarget] = useState<{
    id: string;
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin", "community", "discussion", discussionId, commentsPage],
    queryFn: () =>
      fetchAdminCommunityDiscussionDetail(discussionId, {
        page: commentsPage,
        limit: 20,
      }),
    enabled: Boolean(discussionId),
  });

  useEffect(() => {
    if (!data || !window.location.hash.startsWith("#comment-")) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(
        decodeURIComponent(window.location.hash.slice(1)),
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    });
  }, [data]);

  const d = data?.discussion;

  useEffect(() => {
    if (!editOpen || !d) return;
    setEditTitle(d.title);
    setEditBody(d.body);
    setFormError(null);
  }, [editOpen, d]);

  const patchMutation = useMutation({
    mutationFn: () =>
      patchAdminCommunityDiscussion(discussionId, {
        title: editTitle.trim(),
        body: editBody.trim(),
      }),
    onSuccess: async () => {
      setEditOpen(false);
      await refetch();
      await qc.invalidateQueries({
        queryKey: ["admin", "community", "discussions"],
      });
    },
    onError: (e) => {
      setFormError(apiErrorText(e, "Update failed"));
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: () => softDeleteAdminCommunityDiscussion(discussionId),
    onSuccess: async () => {
      await refetch();
      await qc.invalidateQueries({
        queryKey: ["admin", "community", "discussions"],
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreAdminCommunityDiscussion(discussionId),
    onSuccess: async () => {
      await refetch();
      await qc.invalidateQueries({
        queryKey: ["admin", "community", "discussions"],
      });
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: () => hardDeleteAdminCommunityDiscussion(discussionId),
    onSuccess: async () => {
      setHardDeleteError(null);
      setHardDeleteOpen(false);
      await qc.invalidateQueries({
        queryKey: ["admin", "community", "discussions"],
      });
      navigate("/admin/community");
    },
    onError: (e) => {
      setHardDeleteError(apiErrorText(e, "Delete failed"));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      deleteAdminCommunityComment(discussionId, commentId, { hard: true }),
    onSuccess: async () => {
      setCommentDeleteTarget(null);
      await refetch();
    },
  });

  if (!discussionId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-muted-foreground">Invalid discussion id.</p>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        path={`/admin/community/${discussionId}`}
        title={d ? `${d.title.slice(0, 48)} · ${TITLE_BASE}` : TITLE_BASE}
        description="Admin discussion detail."
        noindex
      />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link
          to="/admin/community"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to community
        </Link>

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load discussion.")}
          </div>
        )}

        {isPending && (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isPending && d && (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-foreground">
                  {d.title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {getDiscussionCategoryLabel(d.category)} · {d.views} views ·{" "}
                  <Link
                    to={`/admin/users/${encodeURIComponent(d.userId)}`}
                    className="text-primary hover:underline"
                  >
                    Author profile
                  </Link>
                  {d.deletedAt && (
                    <span className="ml-2 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                      Deleted ({d.deletedBy ?? "?"})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
                {!d.deletedAt ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={softDeleteMutation.isPending}
                    onClick={() => softDeleteMutation.mutate()}
                  >
                    Soft delete
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoreMutation.isPending}
                    onClick={() => restoreMutation.mutate()}
                  >
                    Restore
                  </Button>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setHardDeleteError(null);
                    setHardDeleteOpen(true);
                  }}
                >
                  Delete permanently
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link
                    to={`/discussion/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open public page
                  </Link>
                </Button>
              </div>
            </div>

            {d.profanityFlaggedAt && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
                Profanity flagged at{" "}
                {new Date(d.profanityFlaggedAt).toLocaleString()}
              </div>
            )}

            <div className="mb-6 rounded-xl border border-white/10 bg-card p-4 sm:p-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Cover image
              </h2>
              {d.imageUrl?.trim() ? (
                <img
                  src={d.imageUrl.trim()}
                  alt=""
                  className="mb-3 aspect-[16/9] max-h-64 w-full rounded-lg object-cover"
                />
              ) : (
                <p className="mb-3 text-sm text-muted-foreground">
                  No cover image.
                </p>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const err = validateDiscussionImageFile(file);
                  if (err) {
                    toast.error(err);
                    return;
                  }
                  setImageBusy(true);
                  void uploadAdminCommunityDiscussionImage(discussionId, file)
                    .then(async () => {
                      toast.success("Image updated");
                      await refetch();
                    })
                    .catch((err: unknown) => {
                      toast.error(
                        withRequestId(
                          err instanceof Error
                            ? err.message
                            : "Image upload failed",
                          err,
                        ),
                      );
                    })
                    .finally(() => setImageBusy(false));
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={imageBusy}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {d.imageUrl?.trim() ? "Replace image" : "Upload image"}
                </Button>
                {d.imageUrl?.trim() ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={imageBusy}
                    onClick={() => {
                      setImageBusy(true);
                      void deleteAdminCommunityDiscussionImage(discussionId)
                        .then(async () => {
                          toast.success("Image removed");
                          await refetch();
                        })
                        .catch((err: unknown) => {
                          toast.error(
                            withRequestId(
                              err instanceof Error
                                ? err.message
                                : "Could not remove image",
                              err,
                            ),
                          );
                        })
                        .finally(() => setImageBusy(false));
                    }}
                  >
                    Remove image
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mb-8 rounded-xl border border-white/10 bg-card p-4 sm:p-6">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Body
              </h2>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {d.body}
              </p>
              {(d.originalTitle || d.originalBody) && (
                <div className="mt-6 border-t border-white/10 pt-4">
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    Pre-edit snapshot
                  </h3>
                  <p className="text-sm font-medium text-foreground">
                    {d.originalTitle}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {d.originalBody}
                  </p>
                </div>
              )}
            </div>

            <h2 className="mb-3 text-lg font-semibold text-foreground">
              Replies ({data?.comments.total ?? 0})
            </h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className="p-3">Author</th>
                    <th className="p-3">Body</th>
                    <th className="p-3">Created</th>
                    <th className="w-12 p-3" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.comments.items ?? []).map((c) => (
                    <tr
                      key={c.id}
                      id={`comment-${c.id}`}
                      tabIndex={-1}
                      className="scroll-mt-24 border-b border-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <td className="p-3">
                        <Link
                          to={`/admin/users/${encodeURIComponent(c.userId)}`}
                          className="text-primary hover:underline"
                        >
                          {c.author.displayName ?? c.userId.slice(0, 8)}
                        </Link>
                        {c.deletedAt && (
                          <span className="ml-1 text-xs text-amber-200/80">
                            (removed)
                          </span>
                        )}
                      </td>
                      <td className="max-w-md p-3 text-muted-foreground">
                        <span className="line-clamp-4 whitespace-pre-wrap">
                          {c.body}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {c.createdAt}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={deleteCommentMutation.isPending}
                              onClick={() => {
                                if (deleteCommentMutation.isPending) return;
                                setCommentDeleteTarget({ id: c.id });
                              }}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete reply
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(data?.comments.totalPages ?? 1) > 1 && (
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={commentsPage <= 1}
                  onClick={() => setCommentsPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="self-center text-xs text-muted-foreground">
                  Page {commentsPage} of {data?.comments.totalPages ?? 1}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={commentsPage >= (data?.comments.totalPages ?? 1)}
                  onClick={() =>
                    setCommentsPage((p) =>
                      Math.min(data?.comments.totalPages ?? 1, p + 1),
                    )
                  }
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        {editOpen && d && (
          <BaseModal
            isOpen={editOpen}
            onClose={() => setEditOpen(false)}
            title="Edit discussion"
            size="md"
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={patchMutation.isPending}
                  onClick={() => patchMutation.mutate()}
                >
                  {patchMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            }
          >
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Title
                </label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="border-white/10 bg-secondary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  Body
                </label>
                <Textarea
                  className="min-h-[160px] border-white/10 bg-secondary"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
              </div>
            </div>
          </BaseModal>
        )}

        <BaseAlertDialog
          isOpen={commentDeleteTarget != null}
          onClose={() => {
            if (deleteCommentMutation.isPending) return;
            deleteCommentMutation.reset();
            setCommentDeleteTarget(null);
          }}
          title="Delete reply?"
          description="Permanently delete this reply? This action cannot be undone."
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={deleteCommentMutation.isPending}
                onClick={() => {
                  deleteCommentMutation.reset();
                  setCommentDeleteTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  deleteCommentMutation.isPending || !commentDeleteTarget
                }
                onClick={() => {
                  if (!commentDeleteTarget) return;
                  deleteCommentMutation.mutate(commentDeleteTarget.id);
                }}
              >
                {deleteCommentMutation.isPending
                  ? "Deleting..."
                  : "Delete reply"}
              </Button>
            </>
          }
        >
          {deleteCommentMutation.isError ? (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {apiErrorText(deleteCommentMutation.error, "Delete failed")}
            </div>
          ) : null}
        </BaseAlertDialog>

        <BaseAlertDialog
          isOpen={hardDeleteOpen}
          onClose={() => {
            setHardDeleteOpen(false);
            setHardDeleteError(null);
          }}
          title="Permanently delete this thread?"
          description="This removes the discussion and all replies, likes, and views from the database. This action cannot be undone."
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={hardDeleteMutation.isPending}
                onClick={() => {
                  setHardDeleteOpen(false);
                  setHardDeleteError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={hardDeleteMutation.isPending}
                onClick={() => {
                  setHardDeleteError(null);
                  hardDeleteMutation.mutate();
                }}
              >
                {hardDeleteMutation.isPending ? "Deleting…" : "Delete forever"}
              </Button>
            </>
          }
        >
          {hardDeleteError && (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {hardDeleteError}
            </div>
          )}
        </BaseAlertDialog>
      </div>
    </>
  );
}
