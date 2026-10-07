import { describe, expect, it } from "vitest";
import {
  FAQ_CATEGORY_ORDER,
  FAQ_ITEMS,
  FAQ_PLATFORMS,
  WEB_FAQ_ITEMS,
  faqPlatformFromCapacitor,
  filterFaqItems,
  filterFaqItemsForPlatform,
  groupFaqByCategory,
  type FaqPlatform,
} from "./faqData";

describe("faqData content invariants", () => {
  it("has unique ids and known categories/platforms", () => {
    const ids = FAQ_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set<string>(FAQ_CATEGORY_ORDER);
    for (const item of FAQ_ITEMS) {
      expect(categories.has(item.category), item.id).toBe(true);
      for (const p of item.platforms ?? []) {
        expect(FAQ_PLATFORMS).toContain(p);
      }
      expect(item.platforms?.length ?? 1, item.id).toBeGreaterThan(0);
    }
  });

  it("shows each question exactly once per platform", () => {
    for (const platform of FAQ_PLATFORMS) {
      const visible = filterFaqItemsForPlatform(FAQ_ITEMS, platform);
      const questions = visible.map((item) => item.question);
      expect(new Set(questions).size, platform).toBe(questions.length);
    }
    // Every question that exists anywhere is answered on every platform.
    const allQuestions = new Set(FAQ_ITEMS.map((item) => item.question));
    for (const platform of FAQ_PLATFORMS) {
      const visible = new Set(
        filterFaqItemsForPlatform(FAQ_ITEMS, platform).map((i) => i.question),
      );
      for (const q of allQuestions) {
        const existsSomewhereElseOnly = FAQ_ITEMS.filter(
          (item) => item.question === q,
        ).every((item) => item.platforms && !item.platforms.includes(platform));
        if (!existsSomewhereElseOnly) {
          expect(visible.has(q), `${platform}: ${q}`).toBe(true);
        }
      }
    }
  });

  it("keeps store-specific billing copy out of the other store's app", () => {
    const text = (platform: FaqPlatform) =>
      filterFaqItemsForPlatform(FAQ_ITEMS, platform)
        .map((item) => `${item.question} ${item.answer}`)
        .join("\n");

    const ios = text("ios");
    expect(ios).not.toMatch(/Stripe/);
    expect(ios).not.toMatch(/£/);
    expect(ios).not.toMatch(/Google Play/);
    expect(ios).toMatch(/App Store/);
    expect(ios).toMatch(/Restore purchases/);

    const android = text("android");
    expect(android).not.toMatch(/Stripe/);
    expect(android).not.toMatch(/£/);
    expect(android).not.toMatch(/App Store/);
    expect(android).toMatch(/Google Play/);
    expect(android).toMatch(/Restore purchases/);

    const web = text("web");
    expect(web).toMatch(/£5\.99\/month/);
    expect(web).toMatch(/£49\.99\/year/);
    expect(web).toMatch(/Stripe/);
    expect(web).not.toMatch(/Restore purchases/);
  });

  it("reflects current product facts", () => {
    const web = WEB_FAQ_ITEMS.map((i) => i.answer).join("\n");
    expect(web).toMatch(/Le Mans Ultimate/);
    expect(web).toMatch(/F1 25/);
    expect(web).toMatch(/iRacing/);
    expect(web).toMatch(/10 days/);
    expect(web).toMatch(/once per email/);
    expect(web).toMatch(/90 days/);
    expect(web).not.toMatch(/private by default/i);
  });
});

describe("faqData helpers", () => {
  it("maps Capacitor platforms", () => {
    expect(faqPlatformFromCapacitor("ios")).toBe("ios");
    expect(faqPlatformFromCapacitor("android")).toBe("android");
    expect(faqPlatformFromCapacitor("web")).toBe("web");
    expect(faqPlatformFromCapacitor("electron")).toBe("web");
  });

  it("filters by platform and keeps unscoped items everywhere", () => {
    const items = [
      { id: "a", category: "General", question: "A", answer: "" },
      {
        id: "b",
        category: "General",
        question: "B",
        answer: "",
        platforms: ["ios"] as const,
      },
      {
        id: "c",
        category: "General",
        question: "C",
        answer: "",
        platforms: ["web", "android"] as const,
      },
    ];
    expect(filterFaqItemsForPlatform(items, "ios").map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterFaqItemsForPlatform(items, "android").map((i) => i.id)).toEqual(
      ["a", "c"],
    );
    expect(filterFaqItemsForPlatform(items, "web").map((i) => i.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("groups in category order and searches question/answer/category", () => {
    const grouped = groupFaqByCategory(WEB_FAQ_ITEMS).map((s) => s.category);
    expect(grouped).toEqual(
      FAQ_CATEGORY_ORDER.filter((c) =>
        WEB_FAQ_ITEMS.some((i) => i.category === c),
      ),
    );
    expect(filterFaqItems(WEB_FAQ_ITEMS, "stripe").length).toBeGreaterThan(0);
    expect(filterFaqItems(WEB_FAQ_ITEMS, "   ")).toBe(WEB_FAQ_ITEMS);
    expect(filterFaqItems(WEB_FAQ_ITEMS, "zzzz-no-match")).toEqual([]);
  });
});
