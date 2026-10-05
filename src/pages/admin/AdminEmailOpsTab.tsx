import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminAuthSignalsMetrics,
  fetchAdminEmailVerificationUsers,
  fetchAdminPasswordResetPending,
  postAdminEmailVerificationResend,
} from "@/lib/api";
import { apiErrorText } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";
import {
  ADMIN_TABLE_CARD,
  ADMIN_TABLE_SCROLL,
  ADMIN_TD,
  ADMIN_TD_ACTIONS,
  ADMIN_TH,
  adminTable,
} from "@/pages/admin/adminTableLayout";

const SEARCH_DEBOUNCE_MS = 200;

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatInt(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function AdminEmailOpsTab() {
  const qc = useQueryClient();

  const { data: authSignals, isPending: signalsPending } = useQuery({
    queryKey: ["admin", "metrics", "auth-signals"],
    queryFn: fetchAdminAuthSignalsMetrics,
    staleTime: 30_000,
  });

  const [verStatus, setVerStatus] = useState<"pending" | "expired">("pending");
  const [verPage, setVerPage] = useState(1);
  const [verSearchInput, setVerSearchInput] = useState("");
  const debouncedVerSearch = useDebouncedValue(
    verSearchInput,
    SEARCH_DEBOUNCE_MS,
  );

  const [prPage, setPrPage] = useState(1);
  const [prSearchInput, setPrSearchInput] = useState("");
  const debouncedPrSearch = useDebouncedValue(
    prSearchInput,
    SEARCH_DEBOUNCE_MS,
  );

  useEffect(() => {
    setVerPage(1);
  }, [debouncedVerSearch, verStatus]);

  useEffect(() => {
    setPrPage(1);
  }, [debouncedPrSearch]);

  const verParams = useMemo(
    () => ({
      page: verPage,
      pageSize: 20,
      status: verStatus,
      ...(debouncedVerSearch.trim() ? { q: debouncedVerSearch.trim() } : {}),
    }),
    [verPage, verStatus, debouncedVerSearch],
  );

  const verQuery = useQuery({
    queryKey: ["admin", "email-verification", "users", verParams],
    queryFn: () => fetchAdminEmailVerificationUsers(verParams),
  });

  const prParams = useMemo(
    () => ({
      page: prPage,
      pageSize: 20,
      ...(debouncedPrSearch.trim() ? { q: debouncedPrSearch.trim() } : {}),
    }),
    [prPage, debouncedPrSearch],
  );

  const prQuery = useQuery({
    queryKey: ["admin", "password-reset", "pending", prParams],
    queryFn: () => fetchAdminPasswordResetPending(prParams),
  });

  const resendMutation = useMutation({
    mutationFn: (userId: string) => postAdminEmailVerificationResend(userId),
    onSuccess: async (data) => {
      toast.success("Verification code sent.", {
        description: `New code expires ${formatTs(data.expiresAt)}`,
      });
      await qc.invalidateQueries({ queryKey: ["admin", "email-verification"] });
    },
    onError: (e: unknown) => {
      toast.error(
        apiErrorText(e, "Could not resend verification email."),
      );
    },
  });

  const verRows = verQuery.data?.items ?? [];
  const verTotal = verQuery.data?.total ?? 0;
  const verTotalPages = verQuery.data?.totalPages ?? 1;

  const prRows = prQuery.data?.items ?? [];
  const prTotal = prQuery.data?.total ?? 0;
  const prTotalPages = prQuery.data?.totalPages ?? 1;

  const verRangeLabel = useMemo(() => {
    const pageSize = 20;
    if (verTotal === 0) return "No results";
    const start = (verPage - 1) * pageSize + 1;
    const end = Math.min(verPage * pageSize, verTotal);
    return `Showing ${start}–${end} of ${verTotal} accounts`;
  }, [verTotal, verPage]);

  const prRangeLabel = useMemo(() => {
    const pageSize = 20;
    if (prTotal === 0) return "No results";
    const start = (prPage - 1) * pageSize + 1;
    const end = Math.min(prPage * pageSize, prTotal);
    return `Showing ${start}–${end} of ${prTotal} pending codes`;
  }, [prTotal, prPage]);

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-card/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            EmailCode rows (legacy counter)
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {signalsPending
              ? "—"
              : formatInt(authSignals?.emailCodesTotal ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Total rows in EmailCode table
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending password resets
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {signalsPending
              ? "—"
              : formatInt(authSignals?.passwordResetCodesPending ?? 0)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Unused codes not yet expired
          </p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Signup email verification
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Codes are never shown here (stored hashed). Use{" "}
          <strong className="text-foreground">Resend</strong> to email a fresh
          code to the user.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={verStatus === "pending" ? "secondary" : "outline"}
            onClick={() => setVerStatus("pending")}
          >
            Pending (not expired)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={verStatus === "expired" ? "secondary" : "outline"}
            onClick={() => setVerStatus("expired")}
          >
            Expired / stuck
          </Button>
        </div>

        {verQuery.isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(verQuery.error, "Could not load verification queue.")}
          </div>
        )}

        {!verQuery.isError && (
          <div className={ADMIN_TABLE_CARD}>
            <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
              <Input
                placeholder="Search email or name…"
                value={verSearchInput}
                onChange={(e) => setVerSearchInput(e.target.value)}
                className="w-full min-w-[12rem] max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                {verQuery.isPending ? "Loading…" : verRangeLabel}
              </p>
            </div>
            {verQuery.isPending ? (
              <div className="flex justify-center px-4 py-12">
                <Loader2
                  className="size-6 animate-spin text-muted-foreground"
                  aria-hidden
                />
              </div>
            ) : verRows.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No accounts in this view.
              </div>
            ) : (
              <div className={ADMIN_TABLE_SCROLL}>
                <table className={adminTable("min-w-[36rem]")}>
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className={ADMIN_TH}>User</th>
                      <th className={ADMIN_TH}>Code expires</th>
                      <th className={ADMIN_TH}>Email status</th>
                      <th className={`${ADMIN_TH} text-right tabular-nums`}>
                        Risk
                      </th>
                      <th className="w-28 whitespace-nowrap p-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {verRows.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className={ADMIN_TD}>
                          <Link
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            to={`/admin/users/${r.id}`}
                          >
                            {r.displayName}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {r.email}
                          </div>
                        </td>
                        <td
                          className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                        >
                          {formatTs(r.emailVerificationExpiresAt)}
                        </td>
                        <td className={`${ADMIN_TD} text-muted-foreground`}>
                          {r.emailStatus}
                        </td>
                        <td
                          className={`${ADMIN_TD} text-right tabular-nums text-muted-foreground`}
                        >
                          {r.emailRiskScore}
                        </td>
                        <td className={ADMIN_TD_ACTIONS}>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={resendMutation.isPending}
                            onClick={() => resendMutation.mutate(r.id)}
                          >
                            Resend
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!verQuery.isPending && !verQuery.isError && verTotal > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={verPage <= 1}
              onClick={() => setVerPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={verPage >= verTotalPages}
              onClick={() => setVerPage((p) => Math.min(verTotalPages, p + 1))}
            >
              Next
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Page {verPage} / {verTotalPages}
            </span>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Forgot-password queue
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Active reset codes (masked email). Users complete reset from the
          public forgot-password flow.
        </p>

        {prQuery.isError && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {apiErrorText(prQuery.error, "Could not load password reset queue.")}
          </div>
        )}

        {!prQuery.isError && (
          <div className={ADMIN_TABLE_CARD}>
            <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
              <Input
                placeholder="Search masked email / local part…"
                value={prSearchInput}
                onChange={(e) => setPrSearchInput(e.target.value)}
                className="w-full min-w-[12rem] max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                {prQuery.isPending ? "Loading…" : prRangeLabel}
              </p>
            </div>
            {prQuery.isPending ? (
              <div className="flex justify-center px-4 py-12">
                <Loader2
                  className="size-6 animate-spin text-muted-foreground"
                  aria-hidden
                />
              </div>
            ) : prRows.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No pending password reset codes.
              </div>
            ) : (
              <div className={ADMIN_TABLE_SCROLL}>
                <table className={adminTable("min-w-[32rem]")}>
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className={ADMIN_TH}>Email (masked)</th>
                      <th className={ADMIN_TH}>Expires</th>
                      <th className={`${ADMIN_TH} text-right tabular-nums`}>
                        Attempts
                      </th>
                      <th className={ADMIN_TH}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prRows.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td
                          className={`${ADMIN_TD} font-mono text-xs text-muted-foreground`}
                        >
                          {r.emailMasked}
                        </td>
                        <td
                          className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                        >
                          {formatTs(r.expiresAt)}
                        </td>
                        <td
                          className={`${ADMIN_TD} text-right tabular-nums text-muted-foreground`}
                        >
                          {r.attempts}
                        </td>
                        <td
                          className={`${ADMIN_TD} tabular-nums text-muted-foreground`}
                        >
                          {formatTs(r.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!prQuery.isPending && !prQuery.isError && prTotal > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={prPage <= 1}
              onClick={() => setPrPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={prPage >= prTotalPages}
              onClick={() => setPrPage((p) => Math.min(prTotalPages, p + 1))}
            >
              Next
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              Page {prPage} / {prTotalPages}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
