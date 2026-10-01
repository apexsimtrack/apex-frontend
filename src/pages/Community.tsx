import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import DiscussionCard from "@/pages/community/DiscussionCard";
import { DiscussionCardSkeleton } from "@/pages/community/DiscussionCardSkeleton";
import CommunityFilters from "@/pages/community/CommunityFilters";
import {
  getDiscussionsPage,
  getDiscussionCategoryCounts,
  DISCUSSIONS_PAGE_DEFAULT_LIMIT,
  createDiscussion,
  uploadDiscussionImage,
  getDiscussionListSortLabel,
  type Discussion,
  type DiscussionCategory,
  type DiscussionListSort,
} from "@/lib/api/community";
import { withRequestId } from "@/lib/api/errors";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";
import PageMeta from "@/components/PageMeta";
import { STATIC_SEO } from "@/config/seoMeta";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthRedirectState } from "@/auth/authRedirect";
import { AUTH_PATHS } from "@/config/navigation";
import type { WithRootError } from "@/lib/formWithRootError";
import {
  newDiscussionFormSchema,
  type NewDiscussionFormValues,
} from "@/lib/validation/community";
import NewDiscussionModal from "@/pages/community/NewDiscussionModal";

const COMMUNITY_PATH = STATIC_SEO.community.path;

const DESCRIPTION_TRUNCATE = 160;

function truncateDescription(text: string): string {
  const t = text.trim();
  if (t.length <= DESCRIPTION_TRUNCATE) return t;
  return t.slice(0, DESCRIPTION_TRUNCATE).trim() + "…";
}

const SEARCH_DEBOUNCE_MS = 300;

const emptyCategoryCounts = {
  all: 0,
  setup: 0,
  guides: 0,
  general: 0,
} as const;

export default function Community() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] =
    useState<DiscussionCategory>("all");
  const [sortBy, setSortBy] = useState<DiscussionListSort>("newest");
  const [searchInput, setSearchInput] = useState("");
  const searchQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [showNewDiscussionModal, setShowNewDiscussionModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDiscussionImage, setNewDiscussionImage] = useState<File | null>(
    null,
  );

  const newDiscussionForm = useForm<WithRootError<NewDiscussionFormValues>>({
    resolver: zodResolver(newDiscussionFormSchema),
    defaultValues: {
      category: "setup",
      title: "",
      description: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (showNewDiscussionModal) {
      newDiscussionForm.reset({
        category: "setup",
        title: "",
        description: "",
      });
      newDiscussionForm.clearErrors("root");
    }
  }, [showNewDiscussionModal, newDiscussionForm]);

  const {
    data: categoryCounts = emptyCategoryCounts,
    isPending: categoryCountsPending,
  } = useQuery({
    queryKey: ["discussions", "category-counts"],
    queryFn: getDiscussionCategoryCounts,
    refetchOnWindowFocus: false,
  });

  const {
    data: discussionPages,
    isLoading: loading,
    isFetching,
    error: discussionsQueryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "discussions",
      "community",
      selectedCategory,
      searchQuery,
      sortBy,
      DISCUSSIONS_PAGE_DEFAULT_LIMIT,
    ],
    queryFn: ({ pageParam }) =>
      getDiscussionsPage({
        category: selectedCategory,
        q: searchQuery.trim() || undefined,
        sort: sortBy,
        page: pageParam as number,
        limit: DISCUSSIONS_PAGE_DEFAULT_LIMIT,
        includeTotal: false,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    placeholderData: (previousData, previousQuery) => {
      if (!previousData || !previousQuery) return undefined;
      const prev = previousQuery.queryKey;
      if (
        prev[2] === selectedCategory &&
        prev[3] === searchQuery &&
        prev[4] === sortBy &&
        prev[5] === DISCUSSIONS_PAGE_DEFAULT_LIMIT
      ) {
        return previousData;
      }
      return undefined;
    },
    refetchOnWindowFocus: false,
  });

  const discussions = useMemo(
    () =>
      (discussionPages?.pages.flatMap((p) => p.items) ?? []) as Discussion[],
    [discussionPages],
  );

  const error = discussionsQueryError
    ? withRequestId(
        discussionsQueryError instanceof Error
          ? discussionsQueryError.message
          : "Failed to load discussions.",
        discussionsQueryError,
      )
    : null;

  const listRefetching = isFetching && !isFetchingNextPage && !loading;

  const onCreateDiscussion = async (values: NewDiscussionFormValues) => {
    newDiscussionForm.clearErrors("root");
    try {
      setCreating(true);
      const created = await createDiscussion({
        category: values.category,
        title: values.title.trim(),
        description: values.description.trim(),
      });
      if (newDiscussionImage) {
        try {
          await uploadDiscussionImage(created.id, newDiscussionImage);
        } catch (imgErr) {
          toast.error(
            withRequestId(
              imgErr instanceof Error
                ? imgErr.message
                : "Discussion created, but image upload failed.",
              imgErr,
            ),
          );
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["discussions"] });
      setShowNewDiscussionModal(false);
      setNewDiscussionImage(null);
      newDiscussionForm.reset({
        category: "setup",
        title: "",
        description: "",
      });
      newDiscussionForm.clearErrors("root");
    } catch (e) {
      console.error(e);
      newDiscussionForm.setError("root", {
        type: "server",
        message: withRequestId(
          e instanceof Error ? e.message : "Failed to create discussion.",
          e,
        ),
      });
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    if (creating) return;
    setShowNewDiscussionModal(false);
    setNewDiscussionImage(null);
    newDiscussionForm.clearErrors("root");
  };

  const openNewDiscussion = useCallback(() => {
    if (!user) {
      const state: AuthRedirectState = {
        message: "Sign in to start a discussion.",
        from: `${location.pathname}${location.search}`,
      };
      navigate(AUTH_PATHS.login, { state });
      return;
    }
    setShowNewDiscussionModal(true);
  }, [user, navigate, location.pathname, location.search]);

  const hasFilters =
    selectedCategory !== "all" ||
    searchQuery.trim().length > 0 ||
    sortBy !== "newest";

  const clearFilters = useCallback(() => {
    setSelectedCategory("all");
    setSortBy("newest");
    setSearchInput("");
  }, []);

  const listSectionLabel = getDiscussionListSortLabel(sortBy);
  const emptyMessage =
    loading || error
      ? null
      : discussions.length === 0
        ? hasFilters
          ? "No discussions match your search."
          : "No discussions yet. Start one!"
        : null;

  return (
    <>
      <PageMeta
        title={STATIC_SEO.community.title}
        description={STATIC_SEO.community.description}
        path={COMMUNITY_PATH}
      />
      <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 pb-28 pt-8 lg:pb-8">
        <section className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
              Sim Racing Community
            </h1>
            <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
              Connect with drivers, share setups, and discuss racing strategies.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewDiscussion}
            className="hidden shrink-0 items-center gap-2 rounded-xl bg-apex-primary px-4 py-2.5 font-apex-body text-sm font-bold text-white transition-colors hover:bg-apex-primary/90 lg:inline-flex"
          >
            <Plus className="size-4" aria-hidden />
            New Discussion
          </button>
        </section>

        <CommunityFilters
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onClearSearch={() => setSearchInput("")}
          sortBy={sortBy}
          onSortChange={setSortBy}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categoryCounts={categoryCounts}
          categoryCountsPending={categoryCountsPending}
          hasActiveFilters={hasFilters}
          onClear={clearFilters}
          className="mb-5"
        />

        <h2 className="mb-3 font-apex-body text-[10px] font-bold uppercase tracking-widest text-apex-on-surface-variant">
          {listSectionLabel}
        </h2>

        <div className="space-y-3">
          {listRefetching && (
            <DiscussionCardSkeleton count={2} className="mb-2 space-y-3" />
          )}
          {loading ? (
            <DiscussionCardSkeleton count={4} />
          ) : error ? (
            <div className="py-12 text-center">
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                {error}
              </p>
            </div>
          ) : emptyMessage ? (
            <div className="py-12 text-center">
              <p className="font-apex-body text-sm text-apex-on-surface-variant">
                {emptyMessage}
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "space-y-3",
                listRefetching && "pointer-events-none opacity-60",
              )}
              aria-busy={listRefetching || undefined}
            >
              {discussions.map((d) => (
                <DiscussionCard
                  key={d.id}
                  id={d.id}
                  title={d.title}
                  excerpt={
                    d.excerpt ??
                    truncateDescription(d.content ?? d.description ?? d.title)
                  }
                  author={d.author}
                  categoryKey={d.category ?? "general"}
                  likes={d.likeCount ?? 0}
                  replies={d.commentCount ?? d.commentsCount ?? d.replies ?? 0}
                  views={d.views ?? 0}
                  isPinned={d.isPinned}
                  imageUrl={d.imageUrl}
                  createdAt={d.createdAt}
                  wasEdited={Boolean(d.wasEdited || d.editedAt)}
                />
              ))}
              {hasNextPage && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="rounded-lg border border-apex-outline-variant/20 bg-apex-surface-container px-4 py-2 font-apex-body text-sm text-apex-on-surface transition-colors hover:bg-apex-surface-container-high disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openNewDiscussion}
          className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] right-6 z-40 flex size-11 items-center justify-center rounded-xl bg-apex-primary text-white shadow-2xl transition-colors hover:bg-apex-primary/90 lg:hidden"
          aria-label="New discussion"
        >
          <Plus className="size-5" aria-hidden />
        </button>

        <NewDiscussionModal
          open={showNewDiscussionModal}
          onOpenChange={(open) => {
            if (!open) {
              closeModal();
              return;
            }
            setShowNewDiscussionModal(true);
          }}
          form={newDiscussionForm}
          creating={creating}
          imageFile={newDiscussionImage}
          onImageFileChange={setNewDiscussionImage}
          onSubmit={onCreateDiscussion}
        />
      </div>
    </>
  );
}
