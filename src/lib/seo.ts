import { COMPANY_NAME, SITE_ORIGIN } from "./siteMeta";

const DEFAULT_TITLE_MAX = 60;
const DEFAULT_DESCRIPTION_MAX = 160;

/**
 * Builds a document title like "Leaderboards | Apex", keeping under maxLength when possible.
 */
export function buildPageTitle(
  pageTitle: string,
  brand = COMPANY_NAME,
  maxLength = DEFAULT_TITLE_MAX,
): string {
  const trimmed = pageTitle.trim();
  const suffix = ` | ${brand}`;
  const full = `${trimmed}${suffix}`;
  if (full.length <= maxLength) return full;
  const budget = maxLength - suffix.length;
  if (budget < 8) return full.slice(0, maxLength);
  return `${trimmed.slice(0, budget).trim()}${suffix}`;
}

/**
 * Truncates meta descriptions for search snippets (default 160 characters).
 */
export function clampMetaDescription(
  text: string,
  maxLength = DEFAULT_DESCRIPTION_MAX,
): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxLength) return t;
  const slice = t.slice(0, maxLength - 1).trim();
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}

/**
 * Absolute canonical URL for a route path (no query or hash).
 */
export function buildCanonicalUrl(path: string, origin = SITE_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  const normalized = path.trim() || "/";
  if (normalized === "/") return `${base}/`;
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${base}${withSlash.split(/[?#]/)[0]}`;
}

/** Robots meta content for indexable public pages. */
export function robotsIndexFollow(): string {
  return "index, follow";
}

/** Robots meta content for private or utility pages. */
export function robotsNoindex(nofollow = true): string {
  return nofollow ? "noindex, nofollow" : "noindex, follow";
}
