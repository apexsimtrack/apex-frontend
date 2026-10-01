import { Loader2, Sparkles } from "lucide-react";
import type {
  BillingConfigResponse,
  BillingInterval,
  BillingPlansResponse,
} from "@/lib/api/activityBilling";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_RED } from "@/lib/appConfig";
import {
  appOutlineButtonClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import {
  getPackagePriceLabel,
  priceLabelForCatalogInterval,
  type ResolvedPackages,
} from "@/features/billing/packageMapping";
import type { BillingPackage } from "@/features/billing/billingPackage";
import {
  nativePurchaseDisclosure,
  paidProHeadline,
  shouldShowNativeRestore,
  type SubscriptionManageAction,
} from "@/features/billing/subscriptionManagement";
import type { StoreBillingPlatform } from "@/features/billing/storeProductIds";
import { BillingIntervalToggle } from "./BillingIntervalToggle";
import { PlanFeatureList } from "./PlanFeatureList";
import { PricingAlerts } from "./PricingAlerts";

type ProPlanCardProps = {
  features: string[];
  plans: BillingPlansResponse | undefined;
  billingConfig: BillingConfigResponse | null | undefined;
  isBillingEnabled: boolean;
  isNative: boolean;
  billingPlatform: StoreBillingPlatform;
  resolvedPackages: ResolvedPackages;
  billingInterval: BillingInterval;
  onBillingIntervalChange: (interval: BillingInterval) => void;
  selectedPackage: BillingPackage | null;
  annualSavingsPercent: number | null;
  /** Paid Pro only — complimentary users still see subscribe UI. */
  isPro: boolean;
  isExpiredSubscriber?: boolean;
  complimentaryAccessKind?: "signup" | "beta" | null;
  complimentaryEndsLabel?: string | null;
  isLoggedIn: boolean;
  authLoading: boolean;
  offeringsPending: boolean;
  eligibilityPending?: boolean;
  eligibilityError?: string | null;
  offeringsError?: string | null;
  onRetryEligibility?: () => void;
  onRetryOfferings?: () => void;
  isPurchasing: boolean;
  isRestoringPurchases: boolean;
  isOpeningBillingPortal: boolean;
  isRefreshingSubscription: boolean;
  currentSubscriptionLabel: string | null;
  isCanceled: boolean;
  accessUntilLabel: string | null;
  entitlementBillingInterval: BillingInterval | null;
  manageActions?: SubscriptionManageAction[];
  message: string | null;
  warning: string | null;
  error: string | null;
  onSubscribe: () => void;
  onRestorePurchases: () => void;
  onManageSubscription: (action: SubscriptionManageAction) => void;
  onSignInToSubscribe: () => void;
  className?: string;
};

export function ProPlanCard({
  features,
  plans,
  billingConfig,
  isBillingEnabled,
  isNative,
  billingPlatform,
  resolvedPackages,
  billingInterval,
  onBillingIntervalChange,
  selectedPackage,
  annualSavingsPercent,
  isPro,
  isExpiredSubscriber = false,
  complimentaryAccessKind = null,
  complimentaryEndsLabel = null,
  isLoggedIn,
  authLoading,
  offeringsPending,
  eligibilityPending = false,
  eligibilityError = null,
  offeringsError = null,
  onRetryEligibility,
  onRetryOfferings,
  isPurchasing,
  isRestoringPurchases,
  isOpeningBillingPortal,
  isRefreshingSubscription,
  currentSubscriptionLabel,
  isCanceled,
  accessUntilLabel,
  entitlementBillingInterval,
  manageActions = [],
  message,
  warning,
  error,
  onSubscribe,
  onRestorePurchases,
  onManageSubscription,
  onSignInToSubscribe,
  className,
}: ProPlanCardProps) {
  const hasPackages = Boolean(
    resolvedPackages.monthly || resolvedPackages.annual,
  );
  const showCatalogPricing =
    !isPro && (!isLoggedIn || !hasPackages) && Boolean(plans);

  const displayPrice =
    selectedPackage && !showCatalogPricing
      ? getPackagePriceLabel(selectedPackage, plans)
      : priceLabelForCatalogInterval(billingInterval, plans);

  const showIntervalToggle =
    !isPro &&
    (showCatalogPricing ||
      (isLoggedIn && isBillingEnabled && !offeringsPending && hasPackages));

  const monthlyToggleAvailable = showCatalogPricing
    ? true
    : resolvedPackages.monthly != null;
  const annualToggleAvailable = showCatalogPricing
    ? true
    : resolvedPackages.annual != null;

  const showRestore = shouldShowNativeRestore({
    isNative,
    isLoggedIn,
    isBillingEnabled,
  });

  const storeDisclosure = isNative
    ? (nativePurchaseDisclosure(billingPlatform) ??
      "Purchases are handled securely by your device's app store.")
    : null;

  const checkoutBlocked = eligibilityPending || offeringsPending;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-xl border-2 bg-apex-surface-container-low p-6 sm:p-7",
        className,
      )}
      style={{
        borderColor: "color-mix(in srgb, rgb(240, 28, 28) 60%, transparent)",
      }}
    >
      <div
        className="absolute -top-3 left-6 flex items-center gap-1 rounded-full px-3 py-0.5 font-apex-headline text-xs font-medium text-white"
        style={{ backgroundColor: BRAND_RED }}
      >
        <Sparkles className="size-3" aria-hidden />
        Pro
      </div>

      <h2 className="font-apex-headline text-lg font-semibold text-apex-on-surface">
        Apex Pro
      </h2>

      {isPro ? (
        <div className="mt-3 space-y-1" data-testid="billing-pro-active">
          <p className="font-apex-body text-sm font-medium text-apex-on-surface">
            {paidProHeadline(true)}
          </p>
          {currentSubscriptionLabel && (
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              Current plan: {currentSubscriptionLabel}
            </p>
          )}
          {(isCanceled || accessUntilLabel) && (
            <p className="font-apex-body text-sm text-apex-on-surface-variant">
              {isCanceled
                ? accessUntilLabel
                  ? `Canceled — access continues until ${accessUntilLabel}.`
                  : "Canceled — access continues until the end of your billing period."
                : `Renews or ends ${accessUntilLabel}.`}
            </p>
          )}
          {manageActions.map((action) =>
            action.kind === "instructions" ? (
              <p
                key={action.id}
                className="font-apex-body text-sm text-apex-on-surface-variant"
                data-testid="billing-manage-instructions"
              >
                {action.description}
              </p>
            ) : (
              <p
                key={`${action.id}-desc`}
                className="font-apex-body text-sm text-apex-on-surface-variant"
              >
                {action.description}
              </p>
            ),
          )}
          {isRefreshingSubscription && (
            <p className="font-apex-body text-xs text-apex-on-surface-variant">
              Updating subscription status…
            </p>
          )}
        </div>
      ) : (
        <>
          {showIntervalToggle && (
            <div className="mt-5">
              <BillingIntervalToggle
                interval={billingInterval}
                onIntervalChange={onBillingIntervalChange}
                monthlyAvailable={monthlyToggleAvailable}
                annualAvailable={annualToggleAvailable}
                annualSavingsPercent={annualSavingsPercent}
              />
            </div>
          )}
          <p className="mt-4 font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            {displayPrice}
          </p>
          <p
            aria-hidden={
              !(billingInterval === "ANNUAL" && annualSavingsPercent != null)
            }
            className={cn(
              "mt-1 font-apex-body text-xs text-apex-on-surface-variant",
              !(billingInterval === "ANNUAL" && annualSavingsPercent != null) &&
                "invisible",
            )}
          >
            {`Billed annually · save ${annualSavingsPercent ?? 0}% vs paying monthly`}
          </p>
          {complimentaryAccessKind ? (
            <p
              className="mt-3 font-apex-body text-sm text-apex-on-surface"
              data-testid="billing-complimentary-access-note"
            >
              Your{" "}
              {complimentaryAccessKind === "signup"
                ? "10-day Pro trial"
                : "complimentary Pro access"}{" "}
              is active
              {complimentaryEndsLabel
                ? ` until ${complimentaryEndsLabel}`
                : ""}
              . Subscribe now to keep Pro afterward.
            </p>
          ) : null}
        </>
      )}

      <PlanFeatureList features={features} variant="pro" />

      <div className="mt-6">
        <PricingAlerts message={message} warning={warning} error={error} />
      </div>

      <div className="mt-auto space-y-3 pt-6">
        {isPro ? (
          <>
            {entitlementBillingInterval && (
              <p className="text-center font-apex-body text-xs text-apex-on-surface-variant">
                Billing:{" "}
                {entitlementBillingInterval === "MONTHLY"
                  ? "Monthly"
                  : "Annual"}
              </p>
            )}
            {manageActions.map((action) =>
              action.kind === "instructions" ? null : (
                <Button
                  key={action.id}
                  type="button"
                  data-testid={`billing-manage-${action.id}`}
                  variant="outline"
                  className={cn("w-full", appOutlineButtonClassName)}
                  disabled={isOpeningBillingPortal}
                  onClick={() => onManageSubscription(action)}
                >
                  {isOpeningBillingPortal ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    action.label
                  )}
                </Button>
              ),
            )}
          </>
        ) : !isLoggedIn ? (
          <Button
            type="button"
            className={cn("w-full", appPrimaryButtonClassName)}
            disabled={authLoading}
            onClick={onSignInToSubscribe}
          >
            Sign in to subscribe
          </Button>
        ) : !isBillingEnabled ? (
          <p className="rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container p-3 font-apex-body text-sm text-apex-on-surface-variant">
            Billing is not configured for this environment yet.
          </p>
        ) : eligibilityError ? (
          <div className="space-y-3">
            <p
              className="rounded-apex-sm border border-apex-error/25 bg-apex-error/10 px-3 py-2 font-apex-body text-sm text-apex-error"
              data-testid="billing-eligibility-error"
            >
              {eligibilityError}
            </p>
            {onRetryEligibility && (
              <Button
                type="button"
                variant="outline"
                className={cn("w-full", appOutlineButtonClassName)}
                onClick={onRetryEligibility}
                data-testid="billing-eligibility-retry"
              >
                Retry sync
              </Button>
            )}
          </div>
        ) : offeringsError ? (
          <div className="space-y-3">
            <p
              className="rounded-apex-sm border border-apex-error/25 bg-apex-error/10 px-3 py-2 font-apex-body text-sm text-apex-error"
              data-testid="billing-offerings-error"
            >
              {offeringsError}
            </p>
            {onRetryOfferings && (
              <Button
                type="button"
                variant="outline"
                className={cn("w-full", appOutlineButtonClassName)}
                onClick={onRetryOfferings}
                data-testid="billing-offerings-retry"
              >
                Retry sync
              </Button>
            )}
          </div>
        ) : checkoutBlocked ? (
          <div className="flex items-center justify-center rounded-apex-sm border border-apex-outline-variant/15 py-6">
            <Loader2 className="size-5 animate-spin text-apex-on-surface-variant" />
          </div>
        ) : hasPackages || showCatalogPricing ? (
          <Button
            type="button"
            data-testid="billing-subscribe-pro"
            className={cn("w-full", appPrimaryButtonClassName)}
            disabled={
              authLoading || isPurchasing || (isLoggedIn && !selectedPackage)
            }
            onClick={isLoggedIn ? onSubscribe : onSignInToSubscribe}
          >
            {isPurchasing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isLoggedIn ? (
              isExpiredSubscriber ? (
                "Resubscribe to Pro"
              ) : (
                "Subscribe to Pro"
              )
            ) : (
              "Sign in to subscribe"
            )}
          </Button>
        ) : (
          <p className="rounded-apex-sm border border-apex-outline-variant/15 bg-apex-surface-container p-3 font-apex-body text-sm text-apex-on-surface-variant">
            No active RevenueCat packages are available for this account right
            now.
          </p>
        )}

        {showRestore && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={isPurchasing || isRestoringPurchases}
            onClick={onRestorePurchases}
            data-testid="billing-restore-purchases"
          >
            {isRestoringPurchases ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Restore purchases"
            )}
          </Button>
        )}

        <p className="text-center font-apex-body text-xs text-apex-on-surface-variant">
          {storeDisclosure
            ? storeDisclosure
            : !billingConfig
              ? "Billing configuration is loading."
              : billingConfig.mode === "sandbox"
                ? "Sandbox billing mode is enabled. RevenueCat will use test-mode checkout."
                : "Live billing mode is enabled. RevenueCat will use live checkout."}
        </p>
      </div>
    </div>
  );
}
