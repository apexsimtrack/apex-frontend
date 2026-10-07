import type { Package as WebRevenueCatPackage } from "@revenuecat/purchases-js";
import type { PurchasesPackage as NativeRevenueCatPackage } from "@revenuecat/purchases-capacitor";

export type BillingPackage =
  | {
      sdk: "web";
      identifier: string;
      productIdentifier: string;
      priceString: string | null;
      title: string | null;
      rawPackage: WebRevenueCatPackage;
    }
  | {
      sdk: "native";
      identifier: string;
      productIdentifier: string;
      priceString: string | null;
      currencyCode: string | null;
      title: string | null;
      rawPackage: NativeRevenueCatPackage;
    };
