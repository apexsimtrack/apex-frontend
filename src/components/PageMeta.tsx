import { useEffect } from "react";
import {
  COMPANY_NAME,
  absoluteUrlForOg,
  defaultOgImageAbsolute,
} from "@/lib/siteMeta";
import {
  buildCanonicalUrl,
  clampMetaDescription,
  robotsIndexFollow,
  robotsNoindex,
} from "@/lib/seo";

type PageMetaProps = {
  title: string;
  description: string;
  path: string;
  /** When false, does not set a canonical link (use for 404 and similar). Default true. */
  setCanonical?: boolean;
  /** Image for og:image / twitter:image; site default used when omitted. */
  image?: string | null;
  ogType?: "website" | "article";
  twitterCard?: "summary" | "summary_large_image";
  /** When true, sets robots to noindex (and nofollow unless noindexNofollow is false). */
  noindex?: boolean;
  /** When noindex is true, use noindex,follow instead of noindex,nofollow. Default true (nofollow). */
  noindexNofollow?: boolean;
  /** Override robots meta entirely (e.g. "noindex, follow"). */
  robots?: string;
  /** Page-specific JSON-LD. Upserts `script[data-apex-jsonld="route"]`. */
  jsonLd?: Record<string, unknown> | null;
};

type ScriptSnapshot = {
  el: HTMLScriptElement;
  previousText: string | null;
  created: boolean;
};

type MetaSnapshot = {
  el: HTMLMetaElement;
  previousContent: string | null;
  created: boolean;
};

type LinkSnapshot = {
  el: HTMLLinkElement;
  previousHref: string | null;
  created: boolean;
};

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
): MetaSnapshot {
  let el = document.querySelector(
    `meta[${attr}="${key}"]`,
  ) as HTMLMetaElement | null;
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const previousContent = el.getAttribute("content");
  el.setAttribute("content", content);
  return { el, previousContent, created };
}

function upsertLink(rel: string, href: string): LinkSnapshot {
  let el = document.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  const created = !el;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  const previousHref = el.getAttribute("href");
  el.setAttribute("href", href);
  return { el, previousHref, created };
}

function restoreMeta({ el, previousContent, created }: MetaSnapshot) {
  if (created) {
    el.remove();
    return;
  }
  if (previousContent == null) el.removeAttribute("content");
  else el.setAttribute("content", previousContent);
}

function upsertJsonLd(data: Record<string, unknown>): ScriptSnapshot {
  let el = document.querySelector(
    'script[data-apex-jsonld="route"]',
  ) as HTMLScriptElement | null;
  const created = !el;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.setAttribute("data-apex-jsonld", "route");
    document.head.appendChild(el);
  }
  const previousText = el.textContent;
  el.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
  return { el, previousText, created };
}

function restoreScript({ el, previousText, created }: ScriptSnapshot) {
  if (created) {
    el.remove();
    return;
  }
  el.textContent = previousText;
}

function restoreLink({ el, previousHref, created }: LinkSnapshot) {
  if (created) {
    el.remove();
    return;
  }
  if (previousHref == null) el.removeAttribute("href");
  else el.setAttribute("href", previousHref);
}

/**
 * Sets document title and SEO meta tags for SPA routes. Restores head tags on unmount.
 *
 * Note: Many social crawlers do not execute JavaScript; link previews may still show shell
 * defaults until prerender or server-injected tags exist.
 */
export default function PageMeta({
  title,
  description,
  path,
  setCanonical = true,
  image,
  ogType = "website",
  twitterCard = "summary_large_image",
  noindex = false,
  noindexNofollow = true,
  robots: robotsOverride,
  jsonLd = null,
}: PageMetaProps) {
  useEffect(() => {
    const prevTitle = document.title;
    const metaDescription = clampMetaDescription(description);
    const canonical = buildCanonicalUrl(path);
    const imageAbsolute = absoluteUrlForOg(image) ?? defaultOgImageAbsolute();
    const robotsContent =
      robotsOverride ??
      (noindex ? robotsNoindex(noindexNofollow) : robotsIndexFollow());

    document.title = title;

    const snapshots: Array<MetaSnapshot | LinkSnapshot> = [
      upsertMeta("name", "description", metaDescription),
      upsertMeta("name", "robots", robotsContent),
      upsertMeta("property", "og:site_name", COMPANY_NAME),
      upsertMeta("property", "og:title", title),
      upsertMeta("property", "og:description", metaDescription),
      upsertMeta("property", "og:url", canonical),
      upsertMeta("property", "og:type", ogType),
      upsertMeta("property", "og:image", imageAbsolute),
      upsertMeta("name", "twitter:card", twitterCard),
      upsertMeta("name", "twitter:title", title),
      upsertMeta("name", "twitter:description", metaDescription),
      upsertMeta("name", "twitter:image", imageAbsolute),
    ];

    if (setCanonical) {
      snapshots.push(upsertLink("canonical", canonical));
    }

    const jsonLdSnapshot = jsonLd ? upsertJsonLd(jsonLd) : null;

    return () => {
      document.title = prevTitle;
      if (jsonLdSnapshot) restoreScript(jsonLdSnapshot);
      for (let i = snapshots.length - 1; i >= 0; i--) {
        const s = snapshots[i];
        if ("previousContent" in s) restoreMeta(s);
        else restoreLink(s);
      }
    };
  }, [
    title,
    description,
    path,
    setCanonical,
    image,
    ogType,
    twitterCard,
    noindex,
    noindexNofollow,
    robotsOverride,
    jsonLd,
  ]);

  return null;
}
