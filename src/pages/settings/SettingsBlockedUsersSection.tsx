import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { RaceHistoryPagination } from "@/components/RaceHistoryPagination";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveApiUrl } from "@/lib/api/config";
import { withRequestId } from "@/lib/api/errors";
import {
  fetchBlockedUsers,
  unblockUser,
  type BlockedUserListItem,
} from "@/lib/api/ugcModeration";
import { invalidateAfterUgcModeration } from "@/lib/ugcModerationCache";
import {
  clampModerationPage,
  pageAfterRemovingItem,
} from "./moderationPagination";
import { FOLLOW_LIST_PAGE_SIZE } from "@/lib/api/followAndLeaderboards";
import { cn } from "@/lib/utils";
import { appSecondaryButtonClassName } from "@/components/app-ui/appButtonClasses";

type BlockedUsersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-2">
      <Skeleton className="size-8 shrink-0 rounded-full bg-apex-surface-container-high" />
      <Skeleton className="h-4 w-32 bg-apex-surface-container-high" />
    </li>
  );
}

function BlockedRow({
  user,
  onUnblock,
  pending,
}: {
  user: BlockedUserListItem;
  onUnblock: () => void;
  pending: boolean;
}) {
  const name = user.displayName?.trim() || "—";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const avatar = resolveApiUrl(user.avatarUrl);

  return (
    <li className="flex items-center gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-2">
      <Link
        to={`/user/${encodeURIComponent(user.id)}`}
        className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
      >
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-apex-surface-container-highest text-xs font-semibold text-apex-on-surface-variant">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-apex-on-surface hover:underline">
          {name}
        </p>
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={onUnblock}
        className="shrink-0 rounded-full border border-apex-outline-variant/30 px-3 py-1 text-xs font-medium text-apex-on-surface transition-colors hover:bg-apex-surface-container disabled:opacity-60"
      >
        {pending ? "…" : "Unblock"}
      </button>
    </li>
  );
}

export default function BlockedUsersModal({
  open,
  onOpenChange,
}: BlockedUsersModalProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  const { data, isPending, error } = useQuery({
    queryKey: ["settings", "blocked-users", page, FOLLOW_LIST_PAGE_SIZE],
    queryFn: () => fetchBlockedUsers({ page, limit: FOLLOW_LIST_PAGE_SIZE }),
    enabled: open,
  });

  useEffect(() => {
    if (!data) return;
    const clampedPage = clampModerationPage(data.page, data.totalPages);
    if (page !== clampedPage) setPage(clampedPage);
  }, [data, page]);

  const handleUnblock = async (userId: string) => {
    setPendingId(userId);
    try {
      await unblockUser(userId);
      toast.success("User unblocked");
      if (data) {
        setPage((current) =>
          pageAfterRemovingItem(current, data.items.length)
        );
      }
      invalidateAfterUgcModeration(queryClient);
    } catch (e) {
      toast.error(withRequestId(e instanceof Error ? e.message : "Could not unblock.", e));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <AppBaseModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Blocked users"
      description="People you blocked. Unblock to see their content again."
      size="md"
    >
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
              : "Could not load blocked users.",
            error,
          )}
        </p>
      ) : !data?.items.length ? (
        <p className="font-apex-body text-sm text-apex-on-surface-variant">
          You have not blocked anyone.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((u) => (
              <BlockedRow
                key={u.id}
                user={u}
                pending={pendingId === u.id}
                onUnblock={() => void handleUnblock(u.id)}
              />
            ))}
          </ul>
          {(data.totalPages ?? 1) > 1 ? (
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

export function SettingsBlockedUsersSection({
  onManage,
}: {
  onManage: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["settings", "blocked-users", "count"],
    queryFn: () => fetchBlockedUsers({ page: 1, limit: 1 }),
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
      Manage blocked users
      {data ? (
        <span className="rounded-full bg-apex-surface-container-high px-2 py-0.5 text-xs">
          {data.total}
        </span>
      ) : null}
    </button>
  );
}
