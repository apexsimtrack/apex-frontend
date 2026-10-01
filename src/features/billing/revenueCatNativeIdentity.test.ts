import { beforeEach, describe, expect, it, vi } from "vitest";

const purchasesMocks = vi.hoisted(() => ({
  configure: vi.fn(),
  getAppUserID: vi.fn(),
  isConfigured: vi.fn(),
  logIn: vi.fn(),
  setEmail: vi.fn(),
  setLogLevel: vi.fn(),
  then: vi.fn(),
}));

vi.mock("./billingPlatform", () => ({
  currentBillingPlatform: () => "play",
  nativeRevenueCatApiKey: () => "play-api-key",
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  LOG_LEVEL: { ERROR: "ERROR" },
  Purchases: purchasesMocks,
}));

import {
  ensureNativeRevenueCatIdentity,
  resetNativeRevenueCatIdentityForTests,
} from "./revenueCatNativeIdentity";

describe("ensureNativeRevenueCatIdentity", () => {
  let configured = false;

  beforeEach(() => {
    configured = false;
    resetNativeRevenueCatIdentityForTests();
    vi.clearAllMocks();
    purchasesMocks.isConfigured.mockImplementation(async () => ({
      isConfigured: configured,
    }));
    purchasesMocks.configure.mockImplementation(async () => {
      configured = true;
    });
    purchasesMocks.getAppUserID.mockResolvedValue({ appUserID: "user-1" });
    purchasesMocks.logIn.mockResolvedValue({
      customerInfo: {},
      created: false,
    });
    purchasesMocks.setEmail.mockResolvedValue(undefined);
    purchasesMocks.setLogLevel.mockResolvedValue(undefined);
    purchasesMocks.then.mockImplementation(() => {
      throw new Error("Purchases.then should not be called");
    });
  });

  it("shares one configure operation between concurrent callers", async () => {
    let releaseConfigure!: () => void;
    purchasesMocks.configure.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseConfigure = () => {
            configured = true;
            resolve();
          };
        }),
    );

    const first = ensureNativeRevenueCatIdentity({
      apiKey: "play-api-key",
      userId: "user-1",
    });
    const second = ensureNativeRevenueCatIdentity({
      apiKey: "play-api-key",
      userId: "user-1",
    });

    await vi.waitFor(() => {
      expect(purchasesMocks.configure).toHaveBeenCalledTimes(1);
    });
    releaseConfigure();

    const [firstIdentity, secondIdentity] = await Promise.all([first, second]);
    expect(firstIdentity).toBe(secondIdentity);
    expect(firstIdentity.purchases).toBe(purchasesMocks);
    expect(purchasesMocks.then).not.toHaveBeenCalled();
    expect(purchasesMocks.isConfigured).toHaveBeenCalledTimes(1);
    expect(purchasesMocks.configure).toHaveBeenCalledTimes(1);
  });

  it("keeps the hard error for a different native app key", async () => {
    await ensureNativeRevenueCatIdentity({
      apiKey: "play-api-key",
      userId: "user-1",
    });

    await expect(
      ensureNativeRevenueCatIdentity({
        apiKey: "different-api-key",
        userId: "user-1",
      }),
    ).rejects.toThrow(
      "RevenueCat was already configured with a different native app key.",
    );
    expect(purchasesMocks.configure).toHaveBeenCalledTimes(1);
  });
});
