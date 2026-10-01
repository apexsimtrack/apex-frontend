import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  resolveApiUrl,
  searchUsers,
  USER_DISCOVER_MIN_QUERY_LEN,
  USER_DISCOVER_PAGE_SIZE,
  type UserDiscoverHit,
} from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { RaceHistoryPagination } from "@/components/RaceHistoryPagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { appInputClassName } from "@/components/app-ui/appButtonClasses";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import { cn } from "@/lib/utils";
import UgcOverflowMenu from "@/components/ugc/UgcOverflowMenu";
import { useAuth } from "@/contexts/AuthContext";

const SEARCH_DEBOUNCE_MS = 200;

type UserSearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function followStatusLabel(
  relationship: UserDiscoverHit["followRelationship"],
): string | null {
  if (relationship === "following") return "Following";
  if (relationship === "pending") return "Requested";
  return null;
}

function DiscoverRow({
  user,
  onNavigate,
}: {
  user: UserDiscoverHit;
  onNavigate: () => void;
}) {
  const { user: currentUser } = useAuth();
  const name = user.displayName?.trim() || "—";
  const initials =
    name && name.length >= 2
      ? name.slice(0, 2).toUpperCase()
      : name.slice(0, 1).toUpperCase() || "?";
  const statusLabel = followStatusLabel(user.followRelationship);

  return (
    <li className="flex items-center gap-2 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-2 transition-colors hover:bg-apex-surface-container">
      <Link
        to={`/user/${encodeURIComponent(user.id)}`}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-apex-surface-container-highest text-xs font-semibold text-apex-on-surface-variant">
          {resolveApiUrl(user.avatarUrl) ? (
            <img
              src={resolveApiUrl(user.avatarUrl)!}
              alt=""
              className="size-8 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-apex-on-surface">
              {name}
            </p>
            {statusLabel ? (
              <span className="shrink-0 text-xs text-apex-on-surface-variant">
                {statusLabel}
              </span>
            ) : null}
          </div>
          {user.email ? (
            <p className="truncate text-xs text-apex-on-surface-variant">
              {user.email}
            </p>
          ) : null}
          {user.bio ? (
            <p className="truncate text-xs text-apex-on-surface-variant/80">
              {user.bio}
            </p>
          ) : null}
        </div>
      </Link>
      <UgcOverflowMenu
        signedIn={Boolean(currentUser)}
        isOwn={Boolean(currentUser?.id && currentUser.id === user.id)}
        authorId={user.id}
      />
    </li>
  );
}

export function UserSearchModal({ open, onOpenChange }: UserSearchModalProps) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(
    searchInput,
    SEARCH_DEBOUNCE_MS,
    open ? "user-search-open" : undefined,
  );

  useEffect(() => {
    if (open) {
      setPage(1);
      setSearchInput("");
    } else {
      setSearchInput("");
      setPage(1);
    }
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const queryReady =
    debouncedSearch.trim().length >= USER_DISCOVER_MIN_QUERY_LEN;

  const { data, isPending, error } = useQuery({
    queryKey: ["users", "discover", debouncedSearch.trim(), page],
    queryFn: () =>
      searchUsers({
        q: debouncedSearch.trim(),
        page,
        limit: USER_DISCOVER_PAGE_SIZE,
      }),
    enabled: open && queryReady,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageLimit = data?.limit ?? USER_DISCOVER_PAGE_SIZE;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageLimit + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(currentPage * pageLimit, total);
  const errMsg =
    error instanceof Error
      ? withRequestId(error.message, error)
      : error
        ? withRequestId("Failed to load results.", error)
        : null;

  return (
    <AppBaseModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Find people"
      description="Search by name or email to discover other racers on Apex."
      size="sm"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-apex-on-surface-variant" />
        <Input
          type="search"
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={cn(appInputClassName, "pl-9")}
          autoComplete="off"
          autoFocus
        />
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {!queryReady ? (
          <p className="py-4 text-sm text-apex-on-surface-variant">
            Type at least {USER_DISCOVER_MIN_QUERY_LEN} characters to search.
          </p>
        ) : isPending ? (
          <p className="py-4 text-sm text-apex-on-surface-variant">Loading…</p>
        ) : errMsg ? (
          <p className="py-4 text-sm text-apex-error">{errMsg}</p>
        ) : items.length === 0 ? (
          <p className="py-4 text-sm text-apex-on-surface-variant">
            No users match your search.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((user) => (
              <DiscoverRow
                key={user.id}
                user={user}
                onNavigate={() => onOpenChange(false)}
              />
            ))}
          </ul>
        )}
      </div>
      {queryReady && !isPending && !errMsg && total > 0 ? (
        <div className="shrink-0 space-y-3 border-t border-apex-outline-variant/15 pt-4">
          <p className="text-center text-xs text-apex-on-surface-variant">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          {totalPages > 1 ? (
            <RaceHistoryPagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={isPending}
            />
          ) : null}
        </div>
      ) : null}
    </AppBaseModal>
  );
}
