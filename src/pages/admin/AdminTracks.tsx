import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminCatalogList,
  fetchAdminCatalogConsistency,
  createAdminCatalogTrack,
  createAdminCatalogCar,
  patchAdminCatalogTrack,
  patchAdminCatalogCar,
  uploadAdminCatalogTrackImage,
  deleteAdminCatalogTrackImage,
  type AdminCatalogKind,
  type AdminCatalogTrackRow,
  type AdminCatalogCarRow,
  type AdminCatalogConsistency,
} from "@/lib/api";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import { validateTrackImageFile } from "@/lib/trackImageValidation";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, Loader2, MoreHorizontal } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADMIN_PAGE,
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";
import { ADMIN_TABS_LIST } from "@/pages/admin/adminTabsLayout";
import {
  MANUAL_ACTIVITY_SIMS,
  type ManualActivitySim,
} from "@/lib/manualActivityData";
import {
  catalogSimKeyToManualActivitySim,
  reviewCatalogOrphanSearchUrl,
  reviewCatalogReferenceUrl,
  type CatalogReviewKind,
} from "@/lib/catalogAdminReviewUrls";
import SimBadge from "@/components/SimBadge";

const TITLE = `Admin · Tracks & catalogs | ${COMPANY_NAME}`;
const SEARCH_DEBOUNCE_MS = 200;

const SELECT_MANUAL_LIKE =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none focus:ring-0 disabled:opacity-50";

export default function AdminTracks() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<AdminCatalogKind>("track");
  const [page, setPage] = useState(1);
  const [simFilter, setSimFilter] = useState("");
  const [includeRetired, setIncludeRetired] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTrack, setEditTrack] = useState<AdminCatalogTrackRow | null>(null);
  const [editCar, setEditCar] = useState<AdminCatalogCarRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const [resolveOrphan, setResolveOrphan] = useState<null | {
    kind: AdminCatalogKind;
    token: string;
    initialSim: ManualActivitySim | "";
    simLocked: boolean;
  }>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, simFilter, kind, includeRetired]);

  const listParams = useMemo(
    () => ({
      page,
      pageSize: 50,
      kind,
      ...(simFilter.trim() ? { sim: simFilter.trim() } : {}),
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(includeRetired ? { includeRetired: true } : {}),
    }),
    [page, kind, simFilter, debouncedSearch, includeRetired],
  );

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["admin", "catalog", listParams],
    queryFn: () => fetchAdminCatalogList(listParams),
  });

  const { data: consistency } = useQuery({
    queryKey: ["admin", "catalog", "consistency"],
    queryFn: fetchAdminCatalogConsistency,
    enabled: consistencyOpen,
  });

  const patchTrackMu = useMutation({
    mutationFn: (payload: {
      id: string;
      body: Parameters<typeof patchAdminCatalogTrack>[1];
    }) => patchAdminCatalogTrack(payload.id, payload.body),
    onSuccess: async () => {
      setEditTrack(null);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "catalog", "consistency"],
      });
    },
    onError: (e) =>
      setFormError(apiErrorText(e, "Update failed")),
  });

  const patchCarMu = useMutation({
    mutationFn: (payload: {
      id: string;
      body: Parameters<typeof patchAdminCatalogCar>[1];
    }) => patchAdminCatalogCar(payload.id, payload.body),
    onSuccess: async () => {
      setEditCar(null);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "catalog", "consistency"],
      });
    },
    onError: (e) =>
      setFormError(apiErrorText(e, "Update failed")),
  });

  const createTrackMu = useMutation({
    mutationFn: async (payload: {
      body: Parameters<typeof createAdminCatalogTrack>[0];
      imageFile?: File | null;
    }) => {
      const row = await createAdminCatalogTrack(payload.body);
      if (payload.imageFile) {
        try {
          await uploadAdminCatalogTrackImage(row.id, payload.imageFile);
        } catch (err) {
          // Track row exists — surface upload failure so admin can retry from Edit
          throw new ApiError(
            err instanceof ApiError ? err.status : 500,
            err instanceof ApiError
              ? `Track created, but image upload failed: ${err.message}`
              : "Track created, but image upload failed",
            undefined,
            undefined,
            err instanceof ApiError ? err.requestId : undefined,
          );
        }
      }
      return row;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setFormError(null);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "catalog", "consistency"],
      });
    },
    onError: (e) =>
      setFormError(apiErrorText(e, "Create failed")),
  });

  const createCarMu = useMutation({
    mutationFn: createAdminCatalogCar,
    onSuccess: async () => {
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "catalog", "consistency"],
      });
    },
    onError: (e) =>
      setFormError(apiErrorText(e, "Create failed")),
  });

  const resolveTrackMu = useMutation({
    mutationFn: createAdminCatalogTrack,
    onSuccess: async () => {
      setResolveOrphan(null);
      setResolveError(null);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "catalog", "consistency"],
      });
    },
    onError: (e) =>
      setResolveError(
        apiErrorText(e, "Could not add track to catalog"),
      ),
  });

  const resolveCarMu = useMutation({
    mutationFn: createAdminCatalogCar,
    onSuccess: async () => {
      setResolveOrphan(null);
      setResolveError(null);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "catalog", "consistency"],
      });
    },
    onError: (e) =>
      setResolveError(
        apiErrorText(e, "Could not add car to catalog"),
      ),
  });

  const rows =
    data?.kind === "track"
      ? data.items
      : data?.kind === "car"
        ? data.items
        : [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const currentPage = data?.page ?? page;

  const rangeLabel = useMemo(() => {
    if (total === 0) return "Showing 0 of 0 results";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    const noun = total === 1 ? "entry" : "entries";
    return `Showing ${start}–${end} of ${total} ${noun}`;
  }, [total, currentPage, pageSize]);

  const orphanTotal = useMemo(
    () => countConsistencyOrphans(consistency),
    [consistency],
  );

  return (
    <>
      <PageMeta
        path="/admin/tracks"
        title={TITLE}
        description="Manage track and car catalogs."
        noindex
      />
      <div className={ADMIN_PAGE}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Tracks & catalogs
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add, edit, retire, and audit catalog entries used across manual
              logging and challenges.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            New {kind === "track" ? "track" : "car"}
          </Button>
        </div>

        {isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(error, "Could not load catalog.")}
          </div>
        )}

        {!isError && (
          <>
            <Tabs
              value={kind}
              onValueChange={(v) => {
                setKind(v as AdminCatalogKind);
                setPage(1);
              }}
              className="mb-6"
            >
              <TabsList className={ADMIN_TABS_LIST}>
                <TabsTrigger value="track">Tracks</TabsTrigger>
                <TabsTrigger value="car">Cars</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className={ADMIN_TABLE_CARD}>
              <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <Input
                    placeholder="Search slug or name…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full min-w-[12rem] max-w-xs"
                  />
                  <select
                    className="rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                    value={simFilter}
                    onChange={(e) => {
                      setPage(1);
                      setSimFilter(e.target.value);
                    }}
                    aria-label="Sim"
                  >
                    <option value="">All sims</option>
                    {MANUAL_ACTIVITY_SIMS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={includeRetired}
                      onChange={(e) => {
                        setPage(1);
                        setIncludeRetired(e.target.checked);
                      }}
                      className="rounded border-white/20"
                    />
                    Include retired
                  </label>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground max-lg:w-full lg:text-right">
                  {isPending ? "Loading…" : rangeLabel}
                </p>
              </div>

              {isPending ? (
                <div
                  className="flex justify-center px-4 py-12"
                  aria-busy="true"
                >
                  <Loader2
                    className="size-6 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                </div>
              ) : rows.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No entries match
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Try clearing filters or create a new entry.
                  </p>
                </div>
              ) : (
                <div className={ADMIN_TABLE_SCROLL}>
                  <table className={adminTable("min-w-[36rem]")}>
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className={ADMIN_TH}>Sim</th>
                        <th className={ADMIN_TH}>Slug</th>
                        <th className={ADMIN_TH}>Display name</th>
                        {kind === "track" ? (
                          <th className={ADMIN_TH}>Length (km)</th>
                        ) : null}
                        {kind === "track" ? (
                          <th className={ADMIN_TH}>Image</th>
                        ) : null}
                        <th className={ADMIN_TH}>Status</th>
                        <th className="w-12 whitespace-nowrap p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {data?.kind === "track"
                        ? (rows as AdminCatalogTrackRow[]).map((r) => (
                            <tr key={r.id} className="border-b border-white/5">
                              <td className={ADMIN_TD}>
                                <SimBadge sim={r.sim} size="md" />
                              </td>
                              <td
                                className={`${ADMIN_TD} font-mono text-xs text-foreground`}
                              >
                                {r.slug}
                              </td>
                              <td className={ADMIN_TD}>{r.displayName}</td>
                              <td
                                className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                              >
                                {r.lengthKm != null ? r.lengthKm : "—"}
                              </td>
                              <td className={ADMIN_TD}>
                                {r.imageUrl ? (
                                  <img
                                    src={r.imageUrl}
                                    alt=""
                                    className="h-8 w-12 rounded object-cover"
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className={ADMIN_TD}>
                                {r.retiredAt ? (
                                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                                    Retired
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className={ADMIN_TD_ACTIONS}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8"
                                      aria-label="Actions"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setFormError(null);
                                        setEditTrack(r);
                                      }}
                                    >
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        patchTrackMu.mutate({
                                          id: r.id,
                                          body: {
                                            retired: r.retiredAt == null,
                                          },
                                        })
                                      }
                                    >
                                      {r.retiredAt ? "Restore" : "Retire"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))
                        : (rows as AdminCatalogCarRow[]).map((r) => (
                            <tr key={r.id} className="border-b border-white/5">
                              <td className={ADMIN_TD}>
                                <SimBadge sim={r.sim} size="md" />
                              </td>
                              <td
                                className={`${ADMIN_TD} font-mono text-xs text-foreground`}
                              >
                                {r.slug}
                              </td>
                              <td className={ADMIN_TD}>{r.displayName}</td>
                              <td className={ADMIN_TD}>
                                {r.retiredAt ? (
                                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                                    Retired
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className={ADMIN_TD_ACTIONS}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8"
                                      aria-label="Actions"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setFormError(null);
                                        setEditCar(r);
                                      }}
                                    >
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        patchCarMu.mutate({
                                          id: r.id,
                                          body: {
                                            retired: r.retiredAt == null,
                                          },
                                        })
                                      }
                                    >
                                      {r.retiredAt ? "Restore" : "Retire"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!isPending && totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
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
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-8 rounded-xl border border-white/10 p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setConsistencyOpen((o) => !o)}
              >
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Catalog consistency
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tokens stored on sessions or challenges that do not resolve
                    to the current catalog.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {consistencyOpen ? "Hide" : "Show"}
                  {orphanTotal > 0 ? ` (${orphanTotal} orphan groups)` : ""}
                </span>
              </button>
              {consistencyOpen && consistency && (
                <ConsistencyPanel
                  data={consistency}
                  onRefresh={() =>
                    void qc.invalidateQueries({
                      queryKey: ["admin", "catalog", "consistency"],
                    })
                  }
                  onOpenResolve={(p) => {
                    setResolveError(null);
                    setResolveOrphan(p);
                  }}
                />
              )}
              {consistencyOpen && !consistency && (
                <div className="mt-4 flex justify-center py-6">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {createOpen && (
        <CreateCatalogModal
          kind={kind}
          onClose={() => {
            setCreateOpen(false);
            setFormError(null);
          }}
          onSubmitTrack={(body, imageFile) =>
            createTrackMu.mutate({ body, imageFile })
          }
          onSubmitCar={(body) => createCarMu.mutate(body)}
          submitting={createTrackMu.isPending || createCarMu.isPending}
          errorMessage={formError}
        />
      )}

      {editTrack && (
        <EditTrackModal
          row={editTrack}
          onClose={() => {
            setEditTrack(null);
            setFormError(null);
          }}
          onSave={(body) => patchTrackMu.mutate({ id: editTrack.id, body })}
          submitting={patchTrackMu.isPending}
          errorMessage={formError}
        />
      )}

      {editCar && (
        <EditCarModal
          row={editCar}
          onClose={() => {
            setEditCar(null);
            setFormError(null);
          }}
          onSave={(body) => patchCarMu.mutate({ id: editCar.id, body })}
          submitting={patchCarMu.isPending}
          errorMessage={formError}
        />
      )}

      {resolveOrphan && (
        <ResolveOrphanCatalogModal
          key={`${resolveOrphan.kind}-${resolveOrphan.token}`}
          kind={resolveOrphan.kind}
          token={resolveOrphan.token}
          initialSimSelect={resolveOrphan.initialSim}
          simLocked={resolveOrphan.simLocked}
          onClose={() => {
            setResolveOrphan(null);
            setResolveError(null);
          }}
          onSubmitTrack={(body) => resolveTrackMu.mutate(body)}
          onSubmitCar={(body) => resolveCarMu.mutate(body)}
          submitting={resolveTrackMu.isPending || resolveCarMu.isPending}
          errorMessage={resolveError}
        />
      )}
    </>
  );
}

function pbSimPickKey(kind: AdminCatalogKind, token: string): string {
  return `${kind}:${token}`;
}

function reviewHrefForOrphan(
  catalogKind: AdminCatalogKind,
  simKey: string | undefined,
  token: string,
  pbSimSelected: ManualActivitySim | "",
): string {
  const crKind: CatalogReviewKind = catalogKind === "track" ? "track" : "car";
  const manual =
    (simKey && catalogSimKeyToManualActivitySim(simKey)) ||
    pbSimSelected ||
    null;
  if (manual) {
    return reviewCatalogReferenceUrl({ sim: manual, kind: crKind });
  }
  return reviewCatalogOrphanSearchUrl(token, crKind);
}

function countConsistencyOrphans(
  c: AdminCatalogConsistency | undefined,
): number {
  if (!c) return 0;
  return (
    c.sessionTracks.length +
    c.sessionCars.length +
    c.challengeTracks.length +
    c.challengeCars.length +
    c.personalBestTracks.length +
    c.personalBestCars.length
  );
}

function ConsistencyPanel({
  data,
  onRefresh,
  onOpenResolve,
}: {
  data: AdminCatalogConsistency;
  onRefresh: () => void;
  onOpenResolve: (p: {
    kind: AdminCatalogKind;
    token: string;
    initialSim: ManualActivitySim | "";
    simLocked: boolean;
  }) => void;
}) {
  const [pbSim, setPbSim] = useState<Record<string, ManualActivitySim | "">>(
    {},
  );

  function renderBlock(
    title: string,
    kind: AdminCatalogKind,
    rows: Array<{ sim?: string; token: string; count: number }>,
    hasSimOnRow: boolean,
  ) {
    if (!rows.length) return null;

    return (
      <div key={title}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <ul className="max-h-96 overflow-y-auto rounded-lg border border-white/10 bg-card/50 text-sm">
          {rows.map((row) => {
            const pickKey = pbSimPickKey(kind, row.token);
            const pbPick = pbSim[pickKey] ?? "";
            const reviewHref = reviewHrefForOrphan(
              kind,
              row.sim,
              row.token,
              hasSimOnRow ? "" : pbPick,
            );

            return (
              <li
                key={`${title}-${row.token}`}
                className="flex flex-col gap-2 border-b border-white/5 p-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                  <span className="break-all font-mono text-xs text-foreground">
                    {row.token}
                  </span>
                  {hasSimOnRow && row.sim ? (
                    <SimBadge sim={row.sim} size="sm" />
                  ) : null}
                  {!hasSimOnRow ? (
                    <label className="flex max-w-xs flex-col gap-1 text-[10px] text-muted-foreground sm:inline-flex sm:flex-row sm:items-center">
                      <span className="whitespace-nowrap">
                        Sim for review / add
                      </span>
                      <select
                        className={`rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white ${SELECT_MANUAL_LIKE}`}
                        value={pbPick}
                        onChange={(e) =>
                          setPbSim((prev) => ({
                            ...prev,
                            [pickKey]: e.target.value as ManualActivitySim | "",
                          }))
                        }
                      >
                        <option value="">Select…</option>
                        {MANUAL_ACTIVITY_SIMS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {row.count}×
                  </span>
                  <a
                    href={reviewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    Review
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (hasSimOnRow && row.sim) {
                        const initial =
                          catalogSimKeyToManualActivitySim(row.sim) ?? "";
                        onOpenResolve({
                          kind,
                          token: row.token,
                          initialSim: initial,
                          simLocked: true,
                        });
                        return;
                      }
                      onOpenResolve({
                        kind,
                        token: row.token,
                        initialSim: pbPick,
                        simLocked: false,
                      });
                    }}
                  >
                    Add to catalog
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const anyRows =
    data.sessionTracks.length +
      data.sessionCars.length +
      data.challengeTracks.length +
      data.challengeCars.length +
      data.personalBestTracks.length +
      data.personalBestCars.length >
    0;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          Refresh list
        </Button>
      </div>

      {renderBlock(
        "Session tracks",
        "track",
        data.sessionTracks.map((x) => ({
          sim: x.sim,
          token: x.token,
          count: x.count,
        })),
        true,
      )}
      {renderBlock(
        "Session cars",
        "car",
        data.sessionCars.map((x) => ({
          sim: x.sim,
          token: x.token,
          count: x.count,
        })),
        true,
      )}
      {renderBlock(
        "Challenge tracks",
        "track",
        data.challengeTracks.map((x) => ({
          sim: x.sim,
          token: x.token,
          count: x.count,
        })),
        true,
      )}
      {renderBlock(
        "Challenge cars",
        "car",
        data.challengeCars.map((x) => ({
          sim: x.sim,
          token: x.token,
          count: x.count,
        })),
        true,
      )}
      {renderBlock(
        "Personal best tracks (no sim on row)",
        "track",
        data.personalBestTracks.map((x) => ({
          token: x.token,
          count: x.count,
        })),
        false,
      )}
      {renderBlock(
        "Personal best cars",
        "car",
        data.personalBestCars.map((x) => ({ token: x.token, count: x.count })),
        false,
      )}

      {!anyRows && (
        <p className="text-sm text-muted-foreground">
          No orphan tokens detected.
        </p>
      )}
    </div>
  );
}

function ResolveOrphanCatalogModal({
  kind,
  token,
  initialSimSelect,
  simLocked,
  onClose,
  onSubmitTrack,
  onSubmitCar,
  submitting,
  errorMessage,
}: {
  kind: AdminCatalogKind;
  token: string;
  initialSimSelect: ManualActivitySim | "";
  simLocked: boolean;
  onClose: () => void;
  onSubmitTrack: (body: Parameters<typeof createAdminCatalogTrack>[0]) => void;
  onSubmitCar: (body: Parameters<typeof createAdminCatalogCar>[0]) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const [sim, setSim] = useState(initialSimSelect);
  const [displayName, setDisplayName] = useState("");
  const [lengthKm, setLengthKm] = useState("");

  useEffect(() => {
    setSim(initialSimSelect);
  }, [initialSimSelect]);

  function submit() {
    if (!sim.trim() || !displayName.trim()) return;
    const slug = token.trim();
    if (!slug) return;
    if (kind === "track") {
      if (!lengthKm.trim()) return;
      const n = parseFloat(lengthKm);
      if (!Number.isFinite(n) || n <= 0) return;
      onSubmitTrack({
        sim: sim.trim(),
        slug,
        displayName: displayName.trim(),
        lengthKm: n,
      });
    } else {
      onSubmitCar({
        sim: sim.trim(),
        slug,
        displayName: displayName.trim(),
      });
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={`Add orphan ${kind === "track" ? "track" : "car"} to catalog`}
      description="Slug must match the stored token exactly so existing sessions resolve."
      size="md"
      mobileVariant="fullscreen"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Add to catalog"}
          </Button>
        </>
      }
    >
      {errorMessage && (
        <p className="text-sm text-red-500" role="alert">
          {errorMessage}
          {/already exists/i.test(errorMessage) ? (
            <span className="block pt-1 text-xs text-muted-foreground">
              Retire or edit the existing catalog row if this slug should stay
              unique per sim.
            </span>
          ) : null}
        </p>
      )}
      <div className="space-y-3">
        <label className="block text-xs text-muted-foreground">
          Sim <span className="text-red-400">*</span>
          <select
            className={`mt-1 ${SELECT_MANUAL_LIKE}`}
            value={sim}
            onChange={(e) => setSim(e.target.value as ManualActivitySim | "")}
            disabled={submitting || simLocked}
          >
            <option value="">Select sim…</option>
            {MANUAL_ACTIVITY_SIMS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Slug (token) <span className="text-red-400">*</span>
          <Input
            className="mt-1 font-mono text-sm"
            value={token}
            readOnly
            disabled
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Display name <span className="text-red-400">*</span>
          <Input
            className="mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Official name from vendor reference"
          />
        </label>
        {kind === "track" && (
          <label className="block text-xs text-muted-foreground">
            Length (km) <span className="text-red-400">*</span>
            <Input
              className="mt-1"
              inputMode="decimal"
              value={lengthKm}
              onChange={(e) => setLengthKm(e.target.value)}
            />
          </label>
        )}
      </div>
    </BaseModal>
  );
}

function CreateCatalogModal({
  kind,
  onClose,
  onSubmitTrack,
  onSubmitCar,
  submitting,
  errorMessage,
}: {
  kind: AdminCatalogKind;
  onClose: () => void;
  onSubmitTrack: (
    body: Parameters<typeof createAdminCatalogTrack>[0],
    imageFile?: File | null,
  ) => void;
  onSubmitCar: (body: Parameters<typeof createAdminCatalogCar>[0]) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const [sim, setSim] = useState("");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lengthKm, setLengthKm] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function onPickImage(file: File | null) {
    setImageError(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageFile(null);
    if (!file) return;
    const validated = validateTrackImageFile(file);
    if (validated.ok === false) {
      setImageError(validated.message);
      return;
    }
    const ok = await new Promise<boolean>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
    if (!ok) {
      setImageError("Could not decode image. Try another file.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function submit() {
    if (!sim.trim() || !slug.trim() || !displayName.trim()) return;
    if (kind === "track") {
      if (!lengthKm.trim()) return;
      const n = parseFloat(lengthKm);
      if (!Number.isFinite(n) || n <= 0) return;
      onSubmitTrack(
        {
          sim: sim.trim(),
          slug: slug.trim(),
          displayName: displayName.trim(),
          lengthKm: n,
        },
        imageFile,
      );
    } else {
      onSubmitCar({
        sim: sim.trim(),
        slug: slug.trim(),
        displayName: displayName.trim(),
      });
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={`New ${kind === "track" ? "track" : "car"}`}
      size="md"
      mobileVariant="fullscreen"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Create"}
          </Button>
        </>
      }
    >
      {(errorMessage || imageError) && (
        <p className="text-sm text-red-500" role="alert">
          {errorMessage ?? imageError}
        </p>
      )}
      <div className="space-y-3">
        <label className="block text-xs text-muted-foreground">
          Sim <span className="text-red-400">*</span>
          <select
            className={`mt-1 ${SELECT_MANUAL_LIKE}`}
            value={sim}
            onChange={(e) => setSim(e.target.value)}
            disabled={submitting}
          >
            <option value="">Select sim…</option>
            {MANUAL_ACTIVITY_SIMS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Slug <span className="text-red-400">*</span>
          <Input
            className="mt-1 font-mono text-sm"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Display name <span className="text-red-400">*</span>
          <Input
            className="mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        {kind === "track" && (
          <>
            <label className="block text-xs text-muted-foreground">
              Length (km) <span className="text-red-400">*</span>
              <Input
                className="mt-1"
                inputMode="decimal"
                value={lengthKm}
                onChange={(e) => setLengthKm(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              Track image (optional)
              <Input
                className="mt-1"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={submitting}
                onChange={(e) =>
                  void onPickImage(e.target.files?.[0] ?? null)
                }
              />
            </label>
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Track preview"
                className="h-24 w-full rounded-lg bg-black/40 object-contain"
              />
            )}
          </>
        )}
      </div>
    </BaseModal>
  );
}

function EditTrackModal({
  row,
  onClose,
  onSave,
  submitting,
  errorMessage,
}: {
  row: AdminCatalogTrackRow;
  onClose: () => void;
  onSave: (body: Parameters<typeof patchAdminCatalogTrack>[1]) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(row.displayName);
  const [lengthKm, setLengthKm] = useState(
    row.lengthKm != null ? String(row.lengthKm) : "",
  );
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder));
  const [imageUrl, setImageUrl] = useState(row.imageUrl);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  async function onPickImage(file: File | null) {
    setImageError(null);
    if (!file) return;
    const validated = validateTrackImageFile(file);
    if (validated.ok === false) {
      setImageError(validated.message);
      return;
    }
    setImageBusy(true);
    try {
      const res = await uploadAdminCatalogTrackImage(row.id, file);
      setImageUrl(res.imageUrl);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
    } catch (e) {
      setImageError(
        apiErrorText(e, "Image upload failed"),
      );
    } finally {
      setImageBusy(false);
    }
  }

  async function onRemoveImage() {
    setImageError(null);
    setImageBusy(true);
    try {
      await deleteAdminCatalogTrackImage(row.id);
      setImageUrl(null);
      await qc.invalidateQueries({ queryKey: ["admin", "catalog"] });
    } catch (e) {
      setImageError(
        apiErrorText(e, "Could not remove image"),
      );
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title="Edit track"
      description={<span className="font-mono text-xs">{row.slug}</span>}
      size="md"
      mobileVariant="fullscreen"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting || imageBusy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || imageBusy}
            onClick={() => {
              const so = parseInt(sortOrder, 10);
              if (!lengthKm.trim()) return;
              const n = parseFloat(lengthKm);
              if (!Number.isFinite(n) || n <= 0) return;
              onSave({
                displayName: displayName.trim(),
                lengthKm: n,
                ...(Number.isFinite(so) ? { sortOrder: so } : {}),
              });
            }}
          >
            {submitting ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {(errorMessage || imageError) && (
        <p className="text-sm text-red-500" role="alert">
          {errorMessage ?? imageError}
        </p>
      )}
      <div className="space-y-3">
        <label className="block text-xs text-muted-foreground">
          Display name
          <Input
            className="mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Length (km) <span className="text-red-400">*</span>
          <Input
            className="mt-1"
            inputMode="decimal"
            value={lengthKm}
            onChange={(e) => setLengthKm(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Sort order
          <Input
            className="mt-1"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </label>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Track image</p>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-24 w-full rounded-lg bg-black/40 object-contain"
            />
          ) : (
            <p className="text-xs text-muted-foreground">No image uploaded.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={imageBusy || submitting}
              onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
            />
            {imageUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={imageBusy || submitting}
                onClick={() => void onRemoveImage()}
              >
                Remove image
              </Button>
            )}
          </div>
        </div>
      </div>
    </BaseModal>
  );
}

function EditCarModal({
  row,
  onClose,
  onSave,
  submitting,
  errorMessage,
}: {
  row: AdminCatalogCarRow;
  onClose: () => void;
  onSave: (body: Parameters<typeof patchAdminCatalogCar>[1]) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const [displayName, setDisplayName] = useState(row.displayName);
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder));

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title="Edit car"
      description={<span className="font-mono text-xs">{row.slug}</span>}
      size="md"
      mobileVariant="fullscreen"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={() => {
              const so = parseInt(sortOrder, 10);
              onSave({
                displayName: displayName.trim(),
                ...(Number.isFinite(so) ? { sortOrder: so } : {}),
              });
            }}
          >
            {submitting ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {errorMessage && (
        <p className="text-sm text-red-500" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="space-y-3">
        <label className="block text-xs text-muted-foreground">
          Display name
          <Input
            className="mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Sort order
          <Input
            className="mt-1"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </label>
      </div>
    </BaseModal>
  );
}
