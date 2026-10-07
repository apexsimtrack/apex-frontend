import { describe, expect, it } from "vitest";
import { PUBLIC_SEO_ROUTES } from "./publicSeoRoutes";
import { PLAN_PRICES, STATIC_SEO, STATIC_SEO_BY_PATH, siteJsonLd } from "./seoMeta";
import { FAQ_ITEMS, WEB_FAQ_ITEMS } from "../lib/faqData";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

describe("seoMeta parity", () => {
  it("has an entry for every public sitemap route", () => {
    for (const route of PUBLIC_SEO_ROUTES) {
      expect(STATIC_SEO_BY_PATH[route.path], route.path).toBeDefined();
    }
  });

  it("keeps titles and descriptions within search snippet limits", () => {
    for (const entry of Object.values(STATIC_SEO)) {
      expect(entry.title.length, entry.path).toBeLessThanOrEqual(TITLE_MAX);
      expect(entry.description.length, entry.path).toBeLessThanOrEqual(
        DESCRIPTION_MAX,
      );
    }
  });

  it("uses the real FAQ entries and the real plan prices", () => {
    const faq = STATIC_SEO.faq.jsonLd;
    expect(faq?.["@type"]).toBe("FAQPage");
    const questions = faq?.mainEntity as { name: string }[];
    expect(questions.map((q) => q.name)).toEqual(
      WEB_FAQ_ITEMS.map((item) => item.question),
    );
    // Store-only copy (App Store / Google Play) must not leak into public SEO.
    const mobileOnly = FAQ_ITEMS.filter(
      (item) => item.platforms && !item.platforms.includes("web"),
    );
    expect(mobileOnly.length).toBeGreaterThan(0);
    const answers = (
      faq?.mainEntity as { acceptedAnswer: { text: string } }[]
    ).map((q) => q.acceptedAnswer.text);
    for (const item of mobileOnly) {
      expect(answers).not.toContain(item.answer);
    }

    const offers = STATIC_SEO.pricing.jsonLd?.offers as unknown as {
      price: string;
    }[];
    expect(offers.map((offer) => offer.price)).toEqual([
      PLAN_PRICES.freeGbp,
      PLAN_PRICES.proMonthlyGbp,
      PLAN_PRICES.proYearlyGbp,
    ]);
    expect(STATIC_SEO.pricing.description).toContain("£5.99/month");
    expect(STATIC_SEO.pricing.description).toContain("£49.99/year");
  });

  it("omits sameAs on the organization node", () => {
    const org = siteJsonLd().find((node) => node["@type"] === "Organization");
    expect(org).toBeDefined();
    expect(org).not.toHaveProperty("sameAs");
  });
});
