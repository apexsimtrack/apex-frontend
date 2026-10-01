import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { createBillingPortalSession, getBillingPlans } from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { formatCurrentSubscriptionLabel } from "@/features/billing/subscriptionDisplay";
import {
  complimentaryAccessExpiresAt,
  formatBetaTrialEndsLabel,
  isActiveBetaTrial,
  isActiveSignupTrial,
  isPaidProUser,
} from "@/features/billing/betaTrial";
import { openExternalUrl } from "@/lib/capacitor/openExternalUrl";
import { normalizeBillingStores } from "@/features/billing/billingStore";
import {
  ALREADY_HAVE_PRO_MESSAGE,
  resolveSubscriptionManageActions,
  type SubscriptionManageAction,
} from "@/features/billing/subscriptionManagement";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatAccessUntilLabel,
  hasExpiredSubscriptionHistory,
  previousSubscriptionLabel,
  subscriptionPeriodEndLabel,
  subscriptionStatusLabel,
} from "@/features/billing/subscriptionStatusDisplay";
import { appOutlineButtonClassName } from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";

export function SubscriptionCard() {
  const { user } = useAuth();
  const onBetaTrial = isActiveBetaTrial(user);
  const onSignupTrial = isActiveSignupTrial(user);
  const onComplimentaryAccess = onBetaTrial || onSignupTrial;
  const isPaidPro = isPaidProUser(user);
  const complimentaryEndsLabel = formatBetaTrialEndsLabel(
    complimentaryAccessExpiresAt(user),
  );
  const manageActions = resolveSubscriptionManageActions(
    normalizeBillingStores(user?.billingStores),
    { hasPaidPro: isPaidPro },
  );

  const portalMutation = useMutation({
    mutationFn: async (action: SubscriptionManageAction) => {
      if (action.kind === "instructions") {
        throw new Error(action.description);
      }
      if (action.kind === "external_url") {
        await openExternalUrl(action.url);
        return action.url;
      }
      const { url } = await createBillingPortalSession();
      await openExternalUrl(url);
      return url;
    },
  });
  const portalErrorMessage =
    portalMutation.error instanceof Error
      ? withRequestId(portalMutation.error.message, portalMutation.error)
      : null;

  const { data: plans } = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: getBillingPlans,
  });

  const currentSubscriptionLabel = formatCurrentSubscriptionLabel(
    user
      ? {
          effectivePlan: user.effectivePlan,
          billingInterval: user.billingInterval ?? null,
        }
      : undefined,
    plans,
  );

  const billingInterval = user?.billingInterval ?? null;
  const accessUntilLabel = formatAccessUntilLabel(user?.currentPeriodEnd);
  const hasExpiredPro = hasExpiredSubscriptionHistory(user);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-apex-on-surface-variant">
        {isPaidPro
          ? ALREADY_HAVE_PRO_MESSAGE
          : hasExpiredPro
            ? "Your previous Apex Pro subscription has expired. Resubscribe on the pricing page to restore Pro access."
          : onSignupTrial
            ? "Your 10-day Pro trial includes every Pro feature. Subscribe on the pricing page anytime to keep access afterward."
            : onBetaTrial
              ? "You have complimentary full Pro access. Subscribe on the pricing page anytime to keep access afterward."
            : "Manage your Apex Pro plan on the pricing page."}
      </p>
      <div>
        <span className="text-xs text-apex-on-surface-variant">Plan</span>
        <p className="mt-0.5 font-apex-headline text-sm font-bold text-apex-on-surface">
          {subscriptionStatusLabel(user)}
        </p>
        {isPaidPro && currentSubscriptionLabel && (
          <p className="mt-0.5 text-sm text-apex-on-surface">
            {currentSubscriptionLabel}
          </p>
        )}
      </div>
      {hasExpiredPro && (
        <>
          <div>
            <span className="text-xs text-apex-on-surface-variant">
              Previous subscription
            </span>
            <p className="mt-0.5 font-apex-headline text-sm font-bold text-apex-on-surface">
              {previousSubscriptionLabel(user)}
            </p>
          </div>
          <div>
            <span className="text-xs text-apex-on-surface-variant">
              Expired
            </span>
            <p className="mt-0.5 font-apex-headline text-sm font-bold text-apex-on-surface">
              {accessUntilLabel ?? "Subscription ended"}
            </p>
          </div>
        </>
      )}
      {onComplimentaryAccess && complimentaryEndsLabel && (
        <div>
          <span className="text-xs text-apex-on-surface-variant">
            {onSignupTrial ? "Trial ends" : "Complimentary access ends"}
          </span>
          <p className="mt-0.5 font-apex-headline text-sm font-bold text-apex-on-surface">
            {complimentaryEndsLabel}
          </p>
        </div>
      )}
      {isPaidPro && billingInterval && (
        <div>
          <span className="text-xs text-apex-on-surface-variant">Billing</span>
          <p className="mt-0.5 font-apex-headline text-sm font-bold text-apex-on-surface">
            {billingInterval === "MONTHLY" ? "Monthly" : "Annual"}
          </p>
        </div>
      )}
      {isPaidPro && accessUntilLabel && (
        <div>
          <span className="text-xs text-apex-on-surface-variant">
            {subscriptionPeriodEndLabel(user)}
          </span>
          <p className="mt-0.5 font-apex-headline text-sm font-bold text-apex-on-surface">
            {accessUntilLabel}
          </p>
        </div>
      )}
      {isPaidPro ? (
        <>
          {manageActions.map((action) =>
            action.kind === "instructions" ? (
              <p
                key={action.id}
                className="rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container px-3 py-2 text-sm text-apex-on-surface-variant"
                data-testid="billing-manage-instructions"
              >
                {action.description}
              </p>
            ) : (
              <div key={action.id} className="space-y-1">
                <p className="text-xs text-apex-on-surface-variant">
                  {action.description}
                </p>
                <Button
                  type="button"
                  data-testid={`billing-manage-${action.id}`}
                  variant="outline"
                  className={cn("mt-1", appOutlineButtonClassName)}
                  disabled={portalMutation.isPending}
                  onClick={() => {
                    portalMutation.reset();
                    portalMutation.mutate(action);
                  }}
                >
                  {portalMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    action.label
                  )}
                </Button>
              </div>
            ),
          )}
          {portalErrorMessage && (
            <p className="mt-2 rounded-apex-sm border border-apex-error/25 bg-apex-error/10 px-3 py-2 text-sm text-apex-error">
              {portalErrorMessage}
            </p>
          )}
        </>
      ) : (
        <Button
          asChild
          variant="outline"
          className={cn("mt-2", appOutlineButtonClassName)}
          data-testid={
            onComplimentaryAccess
              ? "billing-view-pro-plans"
              : "billing-upgrade-to-pro"
          }
        >
          <Link to={"/pricing"}>
            {onComplimentaryAccess
              ? "View Pro plans"
              : hasExpiredPro
                ? "Resubscribe to Pro"
                : "Upgrade to Pro"}
          </Link>
        </Button>
      )}
    </div>
  );
}
