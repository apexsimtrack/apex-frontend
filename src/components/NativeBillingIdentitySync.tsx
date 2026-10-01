import { useEffect, useRef, type MutableRefObject } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";
import { ensureBillingEligibility } from "@/features/billing/billingEligibility";
import {
  currentBillingPlatform,
  nativeRevenueCatApiKey,
} from "@/features/billing/billingPlatform";

/**
 * Native-only: after auth resolves, start RevenueCat identity and refresh
 * server-backed billing eligibility without blocking on the store connection.
 * Then refresh /api/auth/me.
 * Runs once per authenticated user id (no refresh loops).
 */
export async function syncNativeBillingIdentityOnce(params: {
  userId: string;
  email?: string | null;
  syncedUserIdRef: MutableRefObject<string | null>;
  inFlightUserIdRef: MutableRefObject<string | null>;
  isCancelled: () => boolean;
  refreshMe: () => Promise<void>;
  ensureEligibility?: typeof ensureBillingEligibility;
}): Promise<void> {
  const {
    userId,
    email,
    syncedUserIdRef,
    inFlightUserIdRef,
    isCancelled,
    refreshMe,
    ensureEligibility = ensureBillingEligibility,
  } = params;

  if (
    syncedUserIdRef.current === userId ||
    inFlightUserIdRef.current === userId
  ) {
    return;
  }

  inFlightUserIdRef.current = userId;
  try {
    await ensureEligibility({
      userId,
      email: email ?? null,
      identifyNative: true,
      forceRefresh: true,
    });
    if (isCancelled()) return;

    // Mark this user before refreshMe toggles auth query state. Otherwise the
    // effect cleanup can cancel the run and immediately restart it.
    syncedUserIdRef.current = userId;
    await refreshMe();
  } catch {
    if (!isCancelled() && syncedUserIdRef.current !== userId) {
      syncedUserIdRef.current = null;
    }
  } finally {
    if (inFlightUserIdRef.current === userId) {
      inFlightUserIdRef.current = null;
    }
  }
}

export default function NativeBillingIdentitySync() {
  const { user, refreshMe } = useAuth();
  const syncedUserIdRef = useRef<string | null>(null);
  const inFlightUserIdRef = useRef<string | null>(null);
  const refreshMeRef = useRef(refreshMe);
  const userEmailRef = useRef(user?.email ?? null);

  useEffect(() => {
    refreshMeRef.current = refreshMe;
  }, [refreshMe]);

  useEffect(() => {
    userEmailRef.current = user?.email ?? null;
  }, [user?.email]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!user?.id) {
      syncedUserIdRef.current = null;
      inFlightUserIdRef.current = null;
      return;
    }

    const userId = user.id;
    const platform = currentBillingPlatform();
    const apiKey = nativeRevenueCatApiKey(platform);
    if (!apiKey) return;

    let cancelled = false;
    void syncNativeBillingIdentityOnce({
      userId,
      email: userEmailRef.current,
      syncedUserIdRef,
      inFlightUserIdRef,
      isCancelled: () => cancelled,
      refreshMe: () => refreshMeRef.current(),
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return null;
}
