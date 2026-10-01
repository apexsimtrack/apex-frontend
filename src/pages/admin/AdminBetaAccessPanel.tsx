import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  createAdminBetaAccess,
  fetchAdminBetaAccessEmailLookup,
  fetchAdminBetaAccessList,
  revokeAdminBetaAccess,
  updateAdminBetaAccess,
  type AdminBetaAccessEmailLookup,
  type AdminBetaAccessGrant,
  type AdminBetaAccessListParams,
  type AdminBetaAccessStatus,
  type AdminBetaAccessUpdatePayload,
  type AdminBetaAccessWritePayload,
} from "@/lib/api/adminSubscriptions";
import { apiErrorText, ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { BaseAlertDialog, BaseModal } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 200;
const SELECT =
  "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none focus:ring-0";

type GrantMode = "duration" | "custom";

function errorMessage(error: unknown, fallback: string) {
  return apiErrorText(error, fallback);
}

function formatDateTime(value: string | null, emptyLabel: string): string {
  if (!value) return emptyLabel;
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toLocalDateTimeInput(value: string | null): string {
  const date = value ? new Date(value) : new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function defaultExpiryInput(durationDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + durationDays);
  return toLocalDateTimeInput(date.toISOString());
}

const BLOCKING_GRANT_LABEL: Partial<Record<AdminBetaAccessStatus, string>> = {
  PENDING: "grant waiting for signup",
  SCHEDULED: "scheduled grant",
  ACTIVE: "active grant",
};

export function betaAccessLookupNote(lookup: AdminBetaAccessEmailLookup): {
  tone: "found" | "reserved" | "warning";
  message: string;
} {
  if (lookup.blockingGrant) {
    const label =
      BLOCKING_GRANT_LABEL[lookup.blockingGrant.status] ?? "open grant";
    return {
      tone: "warning",
      message: `This email already has a ${label}. Edit or revoke it instead — granting again is rejected.`,
    };
  }
  if (lookup.accountDeleted) {
    return {
      tone: "warning",
      message:
        "The account for this email is deleted. Access stays reserved until someone signs up with it again.",
    };
  }
  if (lookup.linksImmediately) {
    const name = lookup.user?.name?.trim();
    return {
      tone: "found",
      message: `Account found${name ? `: ${name}` : ""}. Beta access starts as soon as you grant it.`,
    };
  }
  return {
    tone: "reserved",
    message:
      "No account with this email yet. Access is reserved and starts when they sign up.",
  };
}

function BetaStatusBadge({ status }: { status: AdminBetaAccessStatus }) {
  const styles =
    status === "ACTIVE"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
      : status === "PENDING"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-200"
        : status === "SCHEDULED"
          ? "border-purple-500/40 bg-purple-500/15 text-purple-200"
          : status === "REVOKED"
            ? "border-red-500/30 bg-red-500/10 text-red-200"
            : "border-white/15 bg-white/5 text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        styles,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function BetaAccessGrantModal({
  grant,
  onClose,
  onSave,
  pending,
}: {
  grant: AdminBetaAccessGrant | null;
  onClose: () => void;
  onSave: (
    payload: AdminBetaAccessWritePayload | AdminBetaAccessUpdatePayload,
  ) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState(grant?.email ?? "");
  const [mode, setMode] = useState<GrantMode>("duration");
  const [durationDays, setDurationDays] = useState(
    String(grant?.durationDays ?? 30),
  );
  const [startsAt, setStartsAt] = useState(
    toLocalDateTimeInput(grant?.startedAt ?? null),
  );
  const [expiresAt, setExpiresAt] = useState(
    grant?.expiresAt
      ? toLocalDateTimeInput(grant.expiresAt)
      : defaultExpiryInput(grant?.durationDays ?? 30),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const lookupMutation = useMutation({
    mutationFn: (value: string) => fetchAdminBetaAccessEmailLookup(value),
  });
  const lookup = lookupMutation.data ?? null;
  const lookupNote = lookup ? betaAccessLookupNote(lookup) : null;

  function checkEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setValidationError("Enter an email to check.");
      return;
    }
    setValidationError(null);
    lookupMutation.mutate(normalizedEmail);
  }

  function submit() {
    setValidationError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!grant && !normalizedEmail) {
      setValidationError("Email is required.");
      return;
    }

    if (mode === "duration") {
      const days = Number(durationDays);
      if (!Number.isInteger(days) || days < 1) {
        setValidationError(
          "Duration must be a whole number of at least 1 day.",
        );
        return;
      }
      onSave(
        grant
          ? { durationDays: days }
          : { email: normalizedEmail, durationDays: days },
      );
      return;
    }

    const start = new Date(startsAt);
    const expiry = new Date(expiresAt);
    if (
      !startsAt ||
      !expiresAt ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(expiry.getTime())
    ) {
      setValidationError("Enter valid start and expiry dates.");
      return;
    }
    if (expiry <= start) {
      setValidationError("Expiry must be after the start date.");
      return;
    }
    const dates = {
      startsAt: start.toISOString(),
      expiresAt: expiry.toISOString(),
    };
    onSave(grant ? dates : { email: normalizedEmail, ...dates });
  }

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={grant ? "Edit beta access" : "Grant beta access"}
      description={
        grant
          ? `Update beta access for ${grant.email}.`
          : "Create access for an existing user or reserve it for an email that has not signed up yet."
      }
      size="md"
      mobileVariant="fullscreen"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending && (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            )}
            {grant ? "Save changes" : "Grant access"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="beta-access-email">Email</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="beta-access-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                lookupMutation.reset();
              }}
              disabled={Boolean(grant) || pending}
              autoComplete="email"
              required
            />
            {!grant && (
              <Button
                type="button"
                variant="outline"
                onClick={checkEmail}
                disabled={pending || lookupMutation.isPending}
              >
                {lookupMutation.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                )}
                Check
              </Button>
            )}
          </div>
          <div aria-live="polite">
            {lookupMutation.isError && (
              <p className="mt-2 text-xs text-destructive">
                {errorMessage(lookupMutation.error, "Could not check this email")}
              </p>
            )}
            {lookupNote && (
              <p
                className={cn(
                  "mt-2 text-xs",
                  lookupNote.tone === "found"
                    ? "text-emerald-200"
                    : lookupNote.tone === "warning"
                      ? "text-amber-200"
                      : "text-muted-foreground",
                )}
              >
                {lookupNote.message}
              </p>
            )}
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            Access period
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "duration" ? "default" : "outline"}
              onClick={() => setMode("duration")}
            >
              Duration
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "custom" ? "default" : "outline"}
              onClick={() => setMode("custom")}
            >
              Custom dates
            </Button>
          </div>
        </fieldset>

        {mode === "duration" ? (
          <div>
            <Label htmlFor="beta-access-duration">Duration (days)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: "1 month", days: 30 },
                { label: "2 months", days: 60 },
                { label: "3 months", days: 90 },
                { label: "6 months", days: 180 },
              ].map((preset) => (
                <Button
                  key={preset.days}
                  type="button"
                  size="sm"
                  variant={
                    durationDays === String(preset.days)
                      ? "default"
                      : "outline"
                  }
                  onClick={() => setDurationDays(String(preset.days))}
                  disabled={pending}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Input
              id="beta-access-duration"
              type="number"
              min={1}
              step={1}
              className="mt-3"
              value={durationDays}
              onChange={(event) => setDurationDays(event.target.value)}
              disabled={pending}
            />
            {!grant && (
              <p className="mt-2 text-xs text-muted-foreground">
                If this email has not signed up, access activates on signup and
                the full selected duration is preserved.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="beta-access-start">Starts at</Label>
              <Input
                id="beta-access-start"
                type="datetime-local"
                className="mt-1"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <Label htmlFor="beta-access-expiry">Expires at</Label>
              <Input
                id="beta-access-expiry"
                type="datetime-local"
                className="mt-1"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={pending}
              />
            </div>
            {!grant && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                If this email has not signed up, the backend derives the exact
                duration between these dates. Access activates on signup with
                that full duration preserved.
              </p>
            )}
          </div>
        )}

        {validationError && (
          <p role="alert" className="text-sm text-destructive">
            {validationError}
          </p>
        )}
      </div>
    </BaseModal>
  );
}

export function AdminBetaAccessPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const [status, setStatus] = useState<AdminBetaAccessStatus | "">("");
  const [modalGrant, setModalGrant] = useState<
    AdminBetaAccessGrant | null | undefined
  >(undefined);
  const [revokeGrant, setRevokeGrant] = useState<AdminBetaAccessGrant | null>(
    null,
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const params = useMemo(
    (): AdminBetaAccessListParams => ({
      page,
      pageSize: PAGE_SIZE,
      ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
      ...(status ? { status } : {}),
    }),
    [debouncedSearch, page, status],
  );

  const listQuery = useQuery({
    queryKey: ["admin", "subscriptions", "beta-access", params],
    queryFn: () => fetchAdminBetaAccessList(params),
  });

  const refreshAccessQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin", "subscriptions", "beta-access"],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "metrics"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (
      payload: AdminBetaAccessWritePayload | AdminBetaAccessUpdatePayload,
    ) =>
      modalGrant
        ? updateAdminBetaAccess(
            modalGrant.id,
            payload as AdminBetaAccessUpdatePayload,
          )
        : createAdminBetaAccess(payload as AdminBetaAccessWritePayload),
    onSuccess: async () => {
      toast.success(modalGrant ? "Beta access updated" : "Beta access granted");
      setModalGrant(undefined);
      await refreshAccessQueries();
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to save beta access"));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAdminBetaAccess(id),
    onSuccess: async () => {
      toast.success("Beta access revoked");
      setRevokeGrant(null);
      await refreshAccessQueries();
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to revoke beta access"));
    },
  });

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = listQuery.data?.totalPages ?? 1;
  const pageSize = listQuery.data?.pageSize ?? PAGE_SIZE;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Beta access</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Grant, schedule, edit, or revoke complimentary beta access.
          </p>
        </div>
        <Button type="button" onClick={() => setModalGrant(null)}>
          <Plus className="mr-2 size-4" aria-hidden />
          Grant beta access
        </Button>
      </div>

      <div className={ADMIN_TABLE_CARD}>
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-end">
          <div className="min-w-[12rem] flex-1">
            <Label
              htmlFor="beta-access-search"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Search
            </Label>
            <Input
              id="beta-access-search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Email, name, or user id…"
              className="border-white/10 bg-white/5"
            />
          </div>
          <div>
            <Label
              htmlFor="beta-access-status"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Status
            </Label>
            <select
              id="beta-access-status"
              className={SELECT}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AdminBetaAccessStatus | "")
              }
            >
              <option value="">All</option>
              <option value="PENDING">Pending signup</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
        </div>

        {listQuery.isError && (
          <p role="alert" className="p-4 text-sm text-destructive">
            {errorMessage(listQuery.error, "Failed to load beta access")}
          </p>
        )}

        {listQuery.isPending ? (
          <div className="flex justify-center py-16">
            <Loader2
              className="size-8 animate-spin text-muted-foreground"
              aria-label="Loading beta access"
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No beta access grants match these filters.
            {(searchInput.trim() || status) && (
              <button
                type="button"
                className="mt-4 block w-full text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setSearchInput("");
                  setStatus("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={ADMIN_TABLE_SCROLL}>
              <table className={adminTable("min-w-[58rem]")}>
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className={`min-w-[15rem] ${ADMIN_TH}`}>Recipient</th>
                    <th className={ADMIN_TH}>Status</th>
                    <th className={ADMIN_TH}>Starts</th>
                    <th className={ADMIN_TH}>Expires</th>
                    <th className={ADMIN_TH}>Duration</th>
                    <th className="w-40 whitespace-nowrap p-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((grant) => (
                    <tr key={grant.id} className="border-b border-white/5">
                      <td className={`min-w-[15rem] ${ADMIN_TD}`}>
                        {grant.user ? (
                          <Link
                            to={`/admin/users/${grant.user.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {grant.user.name?.trim() || grant.user.email}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">
                            Not signed up
                          </span>
                        )}
                        <div className="mt-0.5 break-all text-xs text-muted-foreground">
                          {grant.email}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap ${ADMIN_TD}`}>
                        <BetaStatusBadge status={grant.status} />
                      </td>
                      <td
                        className={`whitespace-nowrap text-xs text-muted-foreground ${ADMIN_TD}`}
                      >
                        {formatDateTime(grant.startedAt, "On signup")}
                      </td>
                      <td
                        className={`whitespace-nowrap text-xs text-muted-foreground ${ADMIN_TD}`}
                      >
                        {formatDateTime(grant.expiresAt, "After signup")}
                      </td>
                      <td
                        className={`whitespace-nowrap tabular-nums text-muted-foreground ${ADMIN_TD}`}
                      >
                        {grant.durationDays} days
                      </td>
                      <td className={ADMIN_TD_ACTIONS}>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setModalGrant(grant)}
                            disabled={grant.status === "REVOKED"}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRevokeGrant(grant)}
                            disabled={
                              grant.status === "REVOKED" ||
                              grant.status === "EXPIRED"
                            }
                          >
                            Revoke
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-sm text-muted-foreground">
              <p>
                Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <span className="tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {modalGrant !== undefined && (
        <BetaAccessGrantModal
          grant={modalGrant}
          onClose={() => setModalGrant(undefined)}
          onSave={(payload) => saveMutation.mutate(payload)}
          pending={saveMutation.isPending}
        />
      )}

      {revokeGrant && (
        <BaseAlertDialog
          isOpen
          onClose={() => setRevokeGrant(null)}
          title="Revoke beta access?"
          description={`This immediately ends beta access for ${revokeGrant.email}.`}
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRevokeGrant(null)}
                disabled={revokeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => revokeMutation.mutate(revokeGrant.id)}
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? "Revoking…" : "Revoke access"}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
