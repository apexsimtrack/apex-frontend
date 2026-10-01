import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  banAdminChallengeParticipant,
  deleteAdminChallengeCover,
  fetchAdminChallengeDetail,
  fetchAdminChallengeLeaderboard,
  fetchAdminChallengeParticipants,
  patchAdminChallenge,
  removeAdminChallengeParticipant,
  unbanAdminChallengeParticipant,
  updateAdminChallengeBan,
  uploadAdminChallengeCover,
} from "@/lib/api";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCarName, formatLapMs, formatTrackName } from "@/lib/utils";
import { formatChallengeDateTime, getBrowserTimeZone } from "@/lib/datetime";
import { ArrowLeft, Loader2, MoreHorizontal } from "lucide-react";
import SimBadge from "@/components/SimBadge";
import { useCatalogs } from "@/hooks/useCatalogs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MANUAL_ACTIVITY_SIMS,
  type ManualActivitySim,
} from "@/lib/manualActivityData";
import { resolveChallengeCoverUrl } from "@/lib/challenges/coverImage";
import CatalogPicker from "@/components/catalog/CatalogPicker";

const BAN_REASON_MAX = 500;

const PARTICIPANT_PAGE_SIZE = 20;
const LEADERBOARD_PAGE_SIZE = 20;
const PARTICIPANT_SEARCH_DEBOUNCE_MS = 300;

function formatChallengeStatusLabel(
  status: string,
): "Live" | "Upcoming" | "Finished" {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "Live";
    case "UPCOMING":
      return "Upcoming";
    case "ENDED":
      return "Finished";
    default:
      return "Finished";
  }
}

const STATUS_PILL_STYLE: Record<"Live" | "Upcoming" | "Finished", string> = {
  Live: "border-yellow-500/20 bg-yellow-500/10 text-yellow-200",
  Upcoming: "border-blue-500/20 bg-blue-500/10 text-blue-200",
  Finished: "border-white/10 bg-white/5 text-white/50",
};

function tierAccent(place: number): string {
  if (place === 1) return "bg-amber-500/10 text-amber-200";
  if (place === 2) return "bg-slate-400/10 text-slate-200";
  if (place === 3) return "bg-orange-900/20 text-orange-200";
  return "";
}

const SELECT_MANUAL_LIKE =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none focus:ring-0 disabled:opacity-50";

function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

function resolveCatalogTrackId(
  catalog: { id: string; name: string }[],
  storedToken: string,
  nameHint: string | null | undefined,
): string {
  const token = storedToken?.trim();
  if (token && catalog.some((t) => t.id === token)) return token;
  if (token) {
    const byTokenAsName = catalog.find(
      (t) => normLabel(t.name) === normLabel(token),
    );
    if (byTokenAsName) return byTokenAsName.id;
  }
  const h = nameHint?.trim();
  if (!h) return "";
  const nh = normLabel(h);
  const exact = catalog.find((t) => normLabel(t.name) === nh);
  if (exact) return exact.id;
  const partial = catalog.find(
    (t) => nh.includes(normLabel(t.name)) || normLabel(t.name).includes(nh),
  );
  return partial?.id ?? "";
}

function resolveCatalogCarId(
  catalog: { id: string; name: string }[],
  storedToken: string,
  nameHint: string | null | undefined,
): string {
  const token = storedToken?.trim();
  if (token && catalog.some((c) => c.id === token)) return token;
  if (token) {
    const byTokenAsName = catalog.find(
      (c) => normLabel(c.name) === normLabel(token),
    );
    if (byTokenAsName) return byTokenAsName.id;
  }
  const h = nameHint?.trim();
  if (!h) return "";
  const nh = normLabel(h);
  const exact = catalog.find((c) => normLabel(c.name) === nh);
  if (exact) return exact.id;
  const partial = catalog.find(
    (c) => nh.includes(normLabel(c.name)) || normLabel(c.name).includes(nh),
  );
  return partial?.id ?? "";
}

function localFromIso(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function localInputToIso(v: string): string {
  if (!v.trim()) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

type BanInfo = { reason: string | null; createdAt: string };

type AdminDetail = {
  id: string;
  title: string;
  description: string;
  sim: string;
  track: string;
  carClass: string;
  status: string;
  startsAt: string;
  endsAt: string;
  endedEarlyAt: string | null;
  participantCount: number;
  fastestLapMs: number | null;
  coverImageUrl?: string | null;
  /** Matches admin list API; derived from creator user name/email. */
  createdByDisplayName: string | null;
  badges?: {
    userId: string;
    displayName: string;
    place: number;
    tier: string;
    awardedAt: string;
  }[];
};

type ActionTarget = {
  userId: string;
  displayName: string;
  ban?: BanInfo | null;
};

export default function AdminChallengeDetail() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const id = challengeId?.trim() ?? "";
  const wantEdit = searchParams.get("edit") === "1";

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["admin", "challenge", id],
    queryFn: () => fetchAdminChallengeDetail(id) as Promise<AdminDetail>,
    enabled: Boolean(id),
  });

  const [editing, setEditing] = useState(wantEdit);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [trackId, setTrackId] = useState("");
  const [carId, setCarId] = useState("");
  const [sim, setSim] = useState<ManualActivitySim | "">("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [endEarlyOpen, setEndEarlyOpen] = useState(false);
  const [endEarlyError, setEndEarlyError] = useState<string | null>(null);
  /** After first hydrate for this challenge, skip syncing server → form while editing (avoids clobbering edits on refetch). */
  const hydratedForChallengeIdRef = useRef<string | null>(null);

  const isEnded = data?.status?.toUpperCase() === "ENDED";

  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const { data: leaderboardData, isPending: leaderboardLoading } = useQuery({
    queryKey: ["admin", "challenge", id, "leaderboard", leaderboardPage],
    queryFn: () =>
      fetchAdminChallengeLeaderboard(
        id,
        leaderboardPage,
        LEADERBOARD_PAGE_SIZE,
      ),
    enabled: Boolean(id),
  });

  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantSearch, setParticipantSearch] = useState("");
  const debouncedParticipantSearch = useDebouncedValue(
    participantSearch,
    PARTICIPANT_SEARCH_DEBOUNCE_MS,
  );
  useEffect(() => {
    setParticipantsPage(1);
  }, [debouncedParticipantSearch]);

  /** Reset list/search pagination when navigating client-side to another challenge. */
  useEffect(() => {
    setLeaderboardPage(1);
    setParticipantsPage(1);
    setParticipantSearch("");
  }, [id]);

  const { data: participantsData, isPending: participantsLoading } = useQuery({
    queryKey: [
      "admin",
      "challenge",
      id,
      "participants",
      participantsPage,
      debouncedParticipantSearch,
    ],
    queryFn: () =>
      fetchAdminChallengeParticipants(id, {
        page: participantsPage,
        pageSize: PARTICIPANT_PAGE_SIZE,
        ...(debouncedParticipantSearch.trim()
          ? { q: debouncedParticipantSearch.trim() }
          : {}),
      }),
    enabled: Boolean(id),
  });

  const badgePlaceByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data?.badges ?? []) {
      m.set(b.userId, b.place);
    }
    return m;
  }, [data?.badges]);

  const {
    tracks,
    cars,
    loading: catalogsLoading,
    error: catalogsError,
    retry: retryCatalogs,
  } = useCatalogs(sim || null);

  useEffect(() => {
    hydratedForChallengeIdRef.current = null;
  }, [id]);

  useEffect(() => {
    if (!data) return;
    if (editing && hydratedForChallengeIdRef.current === data.id) {
      return;
    }
    setTitle(data.title);
    setDescription(data.description);
    setTrackId(data.track);
    setCarId(data.carClass);
    setSim(
      (data.sim === "IRACING" || data.sim === "F1_25" || data.sim === "LMU"
        ? data.sim
        : "") as ManualActivitySim | "",
    );
    setStartsAt(localFromIso(data.startsAt));
    setEndsAt(localFromIso(data.endsAt));
    hydratedForChallengeIdRef.current = data.id;
  }, [data, editing]);

  /** Map legacy or label-only stored tokens to catalog ids once catalogs load. */
  useEffect(() => {
    if (!data || catalogsLoading || tracks.length === 0) return;
    const valid = tracks.some((t) => t.id === trackId);
    if (valid) return;
    const resolved = resolveCatalogTrackId(tracks, trackId || data.track, null);
    if (resolved) setTrackId(resolved);
  }, [data, catalogsLoading, tracks, trackId]);

  useEffect(() => {
    if (!data || catalogsLoading || cars.length === 0) return;
    const valid = cars.some((c) => c.id === carId);
    if (valid) return;
    const resolved = resolveCatalogCarId(cars, carId || data.carClass, null);
    if (resolved) setCarId(resolved);
  }, [data, catalogsLoading, cars, carId]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (isEnded) {
        return patchAdminChallenge(id, {
          title: title.trim(),
          description,
        });
      }
      const startsIso = localInputToIso(startsAt);
      const endsIso = localInputToIso(endsAt);
      return patchAdminChallenge(id, {
        title: title.trim(),
        description,
        track: trackId.trim(),
        carClass: carId.trim(),
        sim,
        startsAt: startsIso,
        endsAt: endsIso,
      });
    },
    onSuccess: async () => {
      setEditing(false);
      setFormError(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["admin", "challenges"] });
      await qc.invalidateQueries({ queryKey: ["challenges"] });
    },
    onError: (e) => {
      setFormError(apiErrorText(e, "Save failed"));
    },
  });

  const coverUploadMutation = useMutation({
    mutationFn: (file: File) => uploadAdminChallengeCover(id, file),
    onSuccess: async () => {
      setCoverFile(null);
      setCoverError(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["admin", "challenges"] });
    },
    onError: (e) => {
      setCoverError(apiErrorText(e, "Cover upload failed"));
    },
  });

  const coverRemoveMutation = useMutation({
    mutationFn: () => deleteAdminChallengeCover(id),
    onSuccess: async () => {
      setCoverFile(null);
      setCoverError(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["admin", "challenges"] });
    },
    onError: (e) => {
      setCoverError(apiErrorText(e, "Remove cover failed"));
    },
  });

  function handleSave() {
    setFormError(null);
    const t = title.trim();
    if (!t || !description.trim()) {
      setFormError("Title and description are required.");
      return;
    }
    if (isEnded) {
      saveMutation.mutate();
      return;
    }
    if (!sim) {
      setFormError("Select a sim.");
      return;
    }
    if (!trackId.trim() || !carId.trim()) {
      setFormError("Select a track and car.");
      return;
    }
    const startsIso = localInputToIso(startsAt);
    const endsIso = localInputToIso(endsAt);
    if (!startsIso || !endsIso) {
      setFormError("Enter valid start and end dates.");
      return;
    }
    if (new Date(startsIso).getTime() >= new Date(endsIso).getTime()) {
      setFormError("End date must be after start date.");
      return;
    }
    saveMutation.mutate();
  }

  const endEarlyMutation = useMutation({
    mutationFn: () => patchAdminChallenge(id, { endEarly: true }),
    onSuccess: async () => {
      setEndEarlyOpen(false);
      setEndEarlyError(null);
      await refetch();
      await qc.invalidateQueries({ queryKey: ["admin", "challenges"] });
      await qc.invalidateQueries({
        queryKey: ["admin", "challenge", id, "leaderboard"],
      });
      await qc.invalidateQueries({ queryKey: ["challenges"] });
    },
    onError: (e) => {
      setEndEarlyError(
        apiErrorText(e, "Could not end challenge"),
      );
    },
  });

  const [removeTarget, setRemoveTarget] = useState<ActionTarget | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<ActionTarget | null>(null);
  const [banReasonInput, setBanReasonInput] = useState("");
  const [banError, setBanError] = useState<string | null>(null);
  const [banMode, setBanMode] = useState<"create" | "edit">("create");

  /** Refresh every read-side query for this challenge after a ban/remove. */
  async function invalidateChallengeQueries(): Promise<void> {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "challenge", id] }),
      qc.invalidateQueries({
        queryKey: ["admin", "challenge", id, "leaderboard"],
      }),
      qc.invalidateQueries({
        queryKey: ["admin", "challenge", id, "participants"],
      }),
      qc.invalidateQueries({ queryKey: ["admin", "challenges"] }),
      qc.invalidateQueries({ queryKey: ["challenges"] }),
    ]);
  }

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeAdminChallengeParticipant(id, userId),
    onSuccess: async () => {
      setRemoveTarget(null);
      setRemoveError(null);
      await invalidateChallengeQueries();
    },
    onError: (e) => {
      setRemoveError(
        apiErrorText(e, "Could not remove participant"),
      );
    },
  });

  const banMutation = useMutation({
    mutationFn: ({
      userId,
      reason,
    }: {
      userId: string;
      reason: string | null;
    }) => banAdminChallengeParticipant(id, userId, reason),
    onSuccess: async () => {
      setBanTarget(null);
      setBanReasonInput("");
      setBanError(null);
      await invalidateChallengeQueries();
    },
    onError: (e) => {
      setBanError(apiErrorText(e, "Could not ban user"));
    },
  });

  const updateBanMutation = useMutation({
    mutationFn: ({
      userId,
      reason,
    }: {
      userId: string;
      reason: string | null;
    }) => updateAdminChallengeBan(id, userId, reason),
    onSuccess: async () => {
      setBanTarget(null);
      setBanReasonInput("");
      setBanError(null);
      await invalidateChallengeQueries();
    },
    onError: (e) => {
      setBanError(
        apiErrorText(e, "Could not update ban reason"),
      );
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => unbanAdminChallengeParticipant(id, userId),
    onSuccess: async () => {
      setBanTarget(null);
      setBanReasonInput("");
      setBanError(null);
      await invalidateChallengeQueries();
    },
    onError: (e) => {
      setBanError(apiErrorText(e, "Could not unban user"));
    },
  });

  function openRemove(target: ActionTarget): void {
    setRemoveTarget(target);
    setRemoveError(null);
  }

  function openCreateBan(target: ActionTarget): void {
    setBanTarget(target);
    setBanMode("create");
    setBanReasonInput("");
    setBanError(null);
  }

  function openEditBan(target: ActionTarget): void {
    setBanTarget(target);
    setBanMode("edit");
    setBanReasonInput(target.ban?.reason ?? "");
    setBanError(null);
  }

  if (!id) {
    return <p className="p-6 text-muted-foreground">Invalid id</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageMeta
        path={`/admin/challenges/${id}`}
        title={`Admin · Challenge | ${COMPANY_NAME}`}
        description="View and edit challenge details, participants, and leaderboard in the admin console."
        noindex
      />
      <div className="mb-6">
        <Link
          to="/admin/challenges"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to challenges
        </Link>
      </div>

      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-destructive">
          {apiErrorText(error, "Failed to load")}
        </p>
      )}

      {data && (
        <>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <span
                className={`mb-3 inline-block rounded border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  STATUS_PILL_STYLE[formatChallengeStatusLabel(data.status)]
                }`}
              >
                {formatChallengeStatusLabel(data.status)}
              </span>
              <h1 className="text-2xl font-bold text-foreground">
                {data.title}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{data.participantCount} joined</span>
                {data.fastestLapMs != null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Fastest {formatLapMs(data.fastestLapMs)}</span>
                  </>
                )}
                {data.createdByDisplayName && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Created by {data.createdByDisplayName}</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {!editing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                  {!isEnded && (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={endEarlyMutation.isPending}
                      onClick={() => {
                        setEndEarlyError(null);
                        setEndEarlyOpen(true);
                      }}
                    >
                      End early
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={handleSave}
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <div className="mb-8 space-y-4 rounded-xl border border-white/10 p-4">
              {isEnded && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Challenge has ended. Only title and description can be edited
                  — changing sim, track, car, or dates would invalidate the
                  awarded badges and leaderboard.
                </div>
              )}
              <label className="block text-xs text-muted-foreground">
                Title <span className="text-red-400">*</span>
                <Input
                  className="mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Description <span className="text-red-400">*</span>
                <textarea
                  className="mt-1 min-h-[100px] w-full rounded-md border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="block text-xs text-white/80">
                Sim / Game <span className="text-red-400">*</span>
                <select
                  className={`mt-1 ${SELECT_MANUAL_LIKE}`}
                  value={sim}
                  onChange={(e) => {
                    const v = e.target.value as ManualActivitySim | "";
                    setSim(v);
                    setTrackId("");
                    setCarId("");
                  }}
                  disabled={saveMutation.isPending || isEnded}
                >
                  <option value="">Select sim…</option>
                  {MANUAL_ACTIVITY_SIMS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              {catalogsError && sim && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-500/10 p-3">
                  <p className="text-sm text-red-500">{catalogsError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retryCatalogs}
                    className="border-white/20 text-foreground hover:bg-white/10"
                  >
                    Retry
                  </Button>
                </div>
              )}

              <label className="block text-xs text-white/80">
                Track <span className="text-red-400">*</span>
                {catalogsLoading && sim && (
                  <span className="ml-2 text-xs font-normal text-white/50">
                    <Loader2 className="mr-0.5 inline size-3 animate-spin align-middle" />
                    Loading…
                  </span>
                )}
                <CatalogPicker
                  className={`mt-1 ${SELECT_MANUAL_LIKE}`}
                  value={trackId}
                  onValueChange={setTrackId}
                  options={tracks}
                  label="Track"
                  placeholder={
                    !sim
                      ? "Select a sim first"
                      : catalogsLoading
                        ? "Loading…"
                        : "Select track…"
                  }
                  disabled={
                    saveMutation.isPending || !sim || catalogsLoading || isEnded
                  }
                />
              </label>

              <label className="block text-xs text-white/80">
                Car <span className="text-red-400">*</span>
                {catalogsLoading && sim && (
                  <span className="ml-2 text-xs font-normal text-white/50">
                    <Loader2 className="mr-0.5 inline size-3 animate-spin align-middle" />
                    Loading…
                  </span>
                )}
                <CatalogPicker
                  className={`mt-1 ${SELECT_MANUAL_LIKE}`}
                  value={carId}
                  onValueChange={setCarId}
                  options={cars}
                  label="Car"
                  placeholder={
                    !sim
                      ? "Select a sim first"
                      : catalogsLoading
                        ? "Loading…"
                        : "Select car…"
                  }
                  disabled={
                    saveMutation.isPending || !sim || catalogsLoading || isEnded
                  }
                />
              </label>

              <p className="text-xs text-muted-foreground">
                Times are entered in your local timezone:{" "}
                <span className="font-medium text-foreground">
                  {getBrowserTimeZone()}
                </span>
                . Players see them in their own local timezone.
              </p>
              <label className="block text-xs text-muted-foreground">
                Starts at <span className="text-red-400">*</span>
                <Input
                  className="mt-1"
                  type="datetime-local"
                  step="1"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  disabled={isEnded}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Ends at <span className="text-red-400">*</span>
                <Input
                  className="mt-1"
                  type="datetime-local"
                  step="1"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  disabled={isEnded}
                />
              </label>
              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
            </div>
          ) : (
            <div className="mb-8 space-y-4">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {data.description?.trim()
                  ? data.description
                  : "No description."}
              </p>
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-white/50">
                    Sim
                  </p>
                  <div className="mt-1">
                    <SimBadge sim={data.sim} size="md" />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-white/50">
                    Track
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {formatTrackName(data.track)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-white/50">
                    Car class
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {formatCarName(data.carClass)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-white/50">
                    Starts
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {formatChallengeDateTime(data.startsAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-white/50">
                    Ends
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {formatChallengeDateTime(data.endsAt)}
                  </p>
                </div>
                {data.endedEarlyAt && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-white/50">
                      Ended early
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {formatChallengeDateTime(data.endedEarlyAt)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-8 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Cover image
              </h2>
              <span
                className={
                  data.coverImageUrl?.trim()
                    ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200"
                    : "rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50"
                }
              >
                {data.coverImageUrl?.trim() ? "Custom" : "Default"}
              </span>
            </div>
            <img
              src={
                coverPreviewUrl ?? resolveChallengeCoverUrl(data.coverImageUrl)
              }
              alt=""
              className="aspect-video w-full max-w-xl rounded-xl border border-white/10 object-cover"
            />
            {editing && (
              <div className="max-w-xl space-y-2">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={
                    coverUploadMutation.isPending ||
                    coverRemoveMutation.isPending
                  }
                  onChange={(e) => {
                    setCoverError(null);
                    setCoverFile(e.target.files?.[0] ?? null);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {coverFile && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={coverUploadMutation.isPending}
                      onClick={() => coverUploadMutation.mutate(coverFile)}
                    >
                      {coverUploadMutation.isPending ? "Uploading…" : "Upload"}
                    </Button>
                  )}
                  {coverFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={coverUploadMutation.isPending}
                      onClick={() => setCoverFile(null)}
                    >
                      Clear selection
                    </Button>
                  )}
                  {data.coverImageUrl?.trim() && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={coverRemoveMutation.isPending}
                      onClick={() => coverRemoveMutation.mutate()}
                    >
                      {coverRemoveMutation.isPending
                        ? "Removing…"
                        : "Remove custom cover"}
                    </Button>
                  )}
                </div>
                {coverError && (
                  <p className="text-sm text-destructive">{coverError}</p>
                )}
              </div>
            )}
          </div>

          {!editing && (
            <>
              <div className="grid gap-8 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                      Participants
                      {participantsData?.total != null && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({participantsData.total})
                        </span>
                      )}
                    </h2>
                  </div>
                  <Input
                    placeholder="Search participants…"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    className="mb-0"
                    aria-label="Search participants"
                    autoComplete="off"
                  />

                  {participantsData &&
                    participantsData.total > 0 &&
                    !participantsLoading && (
                      <p className="mb-2 text-xs text-muted-foreground">
                        {(() => {
                          const start =
                            (participantsData.page - 1) *
                              PARTICIPANT_PAGE_SIZE +
                            1;
                          const end = Math.min(
                            participantsData.page * PARTICIPANT_PAGE_SIZE,
                            participantsData.total,
                          );
                          return `Showing ${start}–${end} of ${participantsData.total}`;
                        })()}
                      </p>
                    )}
                  {participantsLoading ? (
                    <div className="flex justify-center py-6" aria-busy="true">
                      <Loader2
                        className="size-4 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                    </div>
                  ) : (participantsData?.items ?? []).length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                      {debouncedParticipantSearch.trim()
                        ? "No participants match."
                        : "No participants yet."}
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {(participantsData?.items ?? []).map((p) => {
                        const banned = !!p.ban;
                        const target: ActionTarget = {
                          userId: p.userId,
                          displayName: p.displayName,
                          ban: p.ban ?? null,
                        };
                        return (
                          <li key={p.userId}>
                            <div
                              className={`flex items-center justify-between gap-2 rounded-md p-2 transition-colors hover:bg-white/5 ${banned ? "opacity-70" : ""}`}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <Link
                                  to={`/user/${encodeURIComponent(p.userId)}`}
                                  className="min-w-0 truncate font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                  aria-label={`View profile: ${p.displayName}`}
                                >
                                  {p.displayName}
                                </Link>
                                {banned && (
                                  <span
                                    className="shrink-0 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
                                    title={p.ban?.reason ?? undefined}
                                  >
                                    Banned
                                  </span>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  Joined{" "}
                                  {new Date(p.joinedAt).toLocaleDateString()}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Actions for ${p.displayName}`}
                                      className="size-7"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <Link
                                        to={`/user/${encodeURIComponent(p.userId)}`}
                                      >
                                        Open profile
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openRemove(target)}
                                      className="text-destructive"
                                    >
                                      Remove from challenge
                                    </DropdownMenuItem>
                                    {banned ? (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => openEditBan(target)}
                                        >
                                          Edit ban reason
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            unbanMutation.mutate(p.userId)
                                          }
                                        >
                                          Unban
                                        </DropdownMenuItem>
                                      </>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => openCreateBan(target)}
                                        className="text-destructive"
                                      >
                                        Ban from challenge
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {participantsData && participantsData.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={participantsPage <= 1}
                        onClick={() =>
                          setParticipantsPage((p) => Math.max(1, p - 1))
                        }
                      >
                        Previous
                      </Button>
                      <span className="text-muted-foreground">
                        Page {participantsData.page} /{" "}
                        {participantsData.totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={
                          participantsPage >= participantsData.totalPages
                        }
                        onClick={() =>
                          setParticipantsPage((p) =>
                            Math.min(participantsData.totalPages, p + 1),
                          )
                        }
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-foreground">
                    Badges
                  </h2>
                  {(data.badges ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No podium badges yet.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {(data.badges ?? []).map((b) => (
                        <li
                          key={b.userId}
                          className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${tierAccent(
                            b.place,
                          )}`}
                        >
                          <span className="font-medium">
                            P{b.place} · {b.tier}
                          </span>
                          <span>{b.displayName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="mt-8 rounded-xl border border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3 sm:px-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                    Leaderboard
                    {leaderboardData?.total != null && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({leaderboardData.total})
                      </span>
                    )}
                  </h2>
                  {leaderboardData && (
                    <p className="text-xs text-muted-foreground">
                      Page {leaderboardData.page} / {leaderboardData.totalPages}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="p-3">#</th>
                        <th className="p-3">Driver</th>
                        <th className="p-3">Best lap</th>
                        <th className="p-3">Date set</th>
                        <th className="p-3">Attempts</th>
                        <th className="p-3">Verification</th>
                        <th className="p-3">Session</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardLoading ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="p-6 text-center"
                            aria-busy="true"
                          >
                            <Loader2
                              className="mx-auto size-5 animate-spin text-muted-foreground"
                              aria-hidden
                            />
                          </td>
                        </tr>
                      ) : (leaderboardData?.items ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="p-6 text-center text-muted-foreground"
                          >
                            No laps recorded yet.
                          </td>
                        </tr>
                      ) : (
                        (leaderboardData?.items ?? []).map((r) => {
                          const place = badgePlaceByUser.get(r.userId);
                          const banned = !!r.ban;
                          const target: ActionTarget = {
                            userId: r.userId,
                            displayName: r.username,
                            ban: r.ban ?? null,
                          };
                          return (
                            <tr
                              key={`${r.userId}-${r.rank}`}
                              className={`border-b border-white/5 ${place != null ? tierAccent(place) : ""} ${banned ? "opacity-60" : ""}`}
                            >
                              <td className="p-3 tabular-nums">{r.rank}</td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <Link
                                    to={`/user/${encodeURIComponent(r.userId)}`}
                                    className="text-primary underline-offset-2 hover:underline"
                                  >
                                    {r.username}
                                  </Link>
                                  {banned && (
                                    <span
                                      className="rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
                                      title={r.ban?.reason ?? undefined}
                                    >
                                      Banned
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 font-mono">
                                {formatLapMs(r.bestLapMs)}
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {formatChallengeDateTime(r.bestLapAt)}
                              </td>
                              <td className="p-3 tabular-nums">
                                {r.attemptCount}
                              </td>
                              <td className="p-3">
                                {r.verification === "VERIFIED" ? (
                                  <span className="text-emerald-400">
                                    Verified
                                  </span>
                                ) : (
                                  <span className="text-amber-400">Manual</span>
                                )}
                              </td>
                              <td className="p-3">
                                {r.bestSessionId ? (
                                  <Link
                                    to={`/sessions/${r.bestSessionId}`}
                                    className="text-primary underline-offset-4 hover:underline"
                                  >
                                    View
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Actions for ${r.username}`}
                                      className="size-7"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <Link
                                        to={`/user/${encodeURIComponent(r.userId)}`}
                                      >
                                        Open profile
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openRemove(target)}
                                      className="text-destructive"
                                    >
                                      Remove from challenge
                                    </DropdownMenuItem>
                                    {banned ? (
                                      <>
                                        <DropdownMenuItem
                                          onClick={() => openEditBan(target)}
                                        >
                                          Edit ban reason
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() =>
                                            unbanMutation.mutate(r.userId)
                                          }
                                        >
                                          Unban
                                        </DropdownMenuItem>
                                      </>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => openCreateBan(target)}
                                        className="text-destructive"
                                      >
                                        Ban from challenge
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {leaderboardData && leaderboardData.totalPages > 1 && (
                  <div className="flex items-center justify-end gap-2 border-t border-white/10 p-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={leaderboardPage <= 1}
                      onClick={() =>
                        setLeaderboardPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={leaderboardPage >= leaderboardData.totalPages}
                      onClick={() =>
                        setLeaderboardPage((p) =>
                          Math.min(leaderboardData.totalPages, p + 1),
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {removeTarget && (
            <BaseAlertDialog
              isOpen={!!removeTarget}
              onClose={() => {
                setRemoveTarget(null);
                setRemoveError(null);
              }}
              title="Remove this participant?"
              description={
                <>
                  <span className="font-medium text-foreground">
                    {removeTarget.displayName}
                  </span>
                  &apos;s sessions for this challenge will be detached and their
                  leaderboard entry deleted. They may rejoin the challenge
                  afterwards. This cannot be undone.
                </>
              }
              size="sm"
              footer={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRemoveTarget(null);
                      setRemoveError(null);
                    }}
                    disabled={removeMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(removeTarget.userId)}
                  >
                    {removeMutation.isPending ? "Removing…" : "Remove"}
                  </Button>
                </>
              }
            >
              {removeError && (
                <p className="mt-3 text-sm text-destructive">{removeError}</p>
              )}
            </BaseAlertDialog>
          )}

          {banTarget && (
            <BaseAlertDialog
              isOpen={!!banTarget}
              onClose={() => {
                setBanTarget(null);
                setBanReasonInput("");
                setBanError(null);
              }}
              title={
                banMode === "edit" ? "Edit ban reason" : "Ban this participant?"
              }
              description={
                banMode === "edit" ? (
                  <>
                    Update the reason shown to{" "}
                    <span className="font-medium text-foreground">
                      {banTarget.displayName}
                    </span>{" "}
                    when they try to view this challenge.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {banTarget.displayName}
                    </span>{" "}
                    will not be able to post, join, or view this challenge.
                    Existing rows stay in the database (admin still sees them)
                    but are hidden from public views, including any podium
                    badge.
                  </>
                )
              }
              size="sm"
              footer={
                <>
                  {banMode === "edit" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => unbanMutation.mutate(banTarget.userId)}
                      disabled={
                        unbanMutation.isPending || updateBanMutation.isPending
                      }
                    >
                      {unbanMutation.isPending ? "Unbanning…" : "Unban"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setBanTarget(null);
                      setBanReasonInput("");
                      setBanError(null);
                    }}
                    disabled={
                      banMutation.isPending ||
                      updateBanMutation.isPending ||
                      unbanMutation.isPending
                    }
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      banMutation.isPending || updateBanMutation.isPending
                    }
                    onClick={() => {
                      const reason = banReasonInput.trim();
                      const reasonValue = reason.length > 0 ? reason : null;
                      if (banMode === "edit") {
                        updateBanMutation.mutate({
                          userId: banTarget.userId,
                          reason: reasonValue,
                        });
                      } else {
                        banMutation.mutate({
                          userId: banTarget.userId,
                          reason: reasonValue,
                        });
                      }
                    }}
                  >
                    {banMode === "edit"
                      ? updateBanMutation.isPending
                        ? "Saving…"
                        : "Save reason"
                      : banMutation.isPending
                        ? "Banning…"
                        : "Ban"}
                  </Button>
                </>
              }
            >
              <label className="mt-4 block text-xs uppercase tracking-wide text-muted-foreground">
                Reason (optional)
                <Textarea
                  className="mt-1 min-h-[88px]"
                  value={banReasonInput}
                  onChange={(e) =>
                    setBanReasonInput(e.target.value.slice(0, BAN_REASON_MAX))
                  }
                  maxLength={BAN_REASON_MAX}
                  placeholder="e.g. Posted a fake telemetry record"
                />
                <span className="mt-1 block text-right text-[11px] text-muted-foreground">
                  {banReasonInput.length}/{BAN_REASON_MAX}
                </span>
              </label>
              {banError && (
                <p className="mt-3 text-sm text-destructive">{banError}</p>
              )}
            </BaseAlertDialog>
          )}

          {endEarlyOpen && (
            <BaseAlertDialog
              isOpen={endEarlyOpen}
              onClose={() => {
                setEndEarlyOpen(false);
                setEndEarlyError(null);
              }}
              title="End challenge now?"
              description="The leaderboard will be frozen and Gold/Silver/Bronze badges will be awarded to the current top 3 finishers. This cannot be undone."
              size="sm"
              footer={
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEndEarlyOpen(false);
                      setEndEarlyError(null);
                    }}
                    disabled={endEarlyMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={endEarlyMutation.isPending}
                    onClick={() => endEarlyMutation.mutate()}
                  >
                    {endEarlyMutation.isPending ? "Ending…" : "End early"}
                  </Button>
                </>
              }
            >
              {endEarlyError && (
                <p className="mt-3 text-sm text-destructive">{endEarlyError}</p>
              )}
            </BaseAlertDialog>
          )}
        </>
      )}
    </div>
  );
}
