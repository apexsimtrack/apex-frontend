import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BillingPackage } from "@/features/billing/billingPackage";
import type { BillingPlansResponse } from "@/lib/api/activityBilling";
import { ProPlanCard } from "./ProPlanCard";

const plans: BillingPlansResponse = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "£0",
    features: [],
  },
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
    features: ["Unlimited history"],
  },
};

const annualPackage = {
  sdk: "native",
  identifier: "$rc_annual",
  productIdentifier: "apex_pro_annual:annual",
  priceString: "£49.99",
  title: "Apex Pro Annual",
  rawPackage: {},
} as BillingPackage;

function renderCard(
  overrides: Partial<ComponentProps<typeof ProPlanCard>> = {},
): string {
  const props: ComponentProps<typeof ProPlanCard> = {
    features: plans.pro.features,
    plans,
    billingConfig: null,
    isBillingEnabled: true,
    isNative: true,
    billingPlatform: "play",
    resolvedPackages: { monthly: null, annual: null },
    billingInterval: "ANNUAL",
    onBillingIntervalChange: vi.fn(),
    selectedPackage: null,
    annualSavingsPercent: 30,
    isPro: false,
    isLoggedIn: true,
    authLoading: false,
    offeringsPending: false,
    eligibilityPending: false,
    eligibilityError: null,
    offeringsError: null,
    onRetryEligibility: vi.fn(),
    onRetryOfferings: vi.fn(),
    isPurchasing: false,
    isRestoringPurchases: false,
    isOpeningBillingPortal: false,
    isRefreshingSubscription: false,
    currentSubscriptionLabel: null,
    isCanceled: false,
    accessUntilLabel: null,
    entitlementBillingInterval: null,
    message: null,
    warning: null,
    error: null,
    onSubscribe: vi.fn(),
    onRestorePurchases: vi.fn(),
    onManageSubscription: vi.fn(),
    onSignInToSubscribe: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(<ProPlanCard {...props} />);
}

describe("ProPlanCard checkout states", () => {
  it("shows a spinner only while the initial checkout state is pending", () => {
    const html = renderCard({ eligibilityPending: true });
    expect(html).toContain("animate-spin");
    expect(html).not.toContain('data-testid="billing-subscribe-pro"');
  });

  it("shows retry UI instead of a spinner for an eligibility timeout", () => {
    const html = renderCard({
      eligibilityError:
        "Could not verify your subscription status. Refreshing timed out.",
    });
    expect(html).toContain('data-testid="billing-eligibility-error"');
    expect(html).toContain('data-testid="billing-eligibility-retry"');
    expect(html).toContain("Retry sync");
    expect(html).not.toContain("animate-spin");
  });

  it("surfaces an offerings failure with retry UI", () => {
    const html = renderCard({
      offeringsError: "Loading subscription options timed out.",
    });
    expect(html).toContain('data-testid="billing-offerings-error"');
    expect(html).toContain('data-testid="billing-offerings-retry"');
    expect(html).not.toContain("animate-spin");
  });

  it("shows catalog pricing without spinning after empty offerings", () => {
    const html = renderCard();
    expect(html).toContain("£49.99/year");
    expect(html).toContain('data-testid="billing-subscribe-pro"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("animate-spin");
  });

  it("shows an enabled Subscribe button when a package resolves", () => {
    const html = renderCard({
      resolvedPackages: { monthly: null, annual: annualPackage },
      selectedPackage: annualPackage,
    });
    expect(html).toContain('data-testid="billing-subscribe-pro"');
    expect(html).toContain("Subscribe to Pro");
    expect(html).not.toMatch(/data-testid="billing-subscribe-pro"[^>]*disabled/);
    expect(html).not.toContain("animate-spin");
  });
});
