import {
  refreshBillingSubscription,
  type BillingRefreshResponse,
} from "@/lib/api/activityBilling";
import type { BillingStore } from "./billingStore";
import {
  entitlementHasPaidPro,
  normalizeBillingStores,
} from "./billingStore";
import {
  ALREADY_HAVE_PRO_MESSAGE,
  BILLING_SYNC_RETRY_MESSAGE,
} from "./subscriptionManagement";
import { ApiError } from "@/lib/api/errors";
import { ensureNativeRevenueCatIdentity } from "./revenueCatNativeIdentity";
import {
  currentBillingPlatform,
  nativeRevenueCatApiKey,
} from "./billingPlatform";
import {
  BILLING_REFRESH_TIMEOUT_MESSAGE,
  withBillingTimeout,
} from "./billingTimeout";

export type BillingEligibilityResult = {
  hasPaidPro: boolean;
  billingStores: BillingStore[];
  refresh: BillingRefreshResponse;
};

type EnsureBillingEligibilityParams = {
  userId: string;
  email?: string | null;
  /** Re-run refresh even if this user already completed a soft preflight. */
  forceRefresh?: boolean;
  /** Start native RC identity without blocking the API eligibility refresh. */
  identifyNative?: boolean;
  refreshFn?: () => Promise<BillingRefreshResponse>;
  identifyNativeFn?: (params: {
    userId: string;
    email?: string | null;
  }) => Promise<unknown>;
};

let softCache: {
  userId: string;
  result: BillingEligibilityResult;
} | null = null;
const inFlightByUser = new Map<
  string,
  Promise<BillingEligibilityResult>
>();

export function resetBillingEligibilityForTests(): void {
  softCache = null;
  inFlightByUser.clear();
}

export function clearBillingEligibilityCache(): void {
  softCache = null;
}

export function getCachedBillingEligibility(
  userId: string,
): BillingEligibilityResult | null {
  if (softCache?.userId === userId) return softCache.result;
  return null;
}

function mapRefreshToEligibility(
  refresh: BillingRefreshResponse,
): BillingEligibilityResult {
  return {
    hasPaidPro: entitlementHasPaidPro(refresh.entitlement),
    billingStores: normalizeBillingStores(refresh.entitlement.billingStores),
    refresh,
  };
}

/**
 * Start native identity in the background, then POST /api/billing/refresh.
 * Store identity failures must not prevent server-backed eligibility.
 * Soft results are cached per user; `forceRefresh` always hits the API (purchase guard).
 */
export async function ensureBillingEligibility(
  params: EnsureBillingEligibilityParams,
): Promise<BillingEligibilityResult> {
  const forceRefresh = params.forceRefresh === true;
  const identifyNative = params.identifyNative === true;

  const existing = inFlightByUser.get(params.userId);
  if (existing) {
    return existing;
  }

  if (!forceRefresh && softCache?.userId === params.userId) {
    return softCache.result;
  }

  const promise = (async (): Promise<BillingEligibilityResult> => {
    try {
      if (identifyNative) {
        try {
          const identityPromise = params.identifyNativeFn
            ? params.identifyNativeFn({
                userId: params.userId,
                email: params.email ?? null,
              })
            : (() => {
                const platform = currentBillingPlatform();
                const apiKey = nativeRevenueCatApiKey(platform);
                if (platform === "web" || !apiKey) return null;
                return ensureNativeRevenueCatIdentity({
                  userId: params.userId,
                  email: params.email ?? null,
                });
              })();
          if (identityPromise) {
            void identityPromise.catch(() => undefined);
          }
        } catch {
          // Eligibility comes from the API; store identity is required later
          // by offerings, purchase, and restore, where failures are surfaced.
        }
      }

      const refreshFn = params.refreshFn ?? refreshBillingSubscription;
      const refresh = await withBillingTimeout(
        refreshFn(),
        BILLING_REFRESH_TIMEOUT_MESSAGE,
      );
      const result = mapRefreshToEligibility(refresh);
      softCache = { userId: params.userId, result };
      return result;
    } catch (error) {
      const detail =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "";
      const message =
        detail && detail !== BILLING_SYNC_RETRY_MESSAGE
          ? `${BILLING_SYNC_RETRY_MESSAGE} (${detail})`
          : BILLING_SYNC_RETRY_MESSAGE;
      if (error instanceof ApiError && error.requestId) {
        throw new ApiError(
          error.status,
          message,
          error.code,
          error.retryAfterMs,
          error.requestId,
        );
      }
      throw new Error(message);
    }
  })();

  inFlightByUser.set(params.userId, promise);
  try {
    return await promise;
  } finally {
    if (inFlightByUser.get(params.userId) === promise) {
      inFlightByUser.delete(params.userId);
    }
  }
}

export function assertPurchaseAllowed(
  eligibility: Pick<BillingEligibilityResult, "hasPaidPro">,
): void {
  if (eligibility.hasPaidPro) {
    throw new Error(ALREADY_HAVE_PRO_MESSAGE);
  }
}
