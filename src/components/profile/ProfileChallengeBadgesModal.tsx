import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AppBaseModal } from "@/components/app-ui/AppBaseModal";
import AppListPaginationFooter from "@/components/app-ui/AppListPaginationFooter";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSimEnum } from "@/lib/enumFormat";
import {
  CHALLENGE_BADGES_PAGE_SIZE,
  getUserChallengeBadgesPage,
  type UserChallengeBadge,
} from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { profileKeys } from "@/lib/profileQueryKeys";
import { cn } from "@/lib/utils";

const PODIUM_EMOJI = ["🥇", "🥈", "🥉"] as const;

const TIER_LABEL: Record<string, string> = {
  GOLD: "Gold",
  SILVER: "Silver",
  BRONZE: "Bronze",
};

const TIER_CHIP_CLASS: Record<string, string> = {
  GOLD: "border-yellow-500/25 bg-yellow-500/10 text-yellow-200",
  SILVER:
    "border-apex-outline-variant/20 bg-apex-surface-container-high text-apex-on-surface-variant",
  BRONZE: "border-orange-500/25 bg-orange-500/10 text-orange-200",
};

type ProfileChallengeBadgesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  totalCount?: number;
};

function BadgeRowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-3">
      <Skeleton className="size-10 shrink-0 rounded-full bg-apex-surface-container-high" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-24 bg-apex-surface-container-high" />
        <Skeleton className="h-4 w-full bg-apex-surface-container-high" />
        <Skeleton className="h-3 w-40 bg-apex-surface-container-high" />
      </div>
    </li>
  );
}

function tierLabel(tier: string): string {
  return TIER_LABEL[tier] ?? tier;
}

function formatAwardedDate(iso: string): string {
  const awarded = new Date(iso);
  if (Number.isNaN(awarded.getTime())) return iso;
  return awarded.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function BadgeHistoryRow({
  badge,
  onNavigate,
}: {
  badge: UserChallengeBadge;
  onNavigate: () => void;
}) {
  const emoji =
    badge.place >= 1 && badge.place <= 3
      ? PODIUM_EMOJI[badge.place - 1]
      : "🏅";
  const tierKey = badge.tier.toUpperCase();
  const tierChipClass =
    TIER_CHIP_CLASS[tierKey] ?? TIER_CHIP_CLASS.SILVER;

  return (
    <li>
      <Link
        to={`/challenge/${badge.challengeId}`}
        onClick={onNavigate}
        className="group flex items-center gap-3 rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container-low px-3 py-3 transition-colors hover:border-apex-outline-variant/25 hover:bg-apex-surface-container"
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-apex-surface-container-highest text-xl leading-none"
          aria-hidden
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-apex-sm border px-2 py-0.5 font-apex-body text-[10px] font-bold uppercase tracking-wide",
                tierChipClass,
              )}
            >
              P{badge.place} · {tierLabel(badge.tier)}
            </span>
          </div>
          <p className="truncate font-apex-body text-sm font-medium text-apex-on-surface">
            {badge.challengeTitle}
          </p>
          <p className="mt-0.5 truncate font-apex-body text-xs text-apex-on-surface-variant">
            {formatSimEnum(badge.sim)} · {formatAwardedDate(badge.awardedAt)}
          </p>
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-apex-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-apex-on-surface"
          aria-hidden
        />
      </Link>
    </li>
  );
}

export default function ProfileChallengeBadgesModal({
  open,
  onOpenChange,
  userId,
  totalCount,
}: ProfileChallengeBadgesModalProps) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      setPage(1);
    } else {
      setPage(1);
    }
  }, [open, userId]);

  const enabled = open && Boolean(userId);

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: enabled
      ? profileKeys.challengeBadges(userId, page)
      : ["profile", "challengeBadges", "idle"],
    queryFn: () =>
      getUserChallengeBadgesPage(userId, {
        page,
        pageSize: CHALLENGE_BADGES_PAGE_SIZE,
      }),
    enabled,
    placeholderData: (previousData) => previousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? totalCount ?? 0;
  const pageSize = data?.pageSize ?? CHALLENGE_BADGES_PAGE_SIZE;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? page;
  const errMsg =
    error instanceof Error
      ? withRequestId(error.message, error)
      : error
        ? withRequestId("Failed to load challenge badges.", error)
        : null;

  const handleClose = () => onOpenChange(false);

  const description =
    total > 0
      ? `${total} podium ${total === 1 ? "finish" : "finishes"} from community challenges.`
      : "Podium finishes from community challenges.";

  return (
    <AppBaseModal
      isOpen={open}
      onClose={handleClose}
      title="Challenge podium history"
      description={description}
      size="sm"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4"
    >
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {!enabled ? null : isPending && !data ? (
          <ul
            className="space-y-2"
            aria-busy="true"
            aria-label="Loading challenge badges"
          >
            {Array.from({ length: CHALLENGE_BADGES_PAGE_SIZE }, (_, i) => (
              <BadgeRowSkeleton key={i} />
            ))}
          </ul>
        ) : errMsg ? (
          <p className="py-4 font-apex-body text-sm text-apex-error">{errMsg}</p>
        ) : items.length === 0 ? (
          <p className="py-4 font-apex-body text-sm text-apex-on-surface-variant">
            No challenge podium badges yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((badge) => (
              <BadgeHistoryRow
                key={`${badge.challengeId}-${badge.awardedAt}`}
                badge={badge}
                onNavigate={handleClose}
              />
            ))}
          </ul>
        )}
      </div>
      {enabled && !errMsg && total > 0 && (data || !isPending) && (
        <AppListPaginationFooter
          page={currentPage}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          disabled={isFetching}
          className="shrink-0 border-t border-apex-outline-variant/15 pt-4"
        />
      )}
    </AppBaseModal>
  );
}
