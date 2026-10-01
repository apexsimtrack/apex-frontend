/**
 * Public site identity for SEO and legal copy (no secrets).
 */
export const SITE_ORIGIN = "https://apexsimtracker.com";
export const COMPANY_NAME = "Apex";

/** Path under `public/` used when a route has no specific share image. */
export const DEFAULT_OG_IMAGE_PATH = "/og-default.png";

/** Absolute URL for default Open Graph / Twitter images. */
export function defaultOgImageAbsolute(): string {
  return `${SITE_ORIGIN}${DEFAULT_OG_IMAGE_PATH}`;
}

/**
 * Ensures Open Graph / Twitter image URLs are absolute (required by crawlers).
 * Accepts full https URLs, protocol-relative URLs, or site-root paths like `/logo.png`.
 */
/** Public web URL for a session detail page (share links, deep links). */
export function publicSessionUrl(sessionId: string): string {
  return `${SITE_ORIGIN}/sessions/${sessionId}`;
}

export function absoluteUrlForOg(
  url: string | null | undefined,
): string | undefined {
  if (url == null) return undefined;
  const t = String(url).trim();
  if (!t) return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  const path = t.startsWith("/") ? t : `/${t}`;
  return `${SITE_ORIGIN}${path}`;
}
