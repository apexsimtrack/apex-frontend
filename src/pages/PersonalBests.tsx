import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import PageMeta from "@/components/PageMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { COMPANY_NAME } from "@/lib/siteMeta";
import {
  getPersonalBests,
  getPersonalBestsFilterOptions,
  isProRequiredError,
} from "@/lib/api";
import { useIsProUser } from "@/contexts/AuthContext";
import { ApiError, withRequestId } from "@/lib/api/errors";
import PersonalBestsProLocked from "./personal-bests/PersonalBestsProLocked";
import PersonalBestsSummary from "./personal-bests/PersonalBestsSummary";
import PersonalBestsList from "./personal-bests/PersonalBestsList";
import PersonalBestsSkeleton from "./personal-bests/PersonalBestsSkeleton";
import PersonalBestsEmpty from "./personal-bests/PersonalBestsEmpty";
import PersonalBestsFilters from "./personal-bests/PersonalBestsFilters";
import PersonalBestsPagination from "./personal-bests/PersonalBestsPagination";

const PERSONAL_BESTS_PATH = "/personal-bests";
const title = `Personal bests | ${COMPANY_NAME}`;
const description = `Track your best qualifying laps per track and car on ${COMPANY_NAME}.`;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

function parsePageParam(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export default function PersonalBests() {
  const isPro = useIsProUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parsePageParam(searchParams.get("page"));
  const track = searchParams.get("track")?.trim() ?? "";
  const car = searchParams.get("car")?.trim() ?? "";
  const qFromUrl = searchParams.get("q")?.trim() ?? "";

  const [searchInput, setSearchInput] = useState(qFromUrl);
  const [searchFlushKey, setSearchFlushKey] = useState(0);
  const debouncedQ = useDebouncedValue(
    searchInput,
    SEARCH_DEBOUNCE_MS,
    searchFlushKey,
  );

  useEffect(() => {
    setSearchInput(qFromUrl);
  }, [qFromUrl]);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchFlushKey((key) => key + 1);
    updateParams({ q: null, page: "1" });
  }, [updateParams]);

  const clearAllFilters = useCallback(() => {
    setSearchInput("");
    setSearchFlushKey((key) => key + 1);
    updateParams({
      q: null,
      track: null,
      car: null,
      page: "1",
    });
  }, [updateParams]);

  useEffect(() => {
    if (debouncedQ === qFromUrl) return;
    updateParams({ q: debouncedQ || null, page: "1" });
  }, [debouncedQ, qFromUrl, updateParams]);

  const filterParams = useMemo(
    () => ({
      q: qFromUrl || undefined,
      track: track || undefined,
      car: car || undefined,
    }),
    [qFromUrl, track, car],
  );

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...filterParams,
    }),
    [page, filterParams],
  );

  const { data, isPending, error, isFetching } = useQuery({
    queryKey: ["personal-bests", "list", listParams],
    queryFn: () => getPersonalBests(listParams),
    enabled: isPro,
    placeholderData: keepPreviousData,
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 403) && count < 1,
  });

  // Filter options are user-wide and independent of page / list filters.
  const { data: filterOptions } = useQuery({
    queryKey: ["personal-bests", "filter-options"],
    queryFn: getPersonalBestsFilterOptions,
    enabled: isPro,
    staleTime: 60_000,
  });

  const locked =
    !isPro ||
    (error instanceof ApiError && error.status === 403) ||
    isProRequiredError(error);

  const rows = data?.personalBests ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const stats = data?.stats;
  const hasActiveFilters = Boolean(qFromUrl || track || car);
  const isInitialLoad = isPending && data === undefined;
  const showInitialEmpty = !hasActiveFilters && total === 0 && !isInitialLoad;
  const showFilteredEmpty = hasActiveFilters && total === 0 && !isInitialLoad;

  return (
    <>
      <PageMeta
        title={title}
        description={description}
        path={PERSONAL_BESTS_PATH}
        noindex
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-6 px-6 py-8">
        <header>
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Personal bests
          </h1>
          <p className="mt-1.5 max-w-2xl font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
            Your fastest qualifying laps by track and car, updated automatically
            from telemetry uploads.
          </p>
        </header>

        {locked ? (
          <PersonalBestsProLocked />
        ) : error && !isProRequiredError(error) ? (
          <div className="rounded-apex-lg border border-apex-outline-variant/10 bg-apex-surface-container-low p-6 text-center">
            <p className="font-apex-body text-sm text-apex-error">
              {withRequestId(
                error instanceof Error
                  ? error.message
                  : "Could not load personal bests.",
                error,
              )}
            </p>
          </div>
        ) : showInitialEmpty ? (
          <PersonalBestsEmpty />
        ) : (
          <>
            <PersonalBestsFilters
              searchInput={searchInput}
              onSearchInputChange={setSearchInput}
              track={track}
              onTrackChange={(value) =>
                updateParams({ track: value || null, page: "1" })
              }
              car={car}
              onCarChange={(value) =>
                updateParams({ car: value || null, page: "1" })
              }
              trackOptions={filterOptions?.tracks ?? []}
              carOptions={filterOptions?.cars ?? []}
              hasActiveFilters={hasActiveFilters}
              onClearSearch={clearSearch}
              onClear={clearAllFilters}
            />

            {isInitialLoad ? (
              <PersonalBestsSkeleton contentOnly />
            ) : (
              <>
                {stats ? <PersonalBestsSummary stats={stats} /> : null}

                {isFetching ? (
                  <p className="font-apex-body text-xs text-apex-on-surface-variant">
                    Updating…
                  </p>
                ) : null}

                {showFilteredEmpty ? (
                  <div className="rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low p-8 text-center">
                    <p className="font-apex-body text-sm text-apex-on-surface-variant">
                      No personal bests match your filters.
                    </p>
                  </div>
                ) : (
                  <>
                    <PersonalBestsList rows={rows} />
                    <PersonalBestsPagination
                      page={page}
                      totalPages={totalPages}
                      total={total}
                      limit={PAGE_SIZE}
                      onPageChange={(nextPage) =>
                        updateParams({ page: String(nextPage) })
                      }
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
