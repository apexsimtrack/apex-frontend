import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  resolveApiUrl,
  getFollowersPage,
  getFollowingPage,
  FOLLOW_LIST_PAGE_SIZE,
  type FollowUser,
} from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { profileKeys } from "@/lib/profileQueryKeys";
import { RaceHistoryPagination } from "@/components/RaceHistoryPagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import { appInputClassName } from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import UgcOverflowMenu from "@/components/ugc/UgcOverflowMenu";
import { useAuth } from "@/contexts/AuthContext";

const SEARCH_DEBOUNCE_MS = 200;

type FollowListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  listKind: "followers" | "following" | null;
  profileLinkBase?: string;
};

function FollowRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-2">
      <Skeleton className="size-8 shrink-0 rounded-full bg-apex-surface-container-high" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32 bg-apex-surface-container-high" />
        <Skeleton className="h-3 w-48 bg-apex-surface-container-high" />
      </div>
    </li>
  );
}

function FollowRow({
  f,
  onNavigate,
  profileLinkBase,
}: {
  f: FollowUser;
  onNavigate: () => void;
  profileLinkBase: string;
}) {
  const { user } = useAuth();
  const name = f.displayName?.trim() || "—";
  const initials =
    name && name.length >= 2
      ? name.slice(0, 2).toUpperCase()
      : name.slice(0, 1).toUpperCase() || "?";

  return (
    <li className="flex items-center gap-2 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-2 transition-colors hover:bg-apex-surface-container">
      <Link
        to={`${profileLinkBase}/${encodeURIComponent(f.id)}`}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-apex-surface-container-highest text-xs font-semibold text-apex-on-surface-variant">
          {resolveApiUrl(f.avatarUrl) ? (
            <img
              src={resolveApiUrl(f.avatarUrl)!}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-apex-on-surface">
            {name}
          </p>
          {f.bio && (
            <p className="truncate text-xs text-apex-on-surface-variant">
              {f.bio}
            </p>
          )}
        </div>
      </Link>
      <UgcOverflowMenu
        signedIn={Boolean(user)}
        isOwn={Boolean(user?.id && user.id === f.id)}
        authorId={f.id}
      />
    </li>
  );
}

export function FollowListDialog({
  open,
  onOpenChange,
  userId,
  listKind,
  profileLinkBase = "/user",
}: FollowListDialogProps) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(
    searchInput,
    SEARCH_DEBOUNCE_MS,
    open && listKind ? `${userId}:${listKind}` : undefined,
  );

  useEffect(() => {
    if (open) {
      setPage(1);
      setSearchInput("");
    } else {
      setSearchInput("");
      setPage(1);
    }
  }, [open, listKind, userId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const enabled = open && Boolean(userId) && listKind !== null;

  const { data, isPending, isFetching, error } = useQuery({
    queryKey:
      listKind === null
        ? ["profile", "followList", "idle"]
        : profileKeys.followList(userId, listKind, page, debouncedSearch),
    queryFn: () =>
      listKind === "followers"
        ? getFollowersPage(userId, {
            page,
            limit: FOLLOW_LIST_PAGE_SIZE,
            q: debouncedSearch,
          })
        : getFollowingPage(userId, {
            page,
            limit: FOLLOW_LIST_PAGE_SIZE,
            q: debouncedSearch,
          }),
    enabled,
    placeholderData: (previousData) => previousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageLimit = data?.limit ?? FOLLOW_LIST_PAGE_SIZE;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageLimit + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * pageLimit, total);
  const errMsg =
    error instanceof Error
      ? withRequestId(error.message, error)
      : error
        ? withRequestId("Failed to load list.", error)
        : null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={
        listKind === "followers"
          ? "Followers"
          : listKind === "following"
            ? "Following"
            : ""
      }
      size="sm"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4"
    >
      {enabled && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-apex-on-surface-variant" />
          <Input
            type="search"
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={cn(appInputClassName, "pl-9")}
            autoComplete="off"
          />
        </div>
      )}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {!enabled ? null : isPending && !data ? (
          <ul
            className="space-y-2"
            aria-busy="true"
            aria-label="Loading follow list"
          >
            {Array.from({ length: FOLLOW_LIST_PAGE_SIZE }, (_, i) => (
              <FollowRowSkeleton key={i} />
            ))}
          </ul>
        ) : errMsg ? (
          <p className="py-4 font-apex-body text-sm text-apex-error">
            {errMsg}
          </p>
        ) : items.length === 0 ? (
          <p className="py-4 font-apex-body text-sm text-apex-on-surface-variant">
            {debouncedSearch.trim()
              ? listKind === "followers"
                ? "No followers match your search."
                : "No users match your search."
              : listKind === "followers"
                ? "No followers yet."
                : "Not following anyone yet."}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((f) => (
              <FollowRow
                key={f.id}
                f={f}
                onNavigate={() => onOpenChange(false)}
                profileLinkBase={profileLinkBase}
              />
            ))}
          </ul>
        )}
      </div>
      {enabled && !errMsg && total > 0 && (data || !isPending) && (
        <div className="shrink-0 space-y-3 border-t border-apex-outline-variant/15 pt-4">
          <p className="text-center font-apex-body text-xs text-apex-on-surface-variant">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          {totalPages > 1 && (
            <RaceHistoryPagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={isFetching}
            />
          )}
        </div>
      )}
    </AppBaseModal>
  );
}
