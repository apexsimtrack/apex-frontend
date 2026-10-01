/**
 * Static public SEO copy shared by React pages and the Vercel middleware.
 * No `@/` imports: the edge bundle resolves relative paths only.
 */
import { FAQ_ITEMS } from "../lib/faqData";
import {
  COMPANY_NAME,
  DEFAULT_OG_IMAGE_PATH,
  SITE_ORIGIN,
} from "../lib/siteMeta";

/** Catalog prices shown on /pricing and in FAQ copy. */
export const PLAN_PRICES = {
  freeGbp: "0",
  proMonthlyGbp: "5.99",
  proYearlyGbp: "49.99",
} as const;

export type SeoJsonLd = Record<string, unknown>;

export type StaticSeoEntry = {
  path: string;
  title: string;
  description: string;
  /** Page-specific structured data. Sitewide Organization/WebSite stay in the HTML shell. */
  jsonLd?: SeoJsonLd;
};

const proPriceSentence = `Apex Pro is £${PLAN_PRICES.proMonthlyGbp}/month or £${PLAN_PRICES.proYearlyGbp}/year.`;

export const STATIC_SEO = {
  home: {
    path: "/",
    title: `${COMPANY_NAME} — Sim racing performance hub`,
    description: `${COMPANY_NAME}: session logging, telemetry, leaderboards, challenges, community, and Apex Analysis coaching — one place for every sim you run.`,
  },
  community: {
    path: "/community",
    title: `Community | ${COMPANY_NAME}`,
    description: `Sim racing discussions, setups, and strategy on ${COMPANY_NAME}.`,
  },
  challenges: {
    path: "/challenges",
    title: `Challenges | ${COMPANY_NAME}`,
    description: `Sim racing challenges and tournaments on ${COMPANY_NAME}: compete, qualify, and climb leaderboards.`,
  },
  leaderboards: {
    path: "/leaderboards",
    title: `Leaderboards | ${COMPANY_NAME}`,
    description: `Global sim racing leaderboards on ${COMPANY_NAME}: wins, races, podiums, most laps, and more.`,
  },
  pricing: {
    path: "/pricing",
    title: `Pricing | ${COMPANY_NAME}`,
    description: `Compare Free and Apex Pro plans for sim racing telemetry, leaderboards, and coaching. ${proPriceSentence}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: COMPANY_NAME,
      applicationCategory: "SportsApplication",
      operatingSystem: "Web, iOS, Android",
      offers: [
        {
          "@type": "Offer",
          name: "Free",
          price: PLAN_PRICES.freeGbp,
          priceCurrency: "GBP",
        },
        {
          "@type": "Offer",
          name: "Apex Pro monthly",
          price: PLAN_PRICES.proMonthlyGbp,
          priceCurrency: "GBP",
        },
        {
          "@type": "Offer",
          name: "Apex Pro yearly",
          price: PLAN_PRICES.proYearlyGbp,
          priceCurrency: "GBP",
        },
      ],
    },
  },
  about: {
    path: "/about",
    title: `About Us | ${COMPANY_NAME}`,
    description: `Founded by professional racer Hugo Cook: ${COMPANY_NAME} unifies sim performance, telemetry, and insights in one place — built by a racer, for racers.`,
  },
  faq: {
    path: "/faq",
    title: `Frequently Asked Questions | ${COMPANY_NAME}`,
    description: `Answers about ${COMPANY_NAME}, sessions, Apex Pro, and your account.`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  },
  contact: {
    path: "/contact",
    title: `Contact us | ${COMPANY_NAME}`,
    description: `Reach ${COMPANY_NAME} support — questions, feedback, and account help.`,
  },
  terms: {
    path: "/terms-and-conditions",
    title: `Terms & Conditions | ${COMPANY_NAME}`,
    description: `Terms and conditions for using the ${COMPANY_NAME} sim racing platform, Apex Agent, and Pro subscription.`,
  },
  privacy: {
    path: "/privacy-policy",
    title: `Privacy Policy | ${COMPANY_NAME}`,
    description: `How ${COMPANY_NAME} collects, uses, and retains personal data across our web app, mobile app, and desktop Agent.`,
  },
  cookies: {
    path: "/cookie-policy",
    title: `Cookie & Storage Policy | ${COMPANY_NAME}`,
    description: `How ${COMPANY_NAME} uses browser local storage, session storage, and similar technologies.`,
  },
  eula: {
    path: "/eula",
    title: `End User License Agreement | ${COMPANY_NAME} Agent`,
    description: `License terms for the ${COMPANY_NAME} Agent desktop application for Windows, macOS, and Linux.`,
  },
} as const satisfies Record<string, StaticSeoEntry>;

export const STATIC_SEO_BY_PATH: Record<string, StaticSeoEntry> =
  Object.fromEntries(
    Object.values(STATIC_SEO).map((entry) => [entry.path, entry]),
  );

/**
 * Organization and WebSite for the HTML shell.
 * No `sameAs`: the repo has no brand profile URLs, only store subscription-management links.
 */
export function siteJsonLd(): SeoJsonLd[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: COMPANY_NAME,
      url: `${SITE_ORIGIN}/`,
      logo: `${SITE_ORIGIN}/icon-512.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: COMPANY_NAME,
      url: `${SITE_ORIGIN}/`,
    },
  ];
}

export const DEFAULT_SHARE_IMAGE = `${SITE_ORIGIN}${DEFAULT_OG_IMAGE_PATH}`;

export const SESSION_SEO = {
  title: `Apex session | ${COMPANY_NAME}`,
  description: `Sign in to view this session on ${COMPANY_NAME}.`,
} as const;

export const PRIVATE_PROFILE_SEO = {
  title: `Profile | ${COMPANY_NAME}`,
  description: `This ${COMPANY_NAME} driver profile is private.`,
} as const;

export const NOT_FOUND_SEO = {
  title: `404 - Page Not Found | ${COMPANY_NAME}`,
  description: `The page you are looking for could not be found on ${COMPANY_NAME}.`,
} as const;
