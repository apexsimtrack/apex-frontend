import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingPackage } from "./billingPackage";

const identityMock = vi.hoisted(() => vi.fn());

vi.mock("./revenueCatNativeIdentity", () => ({
  ensureNativeRevenueCatIdentity: identityMock,
}));

import {
  loadNativeOfferings,
  purchaseNativeBillingPackage,
} from "./useRevenueCat";

describe("native RevenueCat store operations", () => {
  const getOfferings = vi.fn();
  const purchasePackage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          {
            identifier: "$rc_annual",
            product: {
              identifier: "apex_pro_annual:annual",
              priceString: "£49.99",
              title: "Apex Pro Annual",
            },
          },
        ],
      },
    });
    purchasePackage.mockResolvedValue({ customerInfo: {} });
    identityMock.mockResolvedValue({
      purchases: { getOfferings, purchasePackage },
    });
  });

  it("requires native identity before loading offerings", async () => {
    const packages = await loadNativeOfferings({
      apiKey: "play-key",
      userId: "user-1",
      email: "driver@example.com",
    });

    expect(identityMock).toHaveBeenCalledWith({
      apiKey: "play-key",
      userId: "user-1",
      email: "driver@example.com",
    });
    expect(getOfferings).toHaveBeenCalledTimes(1);
    expect(packages[0]?.productIdentifier).toBe(
      "apex_pro_annual:annual",
    );
  });

  it("requires native identity before purchasing a package", async () => {
    const billingPackage = {
      sdk: "native",
      identifier: "$rc_annual",
      productIdentifier: "apex_pro_annual:annual",
      priceString: "£49.99",
      title: "Apex Pro Annual",
      rawPackage: { identifier: "$rc_annual" },
    } as BillingPackage;

    await purchaseNativeBillingPackage({
      apiKey: "play-key",
      userId: "user-1",
      email: null,
      billingPackage: billingPackage as Extract<
        BillingPackage,
        { sdk: "native" }
      >,
    });

    expect(identityMock).toHaveBeenCalledTimes(1);
    expect(purchasePackage).toHaveBeenCalledWith({
      aPackage: billingPackage.rawPackage,
    });
  });
});
