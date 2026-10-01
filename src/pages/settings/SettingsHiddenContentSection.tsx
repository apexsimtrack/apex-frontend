import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { appSecondaryButtonClassName } from "@/components/app-ui/appButtonClasses";
import { RaceHistoryPagination } from "@/components/RaceHistoryPagination";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveApiUrl } from "@/lib/api/config";
import { withRequestId } from "@/lib/api/errors";
import {
  fetchHiddenContent,
  unhideContent,
  type HiddenContentListItem,
  type HiddenContentType,
} from "@/lib/api/ugcModeration";
import { invalidateAfterUgcModeration } from "@/lib/ugcModerationCache";
import { cn, getUserInitials, timeAgo } from "@/lib/utils";
import {
  clampModerationPage,
  pageAfterRemovingItem,
} from "./moderationPagination";
import { HIDDEN_CONTENT_FILTERS } from "./hiddenContentFilters";

const HIDDEN_CONTENT_PAGE_SIZE = 20;

const TYPE_LABELS: Record<HiddenContentType, string> = {
  SESSION: "Session",
  DISCUSSION: "Discussion",
  DISCUSSION_COMMENT: "Discussion comment",
  SESSION_COMMENT: "Session comment",
};

function contentPath(item: HiddenContentListItem): string | null {
  if (!item.available) return null;
  if (item.contentType === "DISCUSSION") {
    return `/discussion/${encodeURIComponent(item.targetContentId)}`;
  }
  if (item.contentType === "DISCUSSION_COMMENT" && item.parentContentId) {
    return `/discussion/${encodeURIComponent(item.parentContentId)}#comment-${encodeURIComponent(item.targetContentId)}`;
  }
  if (item.contentType === "SESSION") {
    return `/sessions/${encodeURIComponent(item.targetContentId)}`;
  }
  if (item.contentType === "SESSION_COMMENT" && item.parentContentId) {
    return `/sessions/${encodeURIComponent(item.parentContentId)}#comment-${encodeURIComponent(item.targetContentId)}`;
  }
  return null;
}

function RowSkeleton() {
  return (
    <li className="rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low p-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full bg-apex-surface-container-high" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-24 bg-apex-surface-container-high" />
          <Skeleton className="h-4 w-4/5 bg-apex-surface-container-high" />
        </div>
      </div>
    </li>
  );
}

function HiddenContentRow({
  item,
  pending,
  onUnhide,
}: {
  item: HiddenContentListItem;
  pending: boolean;
  onUnhide: () => void;
}) {
  const path = contentPath(item);
  const avatar = resolveApiUrl(item.author?.avatarUrl);
  const preview = item.available
    ? item.preview || "Untitled content"
    : "Content no longer available";

  return (
    <li className="rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-apex-surface-container-highest text-xs font-semibold text-apex-on-surface-variant">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            getUserInitials(item.author?.displayName ?? "?")
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-apex-surface-container-high px-2 py-0.5 text-[11px] font-medium text-apex-on-surface-variant">
              {TYPE_LABELS[item.contentType]}
            </span>
            <span className="text-xs text-apex-on-surface-variant">
              Hidden {timeAgo(item.createdAt)}
            </span>
          </div>

          {path ? (
            <Link
              to={path}
              className="mt-1 block truncate text-sm font-medium text-apex-on-surface hover:underline"
            >
              {preview}
            </Link>
          ) : (
            <p
              className={cn(
                "mt-1 truncate text-sm font-medium",
                item.available
                  ? "text-apex-on-surface"
                  : "text-apex-on-surface-variant",
              )}
            >
              {preview}
            </p>
          )}

          {item.author ? (
            <Link
              to={`/user/${encodeURIComponent(item.author.id)}`}
              className="mt-1 inline-block text-xs text-apex-on-surface-variant hover:text-apex-on-surface hover:underline"
            >
              {item.author.displayName}
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={onUnhide}
          className="shrink-0 rounded-full border border-apex-outline-variant/30 px-3 py-1 text-xs font-medium text-apex-on-surface transition-colors hover:bg-apex-surface-container disabled:opacity-60"
        >
          {pending ? "…" : "Unhide"}
        </button>
      </div>
    </li>
  );
}

export default function HiddenContentModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<HiddenContentType | "ALL">("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPage(1);
      setFilter("ALL");
    }
  }, [open]);

  const { data, isPending, error } = useQuery({
    queryKey: [
      "settings",
      "hidden-content",
      page,
      HIDDEN_CONTENT_PAGE_SIZE,
      filter,
    ],
    queryFn: () =>
      fetchHiddenContent({
        page,
        pageSize: HIDDEN_CONTENT_PAGE_SIZE,
        contentType: filter === "ALL" ? undefined : filter,
      }),
    enabled: open,
  });

  useEffect(() => {
    if (!data) return;
    const clampedPage = clampModerationPage(data.page, data.totalPages);
    if (page !== clampedPage) setPage(clampedPage);
  }, [data, page]);

  const handleFilterChange = (next: HiddenContentType | "ALL") => {
    setFilter(next);
    setPage(1);
  };

  const handleUnhide = async (item: HiddenContentListItem) => {
    setPendingId(item.id);
    try {
      await unhideContent(item.contentType, item.targetContentId);
      toast.success("Content unhidden");
      if (data) {
        setPage((current) =>
          pageAfterRemovingItem(current, data.items.length)
        );
      }
      invalidateAfterUgcModeration(queryClient);
    } catch (e) {
      toast.error(withRequestId(e instanceof Error ? e.message : "Could not unhide content.", e));
    } finally {
      setPendingId(null);
    }
  };

  const firstResult = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastResult = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Hidden content"
      description="Content you chose to hide. Unhide an item to allow it to appear again."
      size="xl"
    >
      <div
        className="mb-5 flex gap-2 overflow-x-auto pb-1"
        aria-label="Content type filter"
      >
        {HIDDEN_CONTENT_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => handleFilterChange(option.value)}
            className={cn(
              "shrink-0 rounded-apex-sm px-4 py-2 font-apex-body text-xs font-bold transition-colors",
              filter === option.value
                ? "bg-apex-primary text-white"
                : "bg-apex-surface-container-low text-apex-on-surface-variant hover:text-apex-on-surface",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <ul className="space-y-2">
          <RowSkeleton />
          <RowSkeleton />
        </ul>
      ) : error ? (
        <p className="font-apex-body text-sm text-apex-error">
          {withRequestId(
            error instanceof Error && error.message
              ? error.message
              : "Could not load hidden content.",
            error,
          )}
        </p>
      ) : !data?.items.length ? (
        <p className="font-apex-body text-sm text-apex-on-surface-variant">
          You have no hidden content in this category.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-apex-on-surface-variant">
            Showing {firstResult}–{lastResult} of {data.total}
          </p>
          <ul className="space-y-2">
            {data.items.map((item) => (
              <HiddenContentRow
                key={item.id}
                item={item}
                pending={pendingId === item.id}
                onUnhide={() => void handleUnhide(item)}
              />
            ))}
          </ul>
          {data.totalPages > 1 ? (
            <div className="mt-4">
              <RaceHistoryPagination
                page={data.page}
                totalPages={data.totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </>
      )}
    </AppBaseModal>
  );
}

export function SettingsHiddenContentSection({
  onManage,
}: {
  onManage: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["settings", "hidden-content", "count"],
    queryFn: () => fetchHiddenContent({ page: 1, pageSize: 1 }),
  });

  return (
    <button
      type="button"
      onClick={onManage}
      className={cn(
        appSecondaryButtonClassName,
        "flex w-full items-center justify-center gap-2 py-3",
      )}
    >
      Manage hidden content
      {data ? (
        <span className="rounded-full bg-apex-surface-container-high px-2 py-0.5 text-xs">
          {data.total}
        </span>
      ) : null}
    </button>
  );
}
