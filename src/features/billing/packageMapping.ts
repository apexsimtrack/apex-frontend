import type {
  BillingInterval,
  BillingPlansResponse,
} from "@/lib/api/activityBilling";
import type { BillingPackage } from "./billingPackage";
import { proProductId, type StoreBillingPlatform } from "./storeProductIds";

export type ResolvedPackages = {
  monthly: BillingPackage | null;
  annual: BillingPackage | null;
};

function packageIdentifier(rcPackage: BillingPackage): string {
  return rcPackage.identifier?.trim().toLowerCase() ?? "";
}

function matchesNativeProductId(
  rcPackage: BillingPackage,
  platform: Exclude<StoreBillingPlatform, "web">,
  interval: BillingInterval,
): boolean {
  const actual =
    platform === "play"
      ? rcPackage.productIdentifier.split(":", 1)[0]
      : rcPackage.productIdentifier;
  const expected = proProductId(
    platform,
    interval === "MONTHLY" ? "monthly" : "annual",
  );
  return actual === expected;
}

/** Store SKUs (Apple vs Play) live in `storeProductIds.ts`. */
export function isAnnualPackage(rcPackage: BillingPackage): boolean {
  const id =
    `${packageIdentifier(rcPackage)} ${rcPackage.productIdentifier}`.toLowerCase();
  return id.includes("annual") || id.includes("year");
}

export function isMonthlyPackage(rcPackage: BillingPackage): boolean {
  const id =
    `${packageIdentifier(rcPackage)} ${rcPackage.productIdentifier}`.toLowerCase();
  return id.includes("month") || id === "$rc_monthly";
}

export function resolvePackagesByInterval(
  availablePackages: BillingPackage[],
  platform: StoreBillingPlatform = "web",
): ResolvedPackages {
  if (platform !== "web") {
    return {
      monthly:
        availablePackages.find(
          (pkg) => matchesNativeProductId(pkg, platform, "MONTHLY"),
        ) ?? null,
      annual:
        availablePackages.find(
          (pkg) => matchesNativeProductId(pkg, platform, "ANNUAL"),
        ) ?? null,
    };
  }

  let monthly: BillingPackage | null = null;
  let annual: BillingPackage | null = null;

  for (const pkg of availablePackages) {
    if (!annual && isAnnualPackage(pkg)) annual = pkg;
    if (!monthly && isMonthlyPackage(pkg)) monthly = pkg;
  }

  return { monthly, annual };
}

export function pickDefaultInterval(
  resolved: ResolvedPackages,
): BillingInterval {
  if (resolved.annual) return "ANNUAL";
  if (resolved.monthly) return "MONTHLY";
  return "ANNUAL";
}

export function packageForInterval(
  resolved: ResolvedPackages,
  interval: BillingInterval,
): BillingPackage | null {
  return interval === "ANNUAL" ? resolved.annual : resolved.monthly;
}

export function computeAnnualSavingsPercent(
  plans: BillingPlansResponse | undefined,
): number | null {
  if (!plans) return null;
  const monthly = plans.pro.monthly.priceGbp;
  const annual = plans.pro.annual.priceGbp;
  if (!Number.isFinite(monthly) || !Number.isFinite(annual) || monthly <= 0) {
    return null;
  }
  const yearlyAtMonthly = monthly * 12;
  if (yearlyAtMonthly <= annual) return null;
  return Math.round(((yearlyAtMonthly - annual) / yearlyAtMonthly) * 100);
}

export function getPackagePriceLabel(
  rcPackage: BillingPackage,
  plans: BillingPlansResponse | undefined,
): string {
  if (rcPackage.priceString) return rcPackage.priceString;

  if (isAnnualPackage(rcPackage)) {
    return plans?.pro.annual.priceLabel ?? "Unavailable";
  }
  if (isMonthlyPackage(rcPackage)) {
    return plans?.pro.monthly.priceLabel ?? "Unavailable";
  }

  return plans?.pro.monthly.priceLabel ?? "Unavailable";
}

export function getPackageTitle(
  rcPackage: BillingPackage,
  plans: BillingPlansResponse | undefined,
): string {
  if (rcPackage.sdk === "native" && rcPackage.title) return rcPackage.title;

  if (isAnnualPackage(rcPackage)) {
    return plans?.pro.annual.name ?? "Pro Annual";
  }
  if (isMonthlyPackage(rcPackage)) {
    return plans?.pro.monthly.name ?? "Pro Monthly";
  }

  const identifier = packageIdentifier(rcPackage);
  if (identifier && !identifier.startsWith("$")) {
    return identifier
      .split(/[-_]/g)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }

  return rcPackage.title ?? plans?.pro.monthly.name ?? "Apex Pro";
}

export function priceLabelForCatalogInterval(
  interval: BillingInterval,
  plans: BillingPlansResponse | undefined,
): string {
  if (interval === "ANNUAL")
    return plans?.pro.annual.priceLabel ?? "£49.99/year";
  return plans?.pro.monthly.priceLabel ?? "£5.99/month";
}
