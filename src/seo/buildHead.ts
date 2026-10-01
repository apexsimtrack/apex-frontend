import {
  DEFAULT_SHARE_IMAGE,
  siteJsonLd,
  type SeoJsonLd,
} from "../config/seoMeta";
import { clampMetaDescription, buildCanonicalUrl } from "../lib/seo";
import { COMPANY_NAME, SITE_ORIGIN } from "../lib/siteMeta";
import { escapeHtml, safeJsonLd } from "./escapeHtml";

export type HeadInput = {
  title: string;
  description: string;
  /** Path used for og:url. Canonical link is omitted when null. */
  canonicalPath: string | null;
  robots: string;
  image?: string | null;
  ogType?: "website" | "article";
  jsonLd?: SeoJsonLd | null;
};

const SEO_START = "<!--seo:start-->";
const SEO_END = "<!--seo:end-->";

export function buildHead(input: HeadInput): string {
  const title = escapeHtml(input.title);
  const description = escapeHtml(clampMetaDescription(input.description));
  const robots = escapeHtml(input.robots);
  const image = escapeHtml(absoluteImage(input.image));
  const ogType = input.ogType === "article" ? "article" : "website";
  const pageUrl = input.canonicalPath
    ? buildCanonicalUrl(input.canonicalPath)
    : `${SITE_ORIGIN}/`;
  const url = escapeHtml(pageUrl);
  const canonical = input.canonicalPath
    ? `\n    <link rel="canonical" href="${url}" />`
    : "";
  const routeLd = input.jsonLd
    ? `\n    <script type="application/ld+json" data-apex-jsonld="route">${safeJsonLd(input.jsonLd)}</script>`
    : "";

  return `${SEO_START}
    <meta name="description" content="${description}" />
    <meta name="robots" content="${robots}" />
    <meta property="og:site_name" content="${escapeHtml(COMPANY_NAME)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />${canonical}
    <script type="application/ld+json" data-apex-jsonld="site">${safeJsonLd(siteJsonLd())}</script>${routeLd}
    <title>${title}</title>
    ${SEO_END}`;
}

function absoluteImage(image: string | null | undefined): string {
  if (!image) return DEFAULT_SHARE_IMAGE;
  const trimmed = image.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return DEFAULT_SHARE_IMAGE;
}

export function applySeoBlock(html: string, block: string): string {
  const start = html.indexOf(SEO_START);
  const end = html.indexOf(SEO_END);
  if (start === -1 || end === -1 || end < start) return html;
  return html.slice(0, start) + block + html.slice(end + SEO_END.length);
}
