import { describe, expect, it, vi } from "vitest";
import { syncNativeBillingIdentityOnce } from "./NativeBillingIdentitySync";
import type { ensureBillingEligibility } from "@/features/billing/billingEligibility";

describe("NativeBillingIdentitySync", () => {
  it("marks the user synced before refreshMe toggles auth loading", async () => {
    const syncedUserIdRef = { current: null as string | null };
    const inFlightUserIdRef = { current: null as string | null };
    let authLoading = false;
    const ensureEligibility = vi.fn(async () => ({
      hasPaidPro: false,
      billingStores: [],
      refresh: {
        success: true,
        entitlement: {
          plan: "FREE" as const,
          status: "INACTIVE",
          billingInterval: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          pastDueSince: null,
          effectivePlan: "FREE" as const,
          cancelAtPeriodEnd: false,
          lastSyncedAt: null,
          hasPaidPro: false,
          billingStores: [],
        },
      },
    }));
    const refreshMe = vi.fn(async () => {
      authLoading = true;
      expect(syncedUserIdRef.current).toBe("user-1");
      authLoading = false;
    });

    const run = () =>
      syncNativeBillingIdentityOnce({
        userId: "user-1",
        email: "driver@example.com",
        syncedUserIdRef,
        inFlightUserIdRef,
        isCancelled: () => false,
        refreshMe,
        ensureEligibility:
          ensureEligibility as typeof ensureBillingEligibility,
      });

    await run();
    await run();

    expect(authLoading).toBe(false);
    expect(syncedUserIdRef.current).toBe("user-1");
    expect(ensureEligibility).toHaveBeenCalledTimes(1);
    expect(refreshMe).toHaveBeenCalledTimes(1);
  });
});
