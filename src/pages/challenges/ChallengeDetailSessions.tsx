import { Link } from "react-router-dom";
import AppListPaginationFooter from "@/components/app-ui/AppListPaginationFooter";
import { SkeletonBlock } from "@/components/ui/skeleton";
import type { EntrantSessionRow } from "@/lib/api/challenges";
import { ApiError, withRequestId } from "@/lib/api/errors";
import { formatLapMs } from "@/lib/utils";

interface SessionsData {
  items: EntrantSessionRow[];
  page: number;
  pageSize?: number;
  total: number;
  totalPages: number;
}

interface ChallengeDetailSessionsProps {
  signedIn: boolean;
  loading: boolean;
  data: SessionsData | undefined;
  error?: unknown;
  page: number;
  pageSize: number;
  fetching?: boolean;
  onPageChange: (page: number) => void;
}

function sessionsErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NOT_JOINED" || error.status === 403) {
      return withRequestId("Join the challenge to view entrant sessions.", error);
    }
    if (error.message) return withRequestId(error.message, error);
  }
  if (error instanceof Error && error.message) return withRequestId(error.message, error);
  return withRequestId("Failed to load sessions.", error);
}

function SessionsRowsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading sessions">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 border-b border-apex-outline-variant/10 py-2"
        >
          <SkeletonBlock className="h-4 w-28 rounded-apex-sm bg-apex-surface-container-highest" />
          <SkeletonBlock className="h-4 w-16 rounded-apex-sm bg-apex-surface-container-highest" />
          <SkeletonBlock className="h-4 w-20 rounded-apex-sm bg-apex-surface-container-highest" />
        </div>
      ))}
    </div>
  );
}

export default function ChallengeDetailSessions({
  signedIn,
  loading,
  data,
  error,
  page,
  pageSize,
  fetching = false,
  onPageChange,
}: ChallengeDetailSessionsProps) {
  return (
    <div className="rounded-2xl border border-apex-outline-variant/15 bg-apex-surface-container p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
          Session details
          {data?.total != null && (
            <span className="ml-2 font-apex-body text-sm font-normal text-apex-on-surface-variant">
              ({data.total})
            </span>
          )}
        </h2>
      </div>
      {!signedIn ? (
        <p className="py-4 font-apex-body text-sm text-apex-on-surface-variant">
          Sign in to browse entrants&apos; sessions.
        </p>
      ) : loading && !data ? (
        <SessionsRowsSkeleton />
      ) : error ? (
        <p className="py-4 font-apex-body text-sm text-apex-error">
          {sessionsErrorMessage(error)}
        </p>
      ) : !data?.items?.length ? (
        <p className="py-4 font-apex-body text-sm text-apex-on-surface-variant">
          No linked sessions yet.
        </p>
      ) : (
        <>
          <ul className="space-y-3 font-apex-body text-sm">
            {data.items.map((row) => (
              <li
                key={row.userId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-apex-outline-variant/10 py-2"
              >
                <span className="text-apex-on-surface">{row.username}</span>
                <span className="font-mono text-apex-on-surface-variant">
                  {formatLapMs(row.bestLapMs)}
                </span>
                {row.sessionId ? (
                  <Link
                    to={`/sessions/${row.sessionId}`}
                    className="text-apex-primary transition-colors hover:text-apex-primary/80"
                  >
                    View session
                  </Link>
                ) : (
                  <span className="text-apex-on-surface-variant">—</span>
                )}
              </li>
            ))}
          </ul>
          <AppListPaginationFooter
            page={page}
            totalPages={data.totalPages}
            total={data.total}
            pageSize={pageSize}
            onPageChange={onPageChange}
            disabled={fetching}
            className="mt-4"
          />
        </>
      )}
    </div>
  );
}
