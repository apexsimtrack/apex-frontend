import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import PageMeta from "@/components/PageMeta";
import { STATIC_SEO } from "@/config/seoMeta";
import { AUTH_PATHS } from "@/config/navigation";
import type { BillingInterval } from "@/lib/api";
import { withRequestId } from "@/lib/api/errors";
import { getBillingPlans } from "@/lib/api";
import { formatCurrentSubscriptionLabel } from "@/features/billing/subscriptionDisplay";
import { useRevenueCat } from "@/features/billing/useRevenueCat";
import {
  computeAnnualSavingsPercent,
  localizedZeroPriceLabel,
  packageForInterval,
  pickDefaultInterval,
  resolvePackagesByInterval,
} from "@/features/billing/packageMapping";
import {
  formatAccessUntilLabel,
  hasExpiredSubscriptionHistory,
  isSubscriptionCanceled,
} from "@/features/billing/subscriptionStatusDisplay";
import {
  complimentaryAccessExpiresAt,
  formatBetaTrialEndsLabel,
  isActiveBetaTrial,
  isActiveSignupTrial,
  isPaidProUser,
} from "@/features/billing/betaTrial";
import type { SubscriptionManageAction } from "@/features/billing/subscriptionManagement";
import { useAuth } from "@/contexts/AuthContext";
import { appPrimaryButtonClassName } from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";
import { FreePlanCard } from "./pricing/FreePlanCard";
import { PricingPageSkeleton } from "./pricing/PricingPageSkeleton";
import { ProPlanCard } from "./pricing/ProPlanCard";

const PRICING_PATH = "/pricing";

export default function Pricing() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>("ANNUAL");
  const [showAgentCta, setShowAgentCta] = useState(false);

  const { data: plans, isPending: plansLoading } = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: getBillingPlans,
  });

  const {
    billingConfig,
    billingPlatform,
    isNative,
    isBillingEnabled,
    availablePackages,
    offeringsQuery,
    offeringsError,
    retryOfferings,
    eligibilityQuery,
    eligibilityError,
    retryEligibility,
    purchasePackage,
    isPurchasing,
    restorePurchases,
    isRestoringPurchases,
    openBillingPortal,
    isOpeningBillingPortal,
    refreshSubscription,
    isRefreshingSubscription,
    hasPaidPro,
    manageActions,
  } = useRevenueCat();

  const onBetaTrial = isActiveBetaTrial(user);
  const onSignupTrial = isActiveSignupTrial(user);
  const complimentaryAccessKind = onBetaTrial
    ? "beta"
    : onSignupTrial
      ? "signup"
      : null;
  const isPaidPro = hasPaidPro || isPaidProUser(user);
  const hasProAccess = user?.hasPro === true || isPaidPro;
  const complimentaryEndsLabel = formatBetaTrialEndsLabel(
    complimentaryAccessExpiresAt(user),
  );
  const currentSubscriptionLabel = formatCurrentSubscriptionLabel(
    user
      ? {
          effectivePlan: user.effectivePlan,
          billingInterval: user.billingInterval ?? null,
        }
      : undefined,
    plans,
  );
  const userBillingInterval = user?.billingInterval ?? null;
  const isCanceled = isSubscriptionCanceled(user);
  const accessUntilLabel = formatAccessUntilLabel(user?.currentPeriodEnd);
  const hasExpiredPro = hasExpiredSubscriptionHistory(user);

  const resolvedPackages = useMemo(
    () => resolvePackagesByInterval(availablePackages, billingPlatform),
    [availablePackages, billingPlatform],
  );

  const annualSavingsPercent = useMemo(
    () => computeAnnualSavingsPercent(plans),
    [plans],
  );

  const selectedPackage = useMemo(
    () => packageForInterval(resolvedPackages, billingInterval),
    [resolvedPackages, billingInterval],
  );

  useEffect(() => {
    if (availablePackages.length === 0) return;
    setBillingInterval((current) => {
      if (packageForInterval(resolvedPackages, current)) return current;
      return pickDefaultInterval(resolvedPackages);
    });
  }, [availablePackages, resolvedPackages]);

  useEffect(() => {
    if (!user?.id) return;

    const syncFromRevenueCat = () => {
      if (document.visibilityState !== "visible") return;
      void refreshSubscription().catch(() => undefined);
    };

    void refreshSubscription().catch(() => undefined);
    window.addEventListener("focus", syncFromRevenueCat);
    document.addEventListener("visibilitychange", syncFromRevenueCat);

    return () => {
      window.removeEventListener("focus", syncFromRevenueCat);
      document.removeEventListener("visibilitychange", syncFromRevenueCat);
    };
  }, [user?.id, refreshSubscription]);

  async function handlePurchase() {
    if (!selectedPackage) return;
    try {
      setError(null);
      setWarning(null);
      setMessage(null);
      const outcome = await purchasePackage(selectedPackage);
      if (outcome.refreshErrorMessage) {
        setMessage("Purchase completed successfully.");
        setWarning(outcome.refreshErrorMessage);
      } else {
        setMessage("Welcome to Apex Pro! Your subscription is active.");
      }
      setShowAgentCta(!isNative);
    } catch (err) {
      setMessage(null);
      setWarning(null);
      setError(
        withRequestId(
          err instanceof Error ? err.message : "Could not subscribe.",
          err,
        ),
      );
    }
  }

  async function handleManageSubscription(action: SubscriptionManageAction) {
    try {
      setMessage(null);
      setWarning(null);
      setError(null);
      await openBillingPortal(action);
    } catch (err) {
      setError(
        withRequestId(
          err instanceof Error
            ? err.message
            : "Could not open subscription settings.",
          err,
        ),
      );
    }
  }

  async function handleRestorePurchases() {
    try {
      setMessage(null);
      setWarning(null);
      setError(null);
      const outcome = await restorePurchases();
      if (outcome.refreshErrorMessage) {
        setMessage("Your store purchases were restored.");
        setWarning(outcome.refreshErrorMessage);
      } else {
        setMessage(
          "Purchases restored. Your subscription status is up to date.",
        );
      }
    } catch (err) {
      setError(
        withRequestId(
          err instanceof Error ? err.message : "Could not restore purchases.",
          err,
        ),
      );
    }
  }

  function handleSignInToSubscribe() {
    if (!user) {
      navigate(`${AUTH_PATHS.login}?next=${encodeURIComponent(PRICING_PATH)}`);
    }
  }

  return (
    <>
      <PageMeta
        title={STATIC_SEO.pricing.title}
        description={STATIC_SEO.pricing.description}
        path={STATIC_SEO.pricing.path}
        jsonLd={STATIC_SEO.pricing.jsonLd}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 py-8">
        <div className="mb-10">
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Choose your plan
          </h1>
          <p className="mt-2 text-sm tracking-wide text-apex-on-surface-variant">
            {isPaidPro
              ? "You already have Pro. Manage your subscription from the store that billed you."
              : hasExpiredPro
                ? `Your Apex Pro subscription expired${
                    accessUntilLabel ? ` on ${accessUntilLabel}` : ""
                  }. Subscribe again to restore Pro access.`
              : complimentaryAccessKind
                ? `You have ${
                    complimentaryAccessKind === "signup"
                      ? "a 10-day Pro trial"
                      : "complimentary full Pro access"
                  }${
                    complimentaryEndsLabel
                      ? ` (ends ${complimentaryEndsLabel})`
                      : ""
                  }. Subscribe anytime to keep Pro afterward.`
                : "Start free. Upgrade to Pro for unlimited history, analytics, and more."}
          </p>
        </div>

        {showAgentCta && message && !error && !isNative && (
          <div className="mb-8 rounded-apex-lg border border-apex-success/30 bg-apex-success/10 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-apex-headline font-medium text-apex-success">
                  {message}
                </p>
                <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
                  Download the Apex Agent and sign in with your website email
                  and password to start automatic telemetry uploads.
                </p>
              </div>
              <Button
                asChild
                className={cn("shrink-0", appPrimaryButtonClassName)}
              >
                <Link to="/agent?welcome=pro">
                  <Cpu className="size-4" />
                  Download Apex Agent
                </Link>
              </Button>
            </div>
          </div>
        )}

        {plansLoading ? (
          <PricingPageSkeleton />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
            <FreePlanCard
              name={plans?.free.name ?? "Free"}
              priceLabel={
                isNative
                  ? localizedZeroPriceLabel(
                      availablePackages,
                      plans?.free.priceLabel ?? "£0",
                    )
                  : (plans?.free.priceLabel ?? "£0")
              }
              features={plans?.free.features ?? []}
              isLoggedIn={Boolean(user)}
              isPro={hasProAccess}
            />
            <ProPlanCard
              features={plans?.pro.features ?? []}
              plans={plans}
              billingConfig={billingConfig}
              isBillingEnabled={isBillingEnabled}
              isNative={isNative}
              billingPlatform={billingPlatform}
              resolvedPackages={resolvedPackages}
              billingInterval={billingInterval}
              onBillingIntervalChange={setBillingInterval}
              selectedPackage={selectedPackage}
              annualSavingsPercent={annualSavingsPercent}
              isPro={isPaidPro}
              isExpiredSubscriber={hasExpiredPro}
              complimentaryAccessKind={complimentaryAccessKind}
              complimentaryEndsLabel={complimentaryEndsLabel}
              isLoggedIn={Boolean(user)}
              authLoading={authLoading}
              offeringsPending={offeringsQuery.isLoading}
              eligibilityPending={
                Boolean(user) &&
                isBillingEnabled &&
                eligibilityQuery.isPending
              }
              eligibilityError={
                Boolean(user) && isBillingEnabled ? eligibilityError : null
              }
              offeringsError={
                Boolean(user) && isBillingEnabled ? offeringsError : null
              }
              onRetryEligibility={() => {
                void retryEligibility();
              }}
              onRetryOfferings={() => {
                void retryOfferings();
              }}
              isPurchasing={isPurchasing}
              isRestoringPurchases={isRestoringPurchases}
              isOpeningBillingPortal={isOpeningBillingPortal}
              isRefreshingSubscription={isRefreshingSubscription}
              currentSubscriptionLabel={currentSubscriptionLabel}
              isCanceled={isCanceled}
              accessUntilLabel={accessUntilLabel}
              entitlementBillingInterval={userBillingInterval}
              manageActions={manageActions}
              message={showAgentCta ? null : message}
              warning={warning}
              error={error}
              onSubscribe={() => void handlePurchase()}
              onRestorePurchases={() => void handleRestorePurchases()}
              onManageSubscription={(action) =>
                void handleManageSubscription(action)
              }
              onSignInToSubscribe={handleSignInToSubscribe}
            />
          </div>
        )}
      </div>
    </>
  );
}
