import { describe, expect, it } from "vitest";
import {
  computeAnnualSavingsPercent,
  isAnnualPackage,
  isMonthlyPackage,
  pickDefaultInterval,
  resolvePackagesByInterval,
} from "./packageMapping";
import type { BillingPlansResponse } from "@/lib/api/activityBilling";
import type { BillingPackage } from "./billingPackage";
import {
  APPLE_PRO_ANNUAL,
  APPLE_PRO_MONTHLY,
  PLAY_PRO_ANNUAL,
  PLAY_PRO_MONTHLY,
} from "./storeProductIds";

function mockPackage(
  identifier: string,
  productIdentifier = identifier,
  sdk: BillingPackage["sdk"] = "web",
): BillingPackage {
  return {
    sdk,
    identifier,
    productIdentifier,
    priceString: null,
    title: null,
    rawPackage: {},
  } as BillingPackage;
}

const samplePlans: BillingPlansResponse = {
  free: { id: "free", name: "Free", priceLabel: "£0", features: [] },
  pro: {
    monthly: {
      interval: "MONTHLY",
      name: "Pro Monthly",
      priceGbp: 5.99,
      priceLabel: "£5.99/month",
    },
    annual: {
      interval: "ANNUAL",
      name: "Pro Annual",
      priceGbp: 49.99,
      priceLabel: "£49.99/year",
    },
    features: [],
  },
};

describe("packageMapping", () => {
  it("classifies RevenueCat package identifiers", () => {
    expect(isMonthlyPackage(mockPackage("$rc_monthly"))).toBe(true);
    expect(isAnnualPackage(mockPackage("$rc_annual"))).toBe(true);
    expect(isMonthlyPackage(mockPackage(APPLE_PRO_MONTHLY))).toBe(true);
    expect(isAnnualPackage(mockPackage(APPLE_PRO_ANNUAL))).toBe(true);
  });

  it("resolvePackagesByInterval maps monthly and annual", () => {
    const resolved = resolvePackagesByInterval([
      mockPackage("$rc_annual"),
      mockPackage("$rc_monthly"),
    ]);
    expect(resolved.monthly?.identifier).toBe("$rc_monthly");
    expect(resolved.annual?.identifier).toBe("$rc_annual");
  });

  it("uses exact platform product IDs for native offerings", () => {
    const packages = [
      mockPackage("$rc_monthly", APPLE_PRO_MONTHLY, "native"),
      mockPackage("$rc_monthly", PLAY_PRO_MONTHLY, "native"),
      mockPackage("$rc_annual", "apex_pro_annual", "native"),
      mockPackage("$rc_annual", APPLE_PRO_ANNUAL, "native"),
      mockPackage("$rc_annual", PLAY_PRO_ANNUAL, "native"),
    ];

    const apple = resolvePackagesByInterval(packages, "apple");
    expect(apple.monthly?.productIdentifier).toBe(APPLE_PRO_MONTHLY);
    expect(apple.annual?.productIdentifier).toBe(APPLE_PRO_ANNUAL);
    expect(
      resolvePackagesByInterval(
        [mockPackage("$rc_annual", "apex_pro_annual", "native")],
        "apple",
      ).annual,
    ).toBeNull();

    const play = resolvePackagesByInterval(packages, "play");
    expect(play.monthly?.productIdentifier).toBe(PLAY_PRO_MONTHLY);
    expect(play.annual?.productIdentifier).toBe(PLAY_PRO_ANNUAL);
    expect(
      resolvePackagesByInterval(
        [mockPackage("$rc_monthly", APPLE_PRO_MONTHLY, "native")],
        "play",
      ).monthly,
    ).toBeNull();
  });

  it("maps Play subscription IDs with base-plan suffixes", () => {
    const monthly = mockPackage(
      "$rc_monthly",
      `${PLAY_PRO_MONTHLY}:monthly`,
      "native",
    );
    const annual = mockPackage(
      "$rc_annual",
      `${PLAY_PRO_ANNUAL}:annual`,
      "native",
    );
    const appleAnnual = mockPackage(
      "$rc_annual",
      APPLE_PRO_ANNUAL,
      "native",
    );

    const resolved = resolvePackagesByInterval(
      [appleAnnual, monthly, annual],
      "play",
    );
    expect(resolved.monthly).toBe(monthly);
    expect(resolved.annual).toBe(annual);
  });

  it("keeps Apple product matching exact", () => {
    const appleAnnual = mockPackage(
      "$rc_annual",
      APPLE_PRO_ANNUAL,
      "native",
    );
    expect(
      resolvePackagesByInterval([appleAnnual], "apple").annual,
    ).toBe(appleAnnual);
    expect(
      resolvePackagesByInterval(
        [
          mockPackage(
            "$rc_annual",
            `${APPLE_PRO_ANNUAL}:annual`,
            "native",
          ),
          mockPackage("$rc_annual", PLAY_PRO_ANNUAL, "native"),
        ],
        "apple",
      ).annual,
    ).toBeNull();
    expect(
      resolvePackagesByInterval([appleAnnual], "play").annual,
    ).toBeNull();
  });

  it("pickDefaultInterval prefers annual when available", () => {
    expect(
      pickDefaultInterval({
        monthly: mockPackage("$rc_monthly"),
        annual: mockPackage("$rc_annual"),
      }),
    ).toBe("ANNUAL");
    expect(
      pickDefaultInterval({
        monthly: mockPackage("$rc_monthly"),
        annual: null,
      }),
    ).toBe("MONTHLY");
  });

  it("computeAnnualSavingsPercent from catalog prices", () => {
    const pct = computeAnnualSavingsPercent(samplePlans);
    expect(pct).toBeGreaterThan(25);
    expect(pct).toBeLessThan(35);
  });

  it("computeAnnualSavingsPercent returns null when annual is not cheaper", () => {
    const expensiveAnnual: BillingPlansResponse = {
      ...samplePlans,
      pro: {
        ...samplePlans.pro,
        annual: { ...samplePlans.pro.annual, priceGbp: 100 },
      },
    };
    expect(computeAnnualSavingsPercent(expensiveAnnual)).toBeNull();
  });
});
