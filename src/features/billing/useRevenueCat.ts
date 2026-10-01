import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Package as WebRevenueCatPackage,
  Purchases as WebPurchases,
} from "@revenuecat/purchases-js";
import type { PurchasesPackage as NativeRevenueCatPackage } from "@revenuecat/purchases-capacitor";
import { withRequestId } from "@/lib/api/errors";
import { useAuth } from "@/contexts/AuthContext";
import {
  createBillingPortalSession,
  getBillingConfig,
  refreshBillingSubscription,
  type BillingConfigResponse,
} from "@/lib/api";
import { openExternalUrl } from "@/lib/capacitor/openExternalUrl";
import type { BillingPackage } from "./billingPackage";
import {
  currentBillingPlatform,
  nativeRevenueCatApiKey,
} from "./billingPlatform";
import {
  BILLING_OFFERINGS_TIMEOUT_MESSAGE,
  BILLING_REFRESH_TIMEOUT_MESSAGE,
  withBillingTimeout,
} from "./billingTimeout";
import {
  assertPurchaseAllowed,
  clearBillingEligibilityCache,
  ensureBillingEligibility,
} from "./billingEligibility";
import { normalizeBillingStores } from "./billingStore";
import { ensureNativeRevenueCatIdentity } from "./revenueCatNativeIdentity";
import {
  ALREADY_HAVE_PRO_MESSAGE,
  BILLING_SYNC_RETRY_MESSAGE,
  resolveSubscriptionManageActions,
  type SubscriptionManageAction,
} from "./subscriptionManagement";
import { isPaidProUser } from "./betaTrial";

const BILLING_CONFIG_QUERY_KEY = ["billing", "config"] as const;
const BILLING_ELIGIBILITY_QUERY_KEY = ["billing", "eligibility"] as const;

let configuredWebApiKey: string | null = null;
let configuredWebAppUserId: string | null = null;

export type PurchasePackageOutcome = {
  refreshErrorMessage: string | null;
};

function formatRefreshSyncWarning(error: unknown): string {
  const detail =
    error instanceof Error && error.message.trim()
      ? ` ${error.message.trim()}`
      : "";
  return withRequestId(
    "Your purchase completed, but we could not refresh your subscription status yet." +
      `${detail} Access should update shortly after RevenueCat syncs, or after you refresh the page.`,
    error,
  );
}

function webProductDetails(rcPackage: WebRevenueCatPackage): {
  productIdentifier: string;
  priceString: string | null;
  title: string | null;
} {
  const product = rcPackage.webBillingProduct as unknown as
    | Record<string, unknown>
    | undefined;
  const productIdentifier =
    typeof product?.identifier === "string"
      ? product.identifier
      : rcPackage.identifier;
  const priceString =
    typeof product?.priceString === "string"
      ? product.priceString
      : typeof product?.currentPriceString === "string"
        ? product.currentPriceString
        : typeof product?.formattedPrice === "string"
          ? product.formattedPrice
          : null;
  const title =
    typeof product?.displayName === "string"
      ? product.displayName
      : typeof product?.title === "string"
        ? product.title
        : null;
  return { productIdentifier, priceString, title };
}

function normalizeWebPackage(rcPackage: WebRevenueCatPackage): BillingPackage {
  return {
    sdk: "web",
    identifier: rcPackage.identifier,
    ...webProductDetails(rcPackage),
    rawPackage: rcPackage,
  };
}

function normalizeNativePackage(
  rcPackage: NativeRevenueCatPackage,
): BillingPackage {
  return {
    sdk: "native",
    identifier: rcPackage.identifier,
    productIdentifier: rcPackage.product.identifier,
    priceString: rcPackage.product.priceString,
    title: rcPackage.product.title,
    rawPackage: rcPackage,
  };
}

export async function loadNativeOfferings(params: {
  apiKey: string;
  userId: string;
  email?: string | null;
}): Promise<BillingPackage[]> {
  const { purchases } = await ensureNativeRevenueCatIdentity(params);
  const offerings = await withBillingTimeout(
    purchases.getOfferings(),
    BILLING_OFFERINGS_TIMEOUT_MESSAGE,
  );
  return (
    offerings.current?.availablePackages.map(normalizeNativePackage) ?? []
  );
}

export async function purchaseNativeBillingPackage(params: {
  apiKey: string;
  userId: string;
  email?: string | null;
  billingPackage: Extract<BillingPackage, { sdk: "native" }>;
}): Promise<void> {
  const { purchases } = await ensureNativeRevenueCatIdentity(params);
  await purchases.purchasePackage({
    aPackage: params.billingPackage.rawPackage,
  });
}

async function ensureWebRevenueCatReady(params: {
  config: BillingConfigResponse;
  userId: string;
  email?: string | null;
}): Promise<WebPurchases> {
  const { config, userId, email } = params;
  const apiKey = config.revenueCatPublicApiKey;

  if (!config.enabled || !apiKey) {
    throw new Error("Billing is not configured for this environment.");
  }

  const { Purchases, LogLevel } = await import(
    /* webpackChunkName: "revenuecat-web" */ "@revenuecat/purchases-js"
  );

  Purchases.setLogLevel(LogLevel.Silent);

  let purchases: WebPurchases;
  if (!Purchases.isConfigured() || configuredWebApiKey !== apiKey) {
    purchases = Purchases.configure(apiKey, userId);
    configuredWebApiKey = apiKey;
    configuredWebAppUserId = userId;
  } else {
    purchases = Purchases.getSharedInstance();
    if (configuredWebAppUserId !== userId) {
      await purchases.changeUser(userId);
      configuredWebAppUserId = userId;
    }
  }

  if (email) {
    try {
      await purchases.setAttributes({ $email: email });
    } catch {
      // Attribute sync is a best-effort enrichment for support/debugging.
    }
  }

  void purchases.preload().catch(() => undefined);
  return purchases;
}

function useBillingConfigQuery(enabled: boolean) {
  return useQuery({
    queryKey: BILLING_CONFIG_QUERY_KEY,
    queryFn: getBillingConfig,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/** Loads the platform-appropriate RevenueCat SDK only when purchase UI mounts. */
export function useRevenueCat() {
  const { user, refreshUser, refreshMe } = useAuth();
  const queryClient = useQueryClient();
  const billingPlatform = currentBillingPlatform();
  const isNative = billingPlatform !== "web";
  const nativeApiKey = nativeRevenueCatApiKey(billingPlatform);
  const billingConfigQuery = useBillingConfigQuery(true);
  const isBillingEnabled = isNative
    ? Boolean(nativeApiKey)
    : Boolean(
        billingConfigQuery.data?.enabled &&
          billingConfigQuery.data.revenueCatPublicApiKey,
      );

  const hasPaidProFromUser = isPaidProUser(user);
  const billingStoresFromUser = normalizeBillingStores(user?.billingStores);

  const eligibilityQuery = useQuery({
    queryKey: [
      ...BILLING_ELIGIBILITY_QUERY_KEY,
      billingPlatform,
      user?.id ?? null,
    ],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error("Sign in to continue.");
      }
      return ensureBillingEligibility({
        userId: user.id,
        email: user.email ?? null,
        identifyNative: isNative,
        forceRefresh: false,
      });
    },
    enabled: Boolean(user?.id) && isBillingEnabled,
    staleTime: 60 * 1000,
    retry: false,
  });

  const eligibilityReady = eligibilityQuery.isSuccess;
  const eligibilityHasPaidPro =
    eligibilityQuery.data?.hasPaidPro ?? hasPaidProFromUser;
  const eligibilityBillingStores =
    eligibilityQuery.data?.billingStores ?? billingStoresFromUser;

  const offeringsQuery = useQuery({
    queryKey: [
      "billing",
      "revenuecat",
      "offerings",
      billingPlatform,
      user?.id ?? null,
      billingConfigQuery.data?.mode ?? null,
    ],
    queryFn: async (): Promise<BillingPackage[]> => {
      if (isNative) {
        return loadNativeOfferings({
          apiKey: nativeApiKey as string,
          userId: user?.id as string,
          email: user?.email ?? null,
        });
      }

      const purchases = await ensureWebRevenueCatReady({
        config: billingConfigQuery.data as BillingConfigResponse,
        userId: user?.id as string,
        email: user?.email ?? null,
      });
      const offerings = await withBillingTimeout(
        purchases.getOfferings(),
        BILLING_OFFERINGS_TIMEOUT_MESSAGE,
      );
      return (
        offerings.current?.availablePackages.map(normalizeWebPackage) ?? []
      );
    },
    // Wait for identity + refresh preflight before loading checkout packages.
    enabled:
      Boolean(user?.id) &&
      isBillingEnabled &&
      eligibilityReady &&
      !eligibilityHasPaidPro,
    staleTime: 60 * 1000,
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () =>
      withBillingTimeout(
        refreshBillingSubscription(),
        BILLING_REFRESH_TIMEOUT_MESSAGE,
      ),
    onSuccess: async () => {
      await refreshUser();
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });

  async function refreshAfterStoreAction(): Promise<PurchasePackageOutcome> {
    try {
      await refreshMutation.mutateAsync();
      return { refreshErrorMessage: null };
    } catch (error) {
      return { refreshErrorMessage: formatRefreshSyncWarning(error) };
    }
  }

  async function runMandatoryPurchasePreflight(): Promise<void> {
    if (!user?.id) {
      throw new Error("Sign in to subscribe.");
    }
    const eligibility = await ensureBillingEligibility({
      userId: user.id,
      email: user.email ?? null,
      identifyNative: isNative,
      forceRefresh: true,
    });
    await queryClient.invalidateQueries({
      queryKey: BILLING_ELIGIBILITY_QUERY_KEY,
    });
    await refreshMe().catch(() => undefined);
    assertPurchaseAllowed(eligibility);
  }

  const purchaseMutation = useMutation({
    mutationFn: async (
      rcPackage: BillingPackage,
    ): Promise<PurchasePackageOutcome> => {
      await runMandatoryPurchasePreflight();

      if (rcPackage.sdk === "native") {
        await purchaseNativeBillingPackage({
          apiKey: nativeApiKey as string,
          userId: user?.id as string,
          email: user?.email ?? null,
          billingPackage: rcPackage,
        });
      } else {
        const purchases = await ensureWebRevenueCatReady({
          config: billingConfigQuery.data as BillingConfigResponse,
          userId: user?.id as string,
          email: user?.email ?? null,
        });
        await purchases.purchasePackage(
          rcPackage.rawPackage,
          user?.email ?? undefined,
        );
      }

      return refreshAfterStoreAction();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (): Promise<PurchasePackageOutcome> => {
      if (!isNative || !nativeApiKey || !user?.id) {
        throw new Error(
          "Restore purchases is only available in the mobile app.",
        );
      }
      // Restore stays independent of purchase eligibility preflight.
      const { purchases } = await ensureNativeRevenueCatIdentity({
        apiKey: nativeApiKey,
        userId: user.id,
        email: user.email ?? null,
      });
      await purchases.restorePurchases();
      return refreshAfterStoreAction();
    },
  });

  const manageActions = resolveSubscriptionManageActions(
    eligibilityBillingStores,
    { hasPaidPro: eligibilityHasPaidPro },
  );

  const portalMutation = useMutation({
    mutationFn: async (action?: SubscriptionManageAction) => {
      const target =
        action ??
        (manageActions.length === 1 ? manageActions[0] : undefined);

      if (!target) {
        throw new Error(
          manageActions.some((a) => a.kind === "instructions")
            ? manageActions.find((a) => a.kind === "instructions")!.description
            : "Choose a billing source to manage your subscription.",
        );
      }

      if (target.kind === "instructions") {
        throw new Error(target.description);
      }

      if (target.kind === "external_url") {
        await openExternalUrl(target.url);
        return target.url;
      }

      const { url } = await createBillingPortalSession();
      await openExternalUrl(url);
      return url;
    },
  });

  async function retryEligibility(): Promise<void> {
    clearBillingEligibilityCache();
    await queryClient.invalidateQueries({
      queryKey: BILLING_ELIGIBILITY_QUERY_KEY,
    });
    await eligibilityQuery.refetch();
  }

  async function retryOfferings(): Promise<void> {
    await offeringsQuery.refetch();
  }

  return {
    billingConfig: billingConfigQuery.data ?? null,
    billingConfigQuery,
    billingPlatform,
    isNative,
    isBillingEnabled,
    eligibilityQuery,
    eligibilityReady,
    eligibilityError:
      eligibilityQuery.error instanceof Error
        ? withRequestId(eligibilityQuery.error.message, eligibilityQuery.error)
        : eligibilityQuery.isError
          ? withRequestId(BILLING_SYNC_RETRY_MESSAGE, eligibilityQuery.error)
          : null,
    retryEligibility,
    hasPaidPro: eligibilityHasPaidPro,
    billingStores: eligibilityBillingStores,
    manageActions,
    alreadyHaveProMessage: ALREADY_HAVE_PRO_MESSAGE,
    offeringsQuery,
    offeringsError:
      offeringsQuery.error instanceof Error
        ? withRequestId(offeringsQuery.error.message, offeringsQuery.error)
        : offeringsQuery.isError
          ? withRequestId(BILLING_OFFERINGS_TIMEOUT_MESSAGE, offeringsQuery.error)
          : null,
    retryOfferings,
    availablePackages: offeringsQuery.data ?? [],
    purchasePackage: purchaseMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    purchaseError: purchaseMutation.error,
    restorePurchases: restoreMutation.mutateAsync,
    isRestoringPurchases: restoreMutation.isPending,
    restoreError: restoreMutation.error,
    refreshSubscription: refreshMutation.mutateAsync,
    isRefreshingSubscription: refreshMutation.isPending,
    openBillingPortal: portalMutation.mutateAsync,
    isOpeningBillingPortal: portalMutation.isPending,
    portalError: portalMutation.error,
  };
}
