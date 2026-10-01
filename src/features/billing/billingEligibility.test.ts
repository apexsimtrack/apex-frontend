import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPurchaseAllowed,
  clearBillingEligibilityCache,
  ensureBillingEligibility,
  resetBillingEligibilityForTests,
} from "./billingEligibility";
import type { BillingRefreshResponse } from "@/lib/api/activityBilling";
import { ApiError, withRequestId } from "@/lib/api/errors";
import {
  BILLING_OPERATION_TIMEOUT_MS,
  NATIVE_BILLING_IDENTITY_TIMEOUT_MESSAGE,
} from "./billingTimeout";

function refreshResponse(
  overrides: Partial<BillingRefreshResponse["entitlement"]> = {},
): BillingRefreshResponse {
  return {
    success: true,
    entitlement: {
      plan: "PRO",
      status: "ACTIVE",
      billingInterval: "MONTHLY",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      pastDueSince: null,
      effectivePlan: "PRO",
      cancelAtPeriodEnd: false,
      lastSyncedAt: null,
      hasPaidPro: false,
      billingStores: [],
      ...overrides,
    },
  };
}

describe("ensureBillingEligibility", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetBillingEligibilityForTests();
  });

  it("does not block a successful refresh on hung native identity", async () => {
    let releaseIdentify!: () => void;
    const identifyNativeFn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseIdentify = resolve;
        }),
    );
    const refreshFn = vi.fn(async () => {
      return refreshResponse({
        hasPaidPro: true,
        billingStores: ["STRIPE"],
      });
    });

    const result = await ensureBillingEligibility({
      userId: "user-1",
      identifyNative: true,
      forceRefresh: true,
      identifyNativeFn,
      refreshFn,
    });

    expect(identifyNativeFn).toHaveBeenCalledWith({
      userId: "user-1",
      email: null,
    });
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(result.hasPaidPro).toBe(true);
    expect(result.billingStores).toEqual(["STRIPE"]);
    releaseIdentify();
  });

  it("does not surface a native identity timeout as eligibility failure", async () => {
    const result = await ensureBillingEligibility({
      userId: "user-identity-timeout",
      identifyNative: true,
      forceRefresh: true,
      identifyNativeFn: async () => {
        throw new Error(NATIVE_BILLING_IDENTITY_TIMEOUT_MESSAGE);
      },
      refreshFn: async () => refreshResponse({ hasPaidPro: false }),
    });

    expect(result.hasPaidPro).toBe(false);
  });

  it("caches soft eligibility and forceRefresh revalidates", async () => {
    const refreshFn = vi
      .fn()
      .mockResolvedValueOnce(
        refreshResponse({ hasPaidPro: false, billingStores: [] }),
      )
      .mockResolvedValueOnce(
        refreshResponse({
          hasPaidPro: true,
          billingStores: ["APP_STORE"],
        }),
      );

    const first = await ensureBillingEligibility({
      userId: "user-2",
      forceRefresh: false,
      refreshFn,
    });
    const cached = await ensureBillingEligibility({
      userId: "user-2",
      forceRefresh: false,
      refreshFn,
    });
    const forced = await ensureBillingEligibility({
      userId: "user-2",
      forceRefresh: true,
      refreshFn,
    });

    expect(first.hasPaidPro).toBe(false);
    expect(cached.hasPaidPro).toBe(false);
    expect(forced.hasPaidPro).toBe(true);
    expect(forced.billingStores).toEqual(["APP_STORE"]);
    expect(refreshFn).toHaveBeenCalledTimes(2);
  });

  it("shares one native identify for concurrent soft and forced calls", async () => {
    let releaseIdentify!: () => void;
    const identifyNativeFn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseIdentify = resolve;
        }),
    );
    const refreshFn = vi.fn(async () =>
      refreshResponse({ hasPaidPro: false }),
    );

    const forced = ensureBillingEligibility({
      userId: "user-concurrent",
      identifyNative: true,
      forceRefresh: true,
      identifyNativeFn,
      refreshFn,
    });
    const soft = ensureBillingEligibility({
      userId: "user-concurrent",
      identifyNative: true,
      forceRefresh: false,
      identifyNativeFn,
      refreshFn,
    });

    expect(identifyNativeFn).toHaveBeenCalledTimes(1);
    const [forcedResult, softResult] = await Promise.all([forced, soft]);
    expect(forcedResult).toEqual(softResult);
    expect(identifyNativeFn).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    releaseIdentify();
  });

  it("rejects a hung eligibility refresh with the retry message", async () => {
    vi.useFakeTimers();
    const pending = ensureBillingEligibility({
      userId: "user-timeout",
      forceRefresh: true,
      refreshFn: () => new Promise<BillingRefreshResponse>(() => undefined),
    });
    const rejection = expect(pending).rejects.toThrow(
      /Could not verify your subscription status.*timed out/i,
    );

    await vi.advanceTimersByTimeAsync(BILLING_OPERATION_TIMEOUT_MS);
    await rejection;
  });

  it("fails closed with a retryable sync error when refresh fails", async () => {
    clearBillingEligibilityCache();
    await expect(
      ensureBillingEligibility({
        userId: "user-3",
        forceRefresh: true,
        refreshFn: async () => {
          throw new Error("network down");
        },
      }),
    ).rejects.toThrow(/Could not verify your subscription status/);
  });

  it("keeps the API request id on the eligibility message the Pricing card shows", async () => {
    clearBillingEligibilityCache();
    const failure = new ApiError(
      503,
      "upstream down",
      undefined,
      undefined,
      "aabbccddeeff0011",
    );
    let thrown: unknown;
    try {
      await ensureBillingEligibility({
        userId: "user-request-id",
        forceRefresh: true,
        refreshFn: async () => {
          throw failure;
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(
      withRequestId(thrown instanceof Error ? thrown.message : "", thrown),
    ).toBe(
      "Could not verify your subscription status. Check your connection and try again. (upstream down) (Request ID: aabbccddeeff0011)",
    );
  });

  it("assertPurchaseAllowed blocks paid Pro before store purchase", () => {
    expect(() => assertPurchaseAllowed({ hasPaidPro: true })).toThrow(
      "You already have Pro",
    );
    expect(() => assertPurchaseAllowed({ hasPaidPro: false })).not.toThrow();
  });
});
