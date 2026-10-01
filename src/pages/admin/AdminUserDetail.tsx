import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminUser,
  fetchAdminUserDetail,
  fetchAdminUserDiscussionsCommented,
  fetchAdminUserDiscussionsStarted,
  fetchAdminUserSocialGraph,
  getBillingConfig,
  patchAdminUserProfile,
  patchAdminUserRole,
  patchAdminUserStatus,
  postAdminUserImpersonate,
  postAdminUserReverify,
  postAdminUserSetPassword,
  type AdminUserDetailResponse,
} from "@/lib/api";
import { postAdminSubscriptionSync, createAdminBetaAccess } from "@/lib/api/adminSubscriptions";
import { backupAdminCredentialsForImpersonation } from "@/lib/impersonation";
import { persistSessionTokenFromAuthPayload } from "@/auth/token";
import { apiErrorText, ApiError, withRequestId } from "@/lib/api/errors";
import { toast } from "sonner";
import PageMeta from "@/components/PageMeta";
import { COMPANY_NAME } from "@/lib/siteMeta";
import { BaseAlertDialog } from "@/components/ui/base-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Ban,
  Eye,
  Info,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  BillingIntervalChip,
  CancelAtPeriodEndBadge,
  PlanBadge,
  StaleSyncBadge,
  SubscriptionStatusBadge,
} from "@/pages/admin/adminSubscriptionBadges";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import SimBadge from "@/components/SimBadge";
import { cn, formatCarName, formatTrackName } from "@/lib/utils";
import { AdminUserWebSessionsSection } from "./AdminUserWebSessionsSection";

function RoleBadge({ role }: { role: "USER" | "ADMIN" }) {
  const isAdmin = role === "ADMIN";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        isAdmin
          ? "border-purple-500/40 bg-purple-500/15 text-purple-200"
          : "border-blue-500/40 bg-blue-500/15 text-blue-200",
      )}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function AccountBadge({
  isDeleted,
  suspendedAt,
}: {
  isDeleted: boolean;
  suspendedAt: string | null;
}) {
  if (isDeleted) {
    return (
      <span className="inline-flex rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
        Deleted
      </span>
    );
  }
  if (suspendedAt) {
    return (
      <span className="inline-flex rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-200">
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-200">
      Active
    </span>
  );
}

const LABEL = "text-[11px] uppercase tracking-widest text-white/50";

function CopyableId({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) {
    return (
      <div>
        <p className={LABEL}>{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="break-all text-xs text-foreground/90">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied");
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

function AdminUserSubscriptionSection({
  userId,
  userEmail,
  isBetaUser,
  betaTrialStartedAt,
  betaTrialExpiresAt,
  signupTrialStartedAt,
  signupTrialExpiresAt,
  subscription,
}: {
  userId: string;
  userEmail: string;
  isBetaUser: boolean;
  betaTrialStartedAt: string | null;
  betaTrialExpiresAt: string | null;
  signupTrialStartedAt: string | null;
  signupTrialExpiresAt: string | null;
  subscription: AdminUserDetailResponse["user"]["subscription"];
}) {
  const queryClient = useQueryClient();
  const billingConfigQ = useQuery({
    queryKey: ["billing", "config"],
    queryFn: getBillingConfig,
    staleTime: 300_000,
  });

  const grantMutation = useMutation({
    mutationFn: () =>
      createAdminBetaAccess({ email: userEmail, durationDays: 30 }),
    onSuccess: async () => {
      toast.success("Complimentary Pro granted (30 days)");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", userId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "subscriptions"],
      });
    },
    onError: (e) => {
      toast.error(apiErrorText(e, "Grant failed"));
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => postAdminSubscriptionSync(userId),
    onSuccess: async () => {
      toast.success("Subscription synced from RevenueCat");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "users", "detail", userId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin", "subscriptions"],
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "metrics"] });
    },
    onError: (e) => {
      toast.error(apiErrorText(e, "Sync failed"));
    },
  });

  const stripeUrl = subscription.stripeCustomerId
    ? `https://dashboard.stripe.com/customers/${subscription.stripeCustomerId}`
    : null;

  return (
    <div className="mb-8 rounded-xl border border-white/10 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Subscription</h2>
        <div className="flex flex-wrap items-center gap-2">
          {billingConfigQ.data?.mode ? (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
              {billingConfigQ.data.mode === "sandbox"
                ? "Sandbox billing"
                : "Live billing"}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-2 size-4" aria-hidden />
            )}
            Sync from RevenueCat
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={grantMutation.isPending}
            onClick={() => grantMutation.mutate()}
          >
            {grantMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : null}
            Grant 30-day Pro
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <PlanBadge
          effectivePlan={subscription.effectivePlan}
          subscriptionStatus={subscription.status}
          planDisplayName={subscription.planDisplayName}
          cancelAtPeriodEnd={subscription.cancelAtPeriodEnd}
        />
        <SubscriptionStatusBadge status={subscription.status} />
        <BillingIntervalChip interval={subscription.billingInterval} />
        <CancelAtPeriodEndBadge active={subscription.cancelAtPeriodEnd} />
        <StaleSyncBadge stale={subscription.isSyncStale} />
        {isBetaUser ? (
          <span className="inline-flex rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-100">
            Complimentary / beta
          </span>
        ) : null}
        {signupTrialExpiresAt ? (
          <span className="inline-flex rounded-full border border-apex-primary/40 bg-apex-primary/10 px-2 py-0.5 text-xs font-medium text-apex-primary">
            Signup trial
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className={LABEL}>Complimentary window</p>
          <p className="mt-1 text-sm text-foreground">
            {isBetaUser
              ? betaTrialExpiresAt
                ? `Until ${new Date(betaTrialExpiresAt).toLocaleString()}`
                : "Flagged (no expiry on file)"
              : "—"}
          </p>
          {betaTrialStartedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Started {new Date(betaTrialStartedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <div>
          <p className={LABEL}>Access until</p>
          <p className="mt-1 text-sm text-foreground">
            {subscription.currentPeriodEnd
              ? new Date(subscription.currentPeriodEnd).toLocaleString()
              : "—"}
          </p>
        </div>
        <div>
          <p className={LABEL}>Automatic signup trial</p>
          <p className="mt-1 text-sm text-foreground">
            {signupTrialExpiresAt
              ? `Until ${new Date(signupTrialExpiresAt).toLocaleString()}`
              : "—"}
          </p>
          {signupTrialStartedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Started {new Date(signupTrialStartedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <div>
          <p className={LABEL}>Period started</p>
          <p className="mt-1 text-sm text-foreground">
            {subscription.currentPeriodStart
              ? new Date(subscription.currentPeriodStart).toLocaleString()
              : "—"}
          </p>
        </div>
        <div>
          <p className={LABEL}>Last synced</p>
          <p className="mt-1 text-sm text-foreground">
            {subscription.lastSyncedAt
              ? new Date(subscription.lastSyncedAt).toLocaleString()
              : "Never"}
          </p>
        </div>
        <CopyableId
          label="Entitlement id"
          value={subscription.entitlementIdentifier}
        />
        <CopyableId
          label="RevenueCat app user id"
          value={subscription.revenuecatAppUserId}
        />
        <CopyableId
          label="Stripe customer id"
          value={subscription.stripeCustomerId}
        />
      </div>

      {stripeUrl ? (
        <p className="mt-4 text-xs text-muted-foreground">
          <a
            href={stripeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open in Stripe
            <ExternalLink className="size-3" aria-hidden />
          </a>
          {" · "}
          Manage subscription via the user billing portal or RevenueCat
          dashboard (app user id above).
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Complimentary Pro is granted from this page or{" "}
          <Link
            to="/admin/subscriptions"
            className="text-primary underline-offset-4 hover:underline"
          >
            Subscriptions
          </Link>
          . Paid entitlements are synced from RevenueCat.
        </p>
      )}
    </div>
  );
}

function formatSuspicionReason(code: string | null | undefined): string {
  if (!code) return "This account was flagged for review.";
  if (code === "DISPOSABLE_EMAIL_DOMAIN") {
    return "Email domain appears on a disposable-email blocklist.";
  }
  return code;
}

/** Toast body after POST /reverify — explains outcome even when status stays VALID. */
function formatReverifyToastDescription(validation: {
  status: "VALID" | "DISPOSABLE" | "RISKY";
  reason: string;
  score: number;
  isDisposable: boolean;
}): string {
  const { status, reason, score } = validation;
  const reasonBit = reason && reason !== "OK" ? ` Reason code: ${reason}.` : "";
  if (status === "VALID") {
    return `Result: VALID · score ${score}.${reasonBit} No disposable list match and no elevated-risk heuristics fired for this domain right now.`;
  }
  return `Result: ${status} · score ${score}.${reasonBit}`;
}

function ModerationSupportCard({
  icon: Icon,
  iconRingClass,
  title,
  description,
  hint,
  tooltipLabel,
  tooltipBody,
  children,
}: {
  icon: LucideIcon;
  iconRingClass: string;
  title: string;
  description: string;
  hint?: string;
  tooltipLabel: string;
  tooltipBody: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 gap-3.5">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]",
              iconRingClass,
            )}
          >
            <Icon className="size-[1.15rem]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                    aria-label={tooltipLabel}
                  >
                    <Info className="size-3.5 opacity-80" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-xs text-left text-xs leading-relaxed"
                >
                  {tooltipBody}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
            {hint ? (
              <p className="text-[11px] leading-snug text-amber-200/75">
                {hint}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto lg:min-w-[12rem]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminUserDetail() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user: me } = useAuth();

  const id = userIdParam?.trim() ?? "";
  const wantEdit = searchParams.get("edit") === "1";
  const [editing, setEditing] = useState(wantEdit);
  const hydratedForUserIdRef = useRef<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordConfirm, setEditPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReasonInput, setSuspendReasonInput] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [impersonateBusy, setImpersonateBusy] = useState(false);
  const [reverifyBusy, setReverifyBusy] = useState(false);
  const [startedPage, setStartedPage] = useState(1);
  const [commentedPage, setCommentedPage] = useState(1);

  useEffect(() => {
    setEditing(searchParams.get("edit") === "1");
  }, [searchParams]);

  const detailQuery = useQuery({
    queryKey: ["admin", "users", "detail", id],
    queryFn: () => fetchAdminUserDetail(id),
    enabled: Boolean(id),
  });

  const detail = detailQuery.data;

  const discussionsStartedQuery = useQuery({
    queryKey: [
      "admin",
      "users",
      "detail",
      id,
      "discussions-started",
      startedPage,
    ],
    queryFn: () => fetchAdminUserDiscussionsStarted(id, { page: startedPage }),
    enabled: Boolean(id),
  });

  const discussionsCommentedQuery = useQuery({
    queryKey: [
      "admin",
      "users",
      "detail",
      id,
      "discussions-commented",
      commentedPage,
    ],
    queryFn: () =>
      fetchAdminUserDiscussionsCommented(id, { page: commentedPage }),
    enabled: Boolean(id),
  });

  const socialGraphQuery = useQuery({
    queryKey: ["admin", "follows", "user", id, "summary"],
    queryFn: () => fetchAdminUserSocialGraph(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    hydratedForUserIdRef.current = null;
  }, [id]);

  useEffect(() => {
    setStartedPage(1);
    setCommentedPage(1);
  }, [id]);

  useEffect(() => {
    if (!detail?.user) return;
    if (editing && hydratedForUserIdRef.current === detail.user.id) return;
    setEditName(detail.user.name ?? "");
    setEditEmail(detail.user.email);
    setEditPassword("");
    setEditPasswordConfirm("");
    setPasswordError(null);
    setProfileError(null);
    hydratedForUserIdRef.current = detail.user.id;
  }, [detail?.user, editing]);

  function setEditMode(on: boolean): void {
    setEditing(on);
    if (!on) {
      setEditPassword("");
      setEditPasswordConfirm("");
      setPasswordError(null);
    }
    if (on) {
      hydratedForUserIdRef.current = null;
      setSearchParams({ edit: "1" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }

  const profileMutation = useMutation({
    mutationFn: async (vars: {
      userId: string;
      body: { name?: string; email?: string };
    }) => {
      if (Object.keys(vars.body).length === 0) return;
      await patchAdminUserProfile(vars.userId, vars.body);
    },
    onSuccess: async () => {
      hydratedForUserIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await detailQuery.refetch();
    },
    onError: (e) => {
      setProfileError(
        apiErrorText(e, "Could not save profile"),
      );
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (vars: { userId: string; password: string }) => {
      await postAdminUserSetPassword(vars.userId, { password: vars.password });
    },
    onSuccess: async () => {
      setEditPassword("");
      setEditPasswordConfirm("");
      setPasswordError(null);
      hydratedForUserIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
      await detailQuery.refetch();
      toast.success("Password updated", {
        description: "The user was sent an email with the new password.",
      });
    },
    onError: (e: unknown) => {
      if (
        e instanceof ApiError &&
        e.status === 503 &&
        e.code === "EMAIL_SEND_FAILED"
      ) {
        setPasswordError(null);
        toast.warning("Password updated; email not sent", {
          description: withRequestId(e.message, e),
          duration: 12_000,
        });
        setEditPassword("");
        setEditPasswordConfirm("");
        void qc.invalidateQueries({ queryKey: ["admin", "users"] });
        void qc.invalidateQueries({ queryKey: ["admin", "auth-sessions"] });
        void detailQuery.refetch();
        return;
      }
      setPasswordError(
        apiErrorText(e, "Could not set password"),
      );
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (vars: { userId: string; role: "USER" | "ADMIN" }) => {
      await patchAdminUserRole(vars.userId, { role: vars.role });
    },
    onSuccess: async () => {
      hydratedForUserIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await detailQuery.refetch();
    },
    onError: (e) => {
      setModError(apiErrorText(e, "Could not update role"));
    },
  });

  const resetAvatarMutation = useMutation({
    mutationFn: async (userId: string) => {
      await patchAdminUserProfile(userId, { avatarUrl: null });
    },
    onSuccess: async () => {
      hydratedForUserIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await detailQuery.refetch();
    },
    onError: (e) => {
      setProfileError(
        apiErrorText(e, "Could not reset avatar"),
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (vars: {
      userId: string;
      payload: { suspended: boolean; reason?: string };
    }) => {
      await patchAdminUserStatus(vars.userId, vars.payload);
    },
    onSuccess: async () => {
      setSuspendOpen(false);
      setSuspendReasonInput("");
      setModError(null);
      hydratedForUserIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await detailQuery.refetch();
    },
    onError: (e) => {
      setModError(
        apiErrorText(e, "Could not update status"),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (vars: { userId: string; confirmationEmail: string }) => {
      await deleteAdminUser(vars.userId, {
        confirmationEmail: vars.confirmationEmail,
      });
    },
    onSuccess: async () => {
      setDeleteOpen(false);
      setDeleteEmailConfirm("");
      setDeleteError(null);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      navigate("/admin/users");
    },
    onError: (e) => {
      setDeleteError(apiErrorText(e, "Delete failed"));
    },
  });

  const handleSaveProfile = () => {
    if (!detail?.user || detail.user.id !== id) return;
    const body: { name?: string; email?: string } = {};
    if (editName.trim() !== (detail.user.name ?? ""))
      body.name = editName.trim();
    if (editEmail.trim().toLowerCase() !== detail.user.email.toLowerCase()) {
      body.email = editEmail.trim().toLowerCase();
    }
    profileMutation.mutate({ userId: id, body });
  };

  const handleSetPassword = () => {
    setPasswordError(null);
    if (!detail?.user || detail.user.id !== id) return;
    if (isSelf(id)) return;
    if (!editPassword.trim()) {
      setPasswordError("Enter a new password.");
      return;
    }
    if (editPassword !== editPasswordConfirm) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (editPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    passwordMutation.mutate({ userId: id, password: editPassword });
  };

  const startImpersonation = async (targetId: string) => {
    setImpersonateBusy(true);
    setModError(null);
    try {
      const res = await postAdminUserImpersonate(targetId);
      backupAdminCredentialsForImpersonation();
      localStorage.setItem("apex_token", res.token);
      persistSessionTokenFromAuthPayload({});
      // Full document load: a SPA navigation would leave already-mounted query observers holding
      // the admin's data, so parts of the UI would keep rendering the wrong identity.
      window.location.assign("/");
    } catch (e) {
      setModError(
        apiErrorText(e, "Could not start impersonation"),
      );
      setImpersonateBusy(false);
    }
  };

  const reverifyEmail = async () => {
    if (!detail?.user || detail.user.id !== id) return;
    setReverifyBusy(true);
    setModError(null);
    try {
      const res = await postAdminUserReverify(id);
      hydratedForUserIdRef.current = null;
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await detailQuery.refetch();
      toast.success("Email reverified", {
        description: formatReverifyToastDescription(res.validation),
        duration: 12_000,
      });
    } catch (e) {
      const msg =
        apiErrorText(e, "Could not reverify email");
      setModError(msg);
      toast.error(msg);
    } finally {
      setReverifyBusy(false);
    }
  };

  const isSelf = (uid: string) => me?.id === uid;

  if (!id) {
    return <p className="p-6 text-muted-foreground">Invalid user id</p>;
  }

  const u = detail?.user;

  return (
    <div className="mx-auto max-w-4xl">
      <PageMeta
        path={`/admin/users/${id}`}
        title={`Admin · User | ${COMPANY_NAME}`}
        description="View and edit user details in the admin console."
        noindex
      />

      <div className="mb-6">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to users
        </Link>
      </div>

      {detailQuery.isPending && (
        <div className="flex justify-center py-12">
          <Loader2
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden
          />
        </div>
      )}

      {detailQuery.isError && (
        <p className="text-destructive">
          {apiErrorText(detailQuery.error, "Failed to load user")}
        </p>
      )}

      {u && !detailQuery.isPending && (
        <>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap gap-2">
                <AccountBadge
                  isDeleted={u.isDeleted}
                  suspendedAt={u.suspendedAt}
                />
                <RoleBadge role={u.role} />
                <PlanBadge
                  effectivePlan={u.subscription.effectivePlan}
                  subscriptionStatus={u.subscription.status}
                  planDisplayName={u.subscription.planDisplayName}
                  cancelAtPeriodEnd={u.subscription.cancelAtPeriodEnd}
                />
                {u.isSuspicious ? (
                  <span className="inline-flex rounded-full border border-amber-500/45 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-100">
                    Suspicious
                  </span>
                ) : null}
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {u.displayName}
              </h1>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {u.email}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                User id:{" "}
                <span className="font-mono text-foreground/90">{u.id}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!u.isDeleted &&
                (!editing ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditMode(true)}
                  >
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditMode(false);
                        hydratedForUserIdRef.current = null;
                        void detailQuery.refetch();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        profileMutation.isPending ||
                        resetAvatarMutation.isPending
                      }
                      onClick={handleSaveProfile}
                    >
                      {profileMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </>
                ))}
            </div>
          </div>

          {u.isSuspicious ? (
            <div className="mb-8 rounded-xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3">
              <p className="text-sm font-semibold text-amber-100">
                Suspicious account
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
                {formatSuspicionReason(u.suspicionReason)}
              </p>
            </div>
          ) : null}

          {editing && !u.isDeleted ? (
            <div className="mb-8 space-y-4 rounded-xl border border-white/10 p-4">
              <h2 className="text-sm font-semibold text-foreground">
                Edit profile
              </h2>
              <label className="block text-xs text-muted-foreground">
                Display name
                <Input
                  className="mt-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Email
                <Input
                  className="mt-1"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </label>
              {!isSelf(u.id) ? (
                <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs font-medium text-foreground">
                    Set password (emailed to user)
                  </p>
                  <label className="block text-xs text-muted-foreground">
                    New password
                    <div className="mt-1">
                      <PasswordInput
                        autoComplete="new-password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                      />
                    </div>
                  </label>
                  <label className="block text-xs text-muted-foreground">
                    Confirm password
                    <div className="mt-1">
                      <PasswordInput
                        autoComplete="new-password"
                        value={editPasswordConfirm}
                        onChange={(e) => setEditPasswordConfirm(e.target.value)}
                      />
                    </div>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={passwordMutation.isPending}
                    onClick={handleSetPassword}
                  >
                    {passwordMutation.isPending
                      ? "Saving…"
                      : "Set password & notify"}
                  </Button>
                  {passwordError ? (
                    <p className="text-sm text-destructive">{passwordError}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Use Settings to change your own password.
                </p>
              )}
              <div>
                <span className={LABEL}>Role</span>
                <select
                  className="mt-1 w-full rounded-md border border-white/10 bg-card px-3 py-2 text-sm"
                  value={u.role}
                  onChange={(e) => {
                    const v = e.target.value === "ADMIN" ? "ADMIN" : "USER";
                    roleMutation.mutate({ userId: id, role: v });
                  }}
                  disabled={roleMutation.isPending || isSelf(u.id)}
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => resetAvatarMutation.mutate(id)}
                  disabled={
                    resetAvatarMutation.isPending || profileMutation.isPending
                  }
                >
                  {resetAvatarMutation.isPending
                    ? "Resetting…"
                    : "Reset avatar"}
                </Button>
              </div>
              {profileError && (
                <p className="text-sm text-destructive">{profileError}</p>
              )}
            </div>
          ) : (
            <div className="mb-8 space-y-4">
              {u.bio?.trim() ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {u.bio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No bio.</p>
              )}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 p-4 sm:grid-cols-3">
                <div>
                  <p className={LABEL}>Email verified</p>
                  <p className="mt-1 text-sm text-foreground">
                    {u.emailVerified ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Email status</p>
                  <p className="mt-1 text-sm text-foreground">
                    {u.emailStatus ?? "—"}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Risk score</p>
                  <p className="mt-1 text-sm tabular-nums text-foreground">
                    {typeof u.emailRiskScore === "number"
                      ? u.emailRiskScore
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Joined</p>
                  <p className="mt-1 text-sm text-foreground">
                    {new Date(u.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className={LABEL}>Last validated</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {u.lastValidatedAt
                      ? new Date(u.lastValidatedAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Session visibility</p>
                  <p className="mt-1 text-sm text-foreground">
                    {u.sessionVisibility}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Private profile</p>
                  <p className="mt-1 text-sm text-foreground">
                    {u.privateProfile ? "Yes" : "No"}
                  </p>
                </div>
                {u.deletedAt && (
                  <div>
                    <p className={LABEL}>Deleted at</p>
                    <p className="mt-1 text-sm text-foreground">
                      {new Date(u.deletedAt).toLocaleString()}
                    </p>
                  </div>
                )}
                {u.suspendedAt && (
                  <div className="sm:col-span-2">
                    <p className={LABEL}>Suspension</p>
                    <p className="mt-1 text-sm text-destructive/90">
                      Since {new Date(u.suspendedAt).toLocaleString()}
                      {u.suspensionReason ? ` — ${u.suspensionReason}` : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <AdminUserSubscriptionSection
            userId={u.id}
            userEmail={u.email}
            isBetaUser={Boolean(u.isBetaUser)}
            betaTrialStartedAt={u.betaTrialStartedAt ?? null}
            betaTrialExpiresAt={u.betaTrialExpiresAt ?? null}
            signupTrialStartedAt={u.signupTrialStartedAt ?? null}
            signupTrialExpiresAt={u.signupTrialExpiresAt ?? null}
            subscription={u.subscription}
          />

          <div className="mb-8 rounded-xl border border-white/10 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Follow graph
              </h2>
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to={`/admin/follows/users/${encodeURIComponent(u.id)}`}>
                  Open social graph →
                </Link>
              </Button>
            </div>
            {socialGraphQuery.data ? (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className={LABEL}>Followers</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {socialGraphQuery.data.stats.followersCount}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Following</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {socialGraphQuery.data.stats.followingCount}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Pending in</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {socialGraphQuery.data.stats.pendingIn}
                  </p>
                </div>
                <div>
                  <p className={LABEL}>Pending out</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {socialGraphQuery.data.stats.pendingOut}
                  </p>
                </div>
              </div>
            ) : socialGraphQuery.isError ? (
              <p className="text-sm text-muted-foreground">
                {withRequestId(
                  "Could not load follow graph summary.",
                  socialGraphQuery.error,
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Loading follow graph…
              </p>
            )}
          </div>

          {!u.isDeleted && (
            <div className="mb-8 rounded-xl border border-white/10 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">
                    Moderation & support
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                    Account enforcement and support viewing. Actions are
                    audited.
                  </p>
                </div>
                {u.suspendedAt ? (
                  <span className="shrink-0 rounded-full border border-amber-500/35 bg-amber-500/[0.12] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-100/95">
                    Suspended
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/[0.1] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/90">
                    Active
                  </span>
                )}
              </div>
              {modError ? (
                <p className="mb-4 rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {modError}
                </p>
              ) : null}

              <div className="space-y-3">
                {u.suspendedAt ? (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="flex min-w-0 gap-3.5">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-200">
                          <RotateCcw className="size-5" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <h3 className="text-sm font-semibold tracking-tight text-foreground">
                            Restore access
                          </h3>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Removes suspension so the user can sign in again
                            with a valid password.
                          </p>
                          {isSelf(u.id) ? (
                            <p className="text-[11px] text-amber-200/75">
                              You cannot restore your own account from this
                              screen.
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full shrink-0 border-emerald-500/35 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30 sm:w-auto sm:min-w-[11rem]"
                        onClick={() =>
                          statusMutation.mutate({
                            userId: id,
                            payload: { suspended: false },
                          })
                        }
                        disabled={statusMutation.isPending || isSelf(u.id)}
                      >
                        {statusMutation.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Restoring…
                          </>
                        ) : (
                          "Restore account"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <ModerationSupportCard
                      icon={Ban}
                      iconRingClass="text-red-300/90"
                      title="Suspend account"
                      description="Blocks sign-in and revokes active sessions. Reversible later from this page."
                      hint={
                        u.role === "ADMIN"
                          ? "Staff admin accounts cannot be suspended here."
                          : isSelf(u.id)
                            ? "You cannot suspend your own account."
                            : undefined
                      }
                      tooltipLabel="About suspension"
                      tooltipBody="Sets moderation suspension and deletes auth sessions so tokens stop working. Reversible by restoring the account."
                    >
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full sm:min-w-[11rem]"
                        onClick={() => {
                          setSuspendReasonInput("");
                          setSuspendOpen(true);
                        }}
                        disabled={u.role === "ADMIN" || isSelf(u.id)}
                      >
                        Suspend account
                      </Button>
                    </ModerationSupportCard>

                    <ModerationSupportCard
                      icon={Trash2}
                      iconRingClass="text-red-200/85"
                      title="Close account (GDPR)"
                      description="Soft-delete and anonymize the account. Treat as permanent closure."
                      hint={
                        isSelf(u.id)
                          ? "You cannot close your own account from here."
                          : undefined
                      }
                      tooltipLabel="About account closure"
                      tooltipBody="GDPR-style closure: soft-delete, anonymized email, profile cleared, sessions removed. Not a full purge of every database row."
                    >
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full border-destructive/45 bg-destructive/[0.08] text-destructive sm:min-w-[11rem]",
                          "hover:bg-destructive/18 hover:border-destructive/75 hover:text-red-50",
                          "focus-visible:ring-destructive/35",
                        )}
                        onClick={() => {
                          setDeleteEmailConfirm("");
                          setDeleteError(null);
                          setDeleteOpen(true);
                        }}
                        disabled={isSelf(u.id)}
                      >
                        Close account (GDPR)
                      </Button>
                    </ModerationSupportCard>
                  </>
                )}

                <ModerationSupportCard
                  icon={Eye}
                  iconRingClass="text-sky-300/90"
                  title="View as this user"
                  description="Browse the product as this member. Your admin recovery token is stored in the browser."
                  hint={
                    isSelf(u.id)
                      ? "You cannot impersonate yourself."
                      : u.suspendedAt
                        ? "Suspended accounts cannot be impersonated."
                        : u.role === "ADMIN"
                          ? "You will browse the product as this admin. Admin APIs stay blocked until you stop."
                          : undefined
                  }
                  tooltipLabel="About impersonation"
                  tooltipBody="Issues a short-lived session as this user. Use Stop impersonating in the banner when finished."
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="hover:bg-sky-500/16 w-full border-sky-500/35 bg-sky-500/[0.08] text-sky-100 hover:border-sky-400/45 hover:text-white sm:min-w-[11rem]"
                    disabled={
                      impersonateBusy ||
                      Boolean(u.suspendedAt) ||
                      isSelf(u.id)
                    }
                    onClick={() => startImpersonation(id)}
                  >
                    {impersonateBusy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Starting…
                      </>
                    ) : (
                      "Open session"
                    )}
                  </Button>
                </ModerationSupportCard>

                <ModerationSupportCard
                  icon={RotateCcw}
                  iconRingClass="text-amber-200/85"
                  title="Reverify email"
                  description="Re-runs disposable/risk validation (Tier 1 + MX + WHOIS heuristics) and updates the stored email status."
                  tooltipLabel="About email reverify"
                  tooltipBody="Runs the full admin-grade validator, which may take a few seconds due to DNS/WHOIS lookups. Signup uses a faster path. Rotating temp-mail domains are not always in public lists—use suspend or add domains to data/extra-disposable-domains.txt on the server if needed."
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-amber-500/35 bg-amber-500/[0.08] text-amber-100 hover:border-amber-400/45 hover:bg-amber-500/15 hover:text-white sm:min-w-[11rem]"
                    disabled={reverifyBusy}
                    onClick={() => void reverifyEmail()}
                  >
                    {reverifyBusy ? "Reverifying…" : "Reverify email"}
                  </Button>
                </ModerationSupportCard>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex items-center gap-3 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/45">
                    <Info className="size-3.5" />
                  </span>
                  <p className="min-w-0 flex-1">
                    When you open a support session, use the sticky{" "}
                    <strong className="font-medium text-foreground/95">
                      Stop impersonating
                    </strong>{" "}
                    banner to return to this console without signing in again.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8 rounded-xl border border-white/10 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Community
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Totals — discussions: {detail.counts.discussions} · comments:{" "}
              {detail.counts.discussionComments}
            </p>

            <div className="mb-8">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
                Topics started
              </h3>
              {discussionsStartedQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : discussionsStartedQuery.isError ? (
                <p className="text-sm text-destructive">
                  {withRequestId(
                    "Could not load discussions.",
                    discussionsStartedQuery.error,
                  )}
                </p>
              ) : !discussionsStartedQuery.data?.items.length ? (
                <p className="text-sm text-muted-foreground">
                  No topics started.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {discussionsStartedQuery.data.items.map((row) => (
                    <li
                      key={row.id}
                      className="border-b border-white/5 pb-3 last:border-0"
                    >
                      <Link
                        to={`/discussion/${row.id}`}
                        className="line-clamp-2 font-medium text-primary hover:underline"
                      >
                        {row.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.category} · updated{" "}
                        {new Date(row.updatedAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {discussionsStartedQuery.data &&
                discussionsStartedQuery.data.totalPages > 1 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        startedPage <= 1 || discussionsStartedQuery.isFetching
                      }
                      onClick={() => setStartedPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span>
                      Page {startedPage} of{" "}
                      {discussionsStartedQuery.data.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        startedPage >=
                          discussionsStartedQuery.data.totalPages ||
                        discussionsStartedQuery.isFetching
                      }
                      onClick={() =>
                        setStartedPage((p) =>
                          Math.min(
                            discussionsStartedQuery.data!.totalPages,
                            p + 1,
                          ),
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
                Topics commented on
              </h3>
              {discussionsCommentedQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : discussionsCommentedQuery.isError ? (
                <p className="text-sm text-destructive">
                  {withRequestId(
                    "Could not load commented topics.",
                    discussionsCommentedQuery.error,
                  )}
                </p>
              ) : !discussionsCommentedQuery.data?.items.length ? (
                <p className="text-sm text-muted-foreground">
                  No comments on community topics.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {discussionsCommentedQuery.data.items.map((row) => (
                    <li
                      key={row.discussionId}
                      className="border-b border-white/5 pb-3 last:border-0"
                    >
                      <Link
                        to={`/discussion/${row.discussionId}`}
                        className="line-clamp-2 font-medium text-primary hover:underline"
                      >
                        {row.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.category} · last comment{" "}
                        {new Date(row.lastCommentAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {discussionsCommentedQuery.data &&
                discussionsCommentedQuery.data.totalPages > 1 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        commentedPage <= 1 ||
                        discussionsCommentedQuery.isFetching
                      }
                      onClick={() =>
                        setCommentedPage((p) => Math.max(1, p - 1))
                      }
                    >
                      Previous
                    </Button>
                    <span>
                      Page {commentedPage} of{" "}
                      {discussionsCommentedQuery.data.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        commentedPage >=
                          discussionsCommentedQuery.data.totalPages ||
                        discussionsCommentedQuery.isFetching
                      }
                      onClick={() =>
                        setCommentedPage((p) =>
                          Math.min(
                            discussionsCommentedQuery.data!.totalPages,
                            p + 1,
                          ),
                        )
                      }
                    >
                      Next
                    </Button>
                  </div>
                )}
            </div>
          </div>

          <AdminUserWebSessionsSection variant="page" userId={id} />

          {detail.challengeBans.length > 0 && (
            <div className="mb-8 rounded-xl border border-white/10 p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Challenge bans
              </h2>
              <ul className="space-y-2 text-sm">
                {detail.challengeBans.map((b) => (
                  <li
                    key={b.challengeId}
                    className="border-b border-white/5 pb-2"
                  >
                    <Link
                      to={`/admin/challenges/${b.challengeId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {b.challengeTitle}
                    </Link>
                    {b.reason && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {b.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-8 rounded-xl border border-white/10 p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Recent sessions
            </h2>
            {detail.recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className="p-2">Sim</th>
                      <th className="p-2">Track</th>
                      <th className="p-2">Car</th>
                      <th className="p-2">When</th>
                      <th className="p-2">Challenge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentSessions.map((s) => (
                      <tr
                        key={s.id}
                        className="cursor-pointer border-b border-white/5 hover:bg-white/[0.04]"
                        onClick={() => navigate(`/sessions/${s.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/sessions/${s.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open session ${s.id}`}
                      >
                        <td className="p-2">
                          <SimBadge sim={s.sim} size="sm" />
                        </td>
                        <td className="p-2 text-foreground">
                          {formatTrackName(s.track)}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {formatCarName(s.car)}
                        </td>
                        <td className="p-2 tabular-nums text-muted-foreground">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="p-2 text-xs text-amber-200/90">
                          {s.challengeTitle ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {suspendOpen && u && !u.isDeleted && (
        <BaseAlertDialog
          isOpen={suspendOpen}
          onClose={() => {
            setSuspendOpen(false);
            setSuspendReasonInput("");
          }}
          title="Suspend account"
          description="User will be unable to sign in until restored. Reason is stored in the audit log."
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSuspendOpen(false);
                  setSuspendReasonInput("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  !suspendReasonInput.trim() ||
                  statusMutation.isPending ||
                  u.role === "ADMIN"
                }
                onClick={() =>
                  statusMutation.mutate({
                    userId: id,
                    payload: {
                      suspended: true,
                      reason: suspendReasonInput.trim(),
                    },
                  })
                }
              >
                {statusMutation.isPending ? "Suspending…" : "Suspend"}
              </Button>
            </>
          }
        >
          <Label htmlFor="suspend-modal-reason" className="mt-4 block text-xs">
            Reason (required)
          </Label>
          <Textarea
            id="suspend-modal-reason"
            className="mt-1"
            value={suspendReasonInput}
            onChange={(e) => setSuspendReasonInput(e.target.value)}
            placeholder="Reason…"
          />
        </BaseAlertDialog>
      )}

      {deleteOpen && u && !u.isDeleted && (
        <BaseAlertDialog
          isOpen={deleteOpen}
          onClose={() => {
            setDeleteOpen(false);
            setDeleteError(null);
          }}
          title="Close account"
          description="Irreversible GDPR soft-delete (anonymized email, sessions revoked). Type the user's email exactly to confirm."
          size="sm"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  deleteEmailConfirm.trim() !== u.email ||
                  deleteMutation.isPending
                }
                onClick={() =>
                  deleteMutation.mutate({
                    userId: id,
                    confirmationEmail: deleteEmailConfirm.trim(),
                  })
                }
              >
                {deleteMutation.isPending ? "Closing…" : "Close account"}
              </Button>
            </>
          }
        >
          <p className="mt-2 font-mono text-sm text-foreground">{u.email}</p>
          <Input
            className="mt-4"
            value={deleteEmailConfirm}
            onChange={(e) => setDeleteEmailConfirm(e.target.value)}
            placeholder={u.email}
            autoComplete="off"
          />
          {deleteError && (
            <p className="mt-2 text-sm text-destructive">{deleteError}</p>
          )}
        </BaseAlertDialog>
      )}
    </div>
  );
}
