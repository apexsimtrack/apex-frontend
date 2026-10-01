import {
  currentBillingPlatform,
  nativeRevenueCatApiKey,
} from "./billingPlatform";
import {
  NATIVE_BILLING_IDENTITY_TIMEOUT_MESSAGE,
  withBillingTimeout,
} from "./billingTimeout";

let configuredNativeApiKey: string | null = null;
let configuredNativeAppUserId: string | null = null;
type NativePurchases =
  typeof import("@revenuecat/purchases-capacitor").Purchases;
type NativeIdentityResult = { purchases: NativePurchases };
let nativeIdentityQueue: Promise<void> = Promise.resolve();
const nativeIdentityInFlight = new Map<
  string,
  Promise<NativeIdentityResult>
>();

export function resetNativeRevenueCatIdentityForTests(): void {
  configuredNativeApiKey = null;
  configuredNativeAppUserId = null;
  nativeIdentityQueue = Promise.resolve();
  nativeIdentityInFlight.clear();
}

export function getConfiguredNativeRevenueCatUserId(): string | null {
  return configuredNativeAppUserId;
}

/**
 * Configure / log in native RevenueCat with Apex `user.id`.
 * Safe to call from Pricing and the global native identity sync.
 */
export async function ensureNativeRevenueCatIdentity(params: {
  userId: string;
  email?: string | null;
  apiKey?: string | null;
}): Promise<NativeIdentityResult> {
  const platform = currentBillingPlatform();
  const apiKey = params.apiKey ?? nativeRevenueCatApiKey(platform);
  if (!apiKey) {
    throw new Error("Native RevenueCat is not configured for this build.");
  }
  if (platform === "web") {
    throw new Error("Native RevenueCat identity is only available on iOS/Android.");
  }

  const identityKey = `${apiKey}\u0000${params.userId}`;
  const existing = nativeIdentityInFlight.get(identityKey);
  if (existing) {
    return withBillingTimeout(
      existing,
      NATIVE_BILLING_IDENTITY_TIMEOUT_MESSAGE,
    );
  }

  const operation = nativeIdentityQueue.then(
    async (): Promise<NativeIdentityResult> => {
      const { Purchases, LOG_LEVEL } = await import(
        /* webpackChunkName: "revenuecat-native" */ "@revenuecat/purchases-capacitor"
      );
      await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });

      const { isConfigured } = await Purchases.isConfigured();
      if (!isConfigured) {
        await Purchases.configure({ apiKey, appUserID: params.userId });
        configuredNativeApiKey = apiKey;
        configuredNativeAppUserId = params.userId;
      } else {
        if (configuredNativeApiKey && configuredNativeApiKey !== apiKey) {
          throw new Error(
            "RevenueCat was already configured with a different native app key.",
          );
        }
        configuredNativeApiKey = apiKey;
        const { appUserID } = await Purchases.getAppUserID();
        if (appUserID !== params.userId) {
          await Purchases.logIn({ appUserID: params.userId });
        }
        configuredNativeAppUserId = params.userId;
      }

      if (params.email) {
        try {
          await Purchases.setEmail({ email: params.email });
        } catch {
          // Attribute sync is a best-effort enrichment for support/debugging.
        }
      }

      // Capacitor plugin proxies expose a native `then` method. Wrapping the
      // proxy prevents Promise resolution from invoking Purchases.then().
      return { purchases: Purchases };
    },
  );

  nativeIdentityInFlight.set(identityKey, operation);
  nativeIdentityQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  void operation.then(
    () => {
      if (nativeIdentityInFlight.get(identityKey) === operation) {
        nativeIdentityInFlight.delete(identityKey);
      }
    },
    () => {
      if (nativeIdentityInFlight.get(identityKey) === operation) {
        nativeIdentityInFlight.delete(identityKey);
      }
    },
  );

  return withBillingTimeout(
    operation,
    NATIVE_BILLING_IDENTITY_TIMEOUT_MESSAGE,
  );
}
