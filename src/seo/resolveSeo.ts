/**
 * Decides the document head for a pathname. Pure aside from the injected fetch.
 * Session URLs never request /api/sessions.
 */
import {
  NOT_FOUND_SEO,
  PRIVATE_PROFILE_SEO,
  SESSION_SEO,
  STATIC_SEO,
  STATIC_SEO_BY_PATH,
} from "../config/seoMeta";
import { COMPANY_NAME } from "../lib/siteMeta";
import { buildHead, type HeadInput } from "./buildHead";
import { escapeHtml } from "./escapeHtml";
import { matchRoute, type RouteMatch } from "./routeMatch";

export const API_TIMEOUT_MS = 800;

export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type SeoResolution = {
  status: 200 | 404;
  cacheControl: string;
  contentType: string;
  /** HTML head block, or sitemap XML when contentType is XML. */
  body: string;
  apiUrls: string[];
};

const HTML_CACHE = "no-store";
const SITEMAP_CACHE = "public, max-age=3600";
const SITEMAP_PAGE_LIMIT = 5000;
const SITEMAP_MAX_PAGES = 20;

type ApiResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number }
  | { error: true };

export function apiBaseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password) return null;
    return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/$/, ""));
  } catch {
    return null;
  }
}

export async function resolveSeo(input: {
  pathname: string;
  apiBase: string | null;
  fetchImpl: FetchLike;
  origin?: string;
}): Promise<SeoResolution> {
  const match = matchRoute(input.pathname);
  if (match.kind === "sitemap") {
    return resolveSitemap(input.apiBase, input.fetchImpl, input.origin);
  }
  const apiUrls: string[] = [];
  const head = await headForMatch(match, input.apiBase, input.fetchImpl, apiUrls);
  return {
    status: match.kind === "notFound" ? 404 : 200,
    cacheControl: HTML_CACHE,
    contentType: "text/html; charset=utf-8",
    body: buildHead(head),
    apiUrls,
  };
}

async function headForMatch(
  match: RouteMatch,
  apiBase: string | null,
  fetchImpl: FetchLike,
  apiUrls: string[],
): Promise<HeadInput> {
  switch (match.kind) {
    case "static": {
      const entry = STATIC_SEO_BY_PATH[match.path] ?? STATIC_SEO.home;
      return {
        title: entry.title,
        description: entry.description,
        canonicalPath: entry.path,
        robots: "index, follow",
        jsonLd: "jsonLd" in entry ? (entry.jsonLd ?? null) : null,
      };
    }
    case "app":
      return appHead(match.path);
    case "maintenance":
      return {
        title: `Maintenance Status | ${COMPANY_NAME}`,
        description: "Planned maintenance details and live status.",
        canonicalPath: match.canonicalPath,
        robots: "index, follow",
      };
    case "session":
      return {
        title: SESSION_SEO.title,
        description: SESSION_SEO.description,
        canonicalPath: match.canonicalPath,
        robots: "noindex, nofollow",
      };
    case "notFound":
      return {
        title: NOT_FOUND_SEO.title,
        description: NOT_FOUND_SEO.description,
        canonicalPath: null,
        robots: "noindex, nofollow",
      };
    case "discussion":
      return discussionHead(match, apiBase, fetchImpl, apiUrls);
    case "challenge":
      return challengeHead(match, apiBase, fetchImpl, apiUrls);
    case "user":
      return userHead(match, apiBase, fetchImpl, apiUrls);
    case "sitemap":
      return appHead("/");
  }
}

function appHead(path: string): HeadInput {
  const known: Record<string, { title: string; description: string }> = {
    "/home": {
      title: STATIC_SEO.home.title,
      description: STATIC_SEO.home.description,
    },
    "/login": {
      title: `Sign in | ${COMPANY_NAME}`,
      description: `Sign in to ${COMPANY_NAME} — your sim racing hub.`,
    },
    "/signup": {
      title: `Create account | ${COMPANY_NAME}`,
      description: `Join ${COMPANY_NAME} — sim racing sessions, leaderboards, and community.`,
    },
    "/forgot-password": {
      title: `Reset password | ${COMPANY_NAME}`,
      description: `Reset your ${COMPANY_NAME} account password.`,
    },
    "/verify-email": {
      title: `Verify email | ${COMPANY_NAME}`,
      description: `Verify your ${COMPANY_NAME} email address.`,
    },
    "/agent": {
      title: `Apex Agent | ${COMPANY_NAME}`,
      description: `Download the ${COMPANY_NAME} Agent for macOS, Windows, and Linux.`,
    },
    "/upload": {
      title: `Upload | ${COMPANY_NAME}`,
      description: `Upload telemetry to ${COMPANY_NAME}.`,
    },
    "/manual": {
      title: `Log session | ${COMPANY_NAME}`,
      description: `Log a sim racing session manually on ${COMPANY_NAME}.`,
    },
    "/sessions": {
      title: `Sessions | ${COMPANY_NAME}`,
      description: `Browse your sim racing sessions and telemetry on ${COMPANY_NAME}.`,
    },
    "/settings": {
      title: `Settings | ${COMPANY_NAME}`,
      description: `Manage your ${COMPANY_NAME} account settings.`,
    },
    "/personal-bests": {
      title: `Personal bests | ${COMPANY_NAME}`,
      description: `Track your best qualifying laps per track and car on ${COMPANY_NAME}.`,
    },
    "/profile": {
      title: `Profile | ${COMPANY_NAME}`,
      description: `Your ${COMPANY_NAME} driver profile, stats, and race history.`,
    },
  };
  const copy = known[path] ?? {
    title: path.startsWith("/admin")
      ? `Admin | ${COMPANY_NAME}`
      : `Apex | ${COMPANY_NAME}`,
    description: `${COMPANY_NAME} account page.`,
  };
  const canonicalPath = path === "/home" ? "/" : path;
  return {
    title: copy.title,
    description: copy.description,
    canonicalPath,
    robots: "noindex, nofollow",
  };
}

async function discussionHead(
  match: Extract<RouteMatch, { kind: "discussion" }>,
  apiBase: string | null,
  fetchImpl: FetchLike,
  apiUrls: string[],
): Promise<HeadInput> {
  const fallback: HeadInput = {
    title: `Discussion | ${COMPANY_NAME}`,
    description: `Community discussion on ${COMPANY_NAME}.`,
    canonicalPath: match.canonicalPath,
    robots: "index, follow",
    ogType: "article",
  };
  const result = await getJson(
    apiBase,
    `/api/community/discussions/${encodeURIComponent(match.id)}`,
    fetchImpl,
    apiUrls,
    API_TIMEOUT_MS,
  );
  if (!result || "error" in result) return fallback;
  if (!result.ok) {
    return { ...fallback, robots: "noindex, nofollow" };
  }
  const body = asRecord(result.body);
  const title = stringField(body, "title");
  if (!title) return { ...fallback, robots: "noindex, nofollow" };
  const content = stringField(body, "content") ?? stringField(body, "excerpt");
  return {
    title: `${title} | ${COMPANY_NAME}`,
    description: content || `${title} — ${COMPANY_NAME} community`,
    canonicalPath: match.canonicalPath,
    robots: "index, follow",
    ogType: "article",
    image: stringField(body, "imageUrl"),
  };
}

async function challengeHead(
  match: Extract<RouteMatch, { kind: "challenge" }>,
  apiBase: string | null,
  fetchImpl: FetchLike,
  apiUrls: string[],
): Promise<HeadInput> {
  const fallback: HeadInput = {
    title: `Challenge | ${COMPANY_NAME}`,
    description: `Sim racing challenge on ${COMPANY_NAME}.`,
    canonicalPath: match.canonicalPath,
    robots: "index, follow",
    ogType: "article",
  };
  const result = await getJson(
    apiBase,
    `/api/challenges/${encodeURIComponent(match.id)}`,
    fetchImpl,
    apiUrls,
    API_TIMEOUT_MS,
  );
  if (!result || "error" in result) return fallback;
  if (!result.ok) {
    return { ...fallback, robots: "noindex, nofollow" };
  }
  const body = asRecord(result.body);
  const title = stringField(body, "title");
  if (!title) return { ...fallback, robots: "noindex, nofollow" };
  if (body?.banned === true) {
    return {
      title: `${title} | ${COMPANY_NAME}`,
      description: `Sim racing challenge on ${COMPANY_NAME}.`,
      canonicalPath: match.canonicalPath,
      robots: "noindex, nofollow",
      ogType: "article",
    };
  }
  return {
    title: `${title} | ${COMPANY_NAME}`,
    description:
      stringField(body, "description") ||
      `${title} — ${COMPANY_NAME} challenge.`,
    canonicalPath: match.canonicalPath,
    robots: "index, follow",
    ogType: "article",
    image: stringField(body, "coverImageUrl"),
  };
}

async function userHead(
  match: Extract<RouteMatch, { kind: "user" }>,
  apiBase: string | null,
  fetchImpl: FetchLike,
  apiUrls: string[],
): Promise<HeadInput> {
  const fallback: HeadInput = {
    title: `Profile | ${COMPANY_NAME}`,
    description: `${COMPANY_NAME} driver profile, stats, and race history.`,
    canonicalPath: match.canonicalPath,
    robots: "index, follow",
  };
  const result = await getJson(
    apiBase,
    `/api/users/${encodeURIComponent(match.userId)}`,
    fetchImpl,
    apiUrls,
    API_TIMEOUT_MS,
  );
  if (!result || "error" in result) return fallback;
  if (!result.ok) {
    return {
      title: `User not found | ${COMPANY_NAME}`,
      description: "This profile does not exist or was removed.",
      canonicalPath: null,
      robots: "noindex, nofollow",
    };
  }
  const body = asRecord(result.body);
  if (body?.privateProfile === true) {
    return {
      title: PRIVATE_PROFILE_SEO.title,
      description: PRIVATE_PROFILE_SEO.description,
      canonicalPath: match.canonicalPath,
      robots: "noindex, nofollow",
    };
  }
  const displayName = stringField(body, "displayName") || "Driver";
  const bio = stringField(body, "bio");
  return {
    title: `${displayName} | ${COMPANY_NAME}`,
    description:
      bio ||
      `${displayName} on ${COMPANY_NAME} — stats, race history, and community.`,
    canonicalPath: match.canonicalPath,
    robots: "index, follow",
    image: stringField(body, "avatarUrl"),
  };
}

async function getJson(
  apiBase: string | null,
  path: string,
  fetchImpl: FetchLike,
  apiUrls: string[],
  timeoutMs: number,
): Promise<ApiResult | null> {
  if (!apiBase) return null;
  if (path.includes("/api/sessions")) return null;
  const url = `${apiBase}${path}`;
  apiUrls.push(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    return { ok: true, status: res.status, body };
  } catch {
    return { error: true };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(
  body: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = body?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type SitemapItem = { id: string; updatedAt: string };

async function resolveSitemap(
  apiBase: string | null,
  fetchImpl: FetchLike,
  origin: string | undefined,
): Promise<SeoResolution> {
  const site = (origin ?? "https://apexsimtracker.com").replace(/\/$/, "");
  const apiUrls: string[] = [];
  if (!apiBase) {
    return {
      status: 200,
      cacheControl: "no-store",
      contentType: "application/xml; charset=utf-8",
      body: sitemapXml(site, [], []),
      apiUrls,
    };
  }
  const [discussions, challenges] = await Promise.all([
    fetchAllEntries(apiBase, "discussions", fetchImpl, apiUrls),
    fetchAllEntries(apiBase, "challenges", fetchImpl, apiUrls),
  ]);
  const failed = discussions == null || challenges == null;
  return {
    status: 200,
    cacheControl: failed ? "no-store" : SITEMAP_CACHE,
    contentType: "application/xml; charset=utf-8",
    body: sitemapXml(site, discussions ?? [], challenges ?? []),
    apiUrls,
  };
}

async function fetchAllEntries(
  apiBase: string,
  kind: "discussions" | "challenges",
  fetchImpl: FetchLike,
  apiUrls: string[],
): Promise<SitemapItem[] | null> {
  const items: SitemapItem[] = [];
  for (let page = 1; page <= SITEMAP_MAX_PAGES; page += 1) {
    const path = `/api/seo/sitemap-entries?kind=${kind}&page=${page}&limit=${SITEMAP_PAGE_LIMIT}`;
    const result = await getJson(apiBase, path, fetchImpl, apiUrls, 4000);
    if (!result || "error" in result || !result.ok) return null;
    const body = asRecord(result.body);
    const raw = body?.items;
    if (!Array.isArray(raw)) return null;
    for (const row of raw) {
      const record = asRecord(row);
      const id = stringField(record, "id");
      const updatedAt = stringField(record, "updatedAt");
      if (id && updatedAt) items.push({ id, updatedAt });
    }
    const totalPages =
      typeof body?.totalPages === "number" ? body.totalPages : 1;
    if (page >= totalPages) break;
  }
  return items;
}

function sitemapXml(
  origin: string,
  discussions: SitemapItem[],
  challenges: SitemapItem[],
): string {
  const urls = [
    ...discussions.map(
      (item) =>
        `  <url><loc>${escapeHtml(`${origin}/discussion/${encodeURIComponent(item.id)}`)}</loc><lastmod>${escapeHtml(item.updatedAt.slice(0, 10))}</lastmod></url>`,
    ),
    ...challenges.map(
      (item) =>
        `  <url><loc>${escapeHtml(`${origin}/challenge/${encodeURIComponent(item.id)}`)}</loc><lastmod>${escapeHtml(item.updatedAt.slice(0, 10))}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}
