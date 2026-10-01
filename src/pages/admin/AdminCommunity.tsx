import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminCommunityDiscussions,
  fetchAdminCommunityModerationFlags,
  resolveAdminCommunityModerationFlag,
  getDiscussionCategoryLabel,
  type AdminCommunityDiscussionListItem,
  type AdminModerationFlagRow,
} from "@/lib/api";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreHorizontal } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";
import {
  ADMIN_TABS_CONTENT,
  ADMIN_TABS_LIST,
} from "@/pages/admin/adminTabsLayout";

const TITLE = `Admin · Community | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;

function statusLabel(row: AdminCommunityDiscussionListItem): string {
  if (!row.deletedAt) return "Active";
  if (row.deletedBy === "USER") return "User deleted";
  if (row.deletedBy === "ADMIN") return "Mod removed";
  return "Hidden";
}

export default function AdminCommunity() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"posts" | "flags">("posts");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [category, setCategory] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [flagsPage, setFlagsPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, includeDeleted, flaggedOnly]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 20,
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
      ...(includeDeleted ? { includeDeleted: true as const } : {}),
      ...(flaggedOnly ? { flagged: true as const } : {}),
    }),
    [page, debouncedSearch, category, includeDeleted, flaggedOnly],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "community", "discussions", listParams],
    queryFn: () => fetchAdminCommunityDiscussions(listParams),
    enabled: tab === "posts",
  });

  const flagsQuery = useQuery({
    queryKey: ["admin", "community", "flags", flagsPage],
    queryFn: () =>
      fetchAdminCommunityModerationFlags({
        page: flagsPage,
        pageSize: 20,
        unresolvedOnly: true,
      }),
    enabled: tab === "flags",
  });

  const resolveMutation = useMutation({
    mutationFn: (flagId: string) => resolveAdminCommunityModerationFlag(flagId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "community", "flags"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "community", "discussions"],
      });
    },
  });

  const rows = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const currentPage = data?.page ?? page;

  const rangeLabel = useMemo(() => {
    if (total === 0) return "Showing 0 of 0 results";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    return `Showing ${start}–${end} of ${total} results`;
  }, [total, currentPage, pageSize]);

  const flagRows = flagsQuery.data?.items ?? [];
  const flagTotalPages = flagsQuery.data?.totalPages ?? 1;

  return (
    <>
      <PageMeta
        path="/admin/community"
        title={TITLE}
        description="Manage community posts."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Community
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderate discussions, profanity flags, and soft-deleted threads.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "posts" | "flags")}>
          <TabsList className={ADMIN_TABS_LIST}>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="flags">Moderation queue</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className={ADMIN_TABS_CONTENT}>
            {isError && (
              <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {apiErrorText(error, "Could not load discussions.")}
              </div>
            )}

            {!isError && (
              <div className={ADMIN_TABLE_CARD}>
                <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
                  <Input
                    placeholder="Search title or body…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full min-w-[12rem] max-w-xs border-white/10 bg-card"
                  />
                  <select
                    className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                    value={category}
                    onChange={(e) => {
                      setPage(1);
                      setCategory(e.target.value);
                    }}
                    aria-label="Category"
                  >
                    <option value="">All categories</option>
                    <option value="setup">Setups</option>
                    <option value="guides">Guides</option>
                    <option value="general">General</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(e) => {
                        setPage(1);
                        setIncludeDeleted(e.target.checked);
                      }}
                      className="rounded border-white/20"
                    />
                    Include deleted
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                    <input
                      type="checkbox"
                      checked={flaggedOnly}
                      onChange={(e) => {
                        setPage(1);
                        setFlaggedOnly(e.target.checked);
                      }}
                      className="rounded border-white/20"
                    />
                    Flagged only
                  </label>
                  <span className="text-xs text-muted-foreground sm:ml-auto">
                    {rangeLabel}
                  </span>
                </div>

                <div className={ADMIN_TABLE_SCROLL}>
                  <table className={adminTable("min-w-[45rem]")}>
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className={ADMIN_TH}>Title</th>
                        <th className={ADMIN_TH}>Author</th>
                        <th className={ADMIN_TH}>Category</th>
                        <th className={ADMIN_TH}>Status</th>
                        <th className={`${ADMIN_TH} tabular-nums`}>Replies</th>
                        <th className={ADMIN_TH}>Flags</th>
                        <th className="w-12 whitespace-nowrap p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {isPending ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-8 text-center text-muted-foreground"
                          >
                            <Loader2
                              className="mx-auto size-6 animate-spin"
                              aria-hidden
                            />
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-8 text-center text-muted-foreground"
                          >
                            No discussions match your filters.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.id} className="border-b border-white/5">
                            <td
                              className={`max-w-[240px] ${ADMIN_TD} font-medium text-foreground`}
                            >
                              <Link
                                to={`/admin/community/${r.id}`}
                                className="line-clamp-2 hover:text-primary hover:underline"
                              >
                                {r.title}
                              </Link>
                            </td>
                            <td className={ADMIN_TD}>
                              <Link
                                to={`/admin/users/${encodeURIComponent(r.authorUserId)}`}
                                className="text-primary hover:underline"
                              >
                                {r.authorDisplayName}
                              </Link>
                            </td>
                            <td className={`${ADMIN_TD} text-muted-foreground`}>
                              {getDiscussionCategoryLabel(r.category)}
                            </td>
                            <td className={`${ADMIN_TD} text-muted-foreground`}>
                              {statusLabel(r)}
                            </td>
                            <td
                              className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                            >
                              {r.commentCount}
                            </td>
                            <td className={`${ADMIN_TD} text-muted-foreground`}>
                              {r.openModerationFlags > 0 ? (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                                  {r.openModerationFlags} open
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className={ADMIN_TD_ACTIONS}>
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
                                  <DropdownMenuItem asChild>
                                    <Link to={`/admin/community/${r.id}`}>
                                      Open
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to={`/discussion/${r.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      View as user
                                    </Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/10 p-3 sm:px-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="flags" className={ADMIN_TABS_CONTENT}>
            {flagsQuery.isError && (
              <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {apiErrorText(flagsQuery.error, "Could not load flags.")}
              </div>
            )}

            {!flagsQuery.isError && (
              <div className={ADMIN_TABLE_CARD}>
                <div className="border-b border-white/10 p-3 text-sm text-muted-foreground sm:px-4">
                  Open profanity / moderation flags. Resolve after you review
                  the linked post.
                </div>
                <div className={ADMIN_TABLE_SCROLL}>
                  <table className={adminTable("min-w-[40rem]")}>
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className={ADMIN_TH}>Kind</th>
                        <th className={ADMIN_TH}>Actor</th>
                        <th className={ADMIN_TH}>Discussion</th>
                        <th className={ADMIN_TH}>Created</th>
                        <th className={ADMIN_TH}>Matches</th>
                        <th className="whitespace-nowrap p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {flagsQuery.isPending ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-8 text-center text-muted-foreground"
                          >
                            <Loader2 className="mx-auto size-6 animate-spin" />
                          </td>
                        </tr>
                      ) : flagRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-8 text-center text-muted-foreground"
                          >
                            No open flags.
                          </td>
                        </tr>
                      ) : (
                        flagRows.map((f: AdminModerationFlagRow) => (
                          <tr key={f.id} className="border-b border-white/5">
                            <td
                              className={`${ADMIN_TD} font-medium text-foreground`}
                            >
                              {f.kind}
                            </td>
                            <td className={ADMIN_TD}>
                              <Link
                                to={`/admin/users/${encodeURIComponent(f.actorUserId)}`}
                                className="text-primary hover:underline"
                              >
                                {f.actorUserId.slice(0, 8)}…
                              </Link>
                            </td>
                            <td className={ADMIN_TD}>
                              {f.discussionId ? (
                                <Link
                                  to={`/admin/community/${f.discussionId}`}
                                  className="text-primary hover:underline"
                                >
                                  Open thread
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className={`${ADMIN_TD} text-muted-foreground`}>
                              {f.createdAt}
                            </td>
                            <td
                              className={`max-w-[200px] truncate ${ADMIN_TD} text-xs text-muted-foreground`}
                            >
                              {formatMatches(f.matchedTerms)}
                            </td>
                            <td className={ADMIN_TD_ACTIONS}>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={resolveMutation.isPending}
                                onClick={() => resolveMutation.mutate(f.id)}
                              >
                                Resolve
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {flagTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-white/10 p-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={flagsPage <= 1}
                      onClick={() => setFlagsPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={flagsPage >= flagTotalPages}
                      onClick={() =>
                        setFlagsPage((p) => Math.min(flagTotalPages, p + 1))
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function formatMatches(raw: unknown): string {
  if (raw == null) return "—";
  if (Array.isArray(raw)) return raw.map(String).join(", ");
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return "—";
  }
}
