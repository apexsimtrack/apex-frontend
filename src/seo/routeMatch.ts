/**
 * Classifies a pathname the same way react-router does in App.tsx.
 * HTTP 404 is only the splat that renders NotFound.
 */

export type RouteMatch =
  | { kind: "static"; path: string }
  | { kind: "app"; path: string }
  | { kind: "discussion"; id: string; canonicalPath: string }
  | { kind: "challenge"; id: string; canonicalPath: string }
  | { kind: "user"; userId: string; canonicalPath: string }
  | { kind: "session"; id: string; canonicalPath: string }
  | { kind: "maintenance"; id: string; canonicalPath: string }
  | { kind: "notFound"; path: string }
  | { kind: "sitemap" };

const STATIC_INDEXABLE = new Set([
  "/",
  "/community",
  "/challenges",
  "/leaderboards",
  "/pricing",
  "/about",
  "/faq",
  "/contact",
  "/terms-and-conditions",
  "/privacy-policy",
  "/cookie-policy",
  "/eula",
]);

/** Exact paths that render a page and are not indexable. */
const APP_EXACT = new Set([
  "/home",
  "/agent",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
  "/upload",
  "/manual",
  "/sessions",
  "/settings",
  "/personal-bests",
  "/profile",
]);

export function normalizePathname(pathname: string): string {
  const raw = pathname.split(/[?#]/)[0] ?? "/";
  if (raw === "" || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function oneSegment(value: string | undefined): string | null {
  if (!value) return null;
  if (value.includes("/") || value.includes("\\") || value.includes("..")) {
    return null;
  }
  const decoded = safeDecode(value);
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) return null;
  return decoded;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Paths the middleware must not treat as HTML.
 * `/sitemap-dynamic.xml` is the exception: it is generated, not a static file.
 */
export function shouldBypassMiddleware(pathname: string): boolean {
  if (pathname === "/sitemap-dynamic.xml") return false;
  if (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/sims/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return true;
  }
  const last = pathname.split("/").pop() ?? "";
  return last.includes(".");
}

export function matchRoute(pathname: string): RouteMatch {
  if (pathname === "/sitemap-dynamic.xml") return { kind: "sitemap" };
  const path = normalizePathname(pathname);

  if (STATIC_INDEXABLE.has(path)) return { kind: "static", path };
  if (APP_EXACT.has(path)) return { kind: "app", path };

  if (path === "/admin" || path.startsWith("/admin/")) {
    return { kind: "app", path };
  }

  const discussion = path.match(/^\/discussion\/([^/]+)$/);
  if (discussion) {
    const id = oneSegment(discussion[1]);
    if (id) {
      return {
        kind: "discussion",
        id,
        canonicalPath: `/discussion/${encodeURIComponent(id)}`,
      };
    }
  }

  const legacyDiscussion = path.match(/^\/community\/discussions\/([^/]+)$/);
  if (legacyDiscussion) {
    const id = oneSegment(legacyDiscussion[1]);
    if (id) {
      return {
        kind: "discussion",
        id,
        canonicalPath: `/discussion/${encodeURIComponent(id)}`,
      };
    }
  }

  const challenge = path.match(/^\/challenge\/([^/]+)$/);
  if (challenge) {
    const id = oneSegment(challenge[1]);
    if (id) {
      return {
        kind: "challenge",
        id,
        canonicalPath: `/challenge/${encodeURIComponent(id)}`,
      };
    }
  }

  const user = path.match(/^\/user\/([^/]+)$/);
  if (user) {
    const userId = oneSegment(user[1]);
    if (userId) {
      return {
        kind: "user",
        userId,
        canonicalPath: `/user/${encodeURIComponent(userId)}`,
      };
    }
  }

  const sessionEdit = path.match(/^\/sessions\/([^/]+)\/edit$/);
  if (sessionEdit && oneSegment(sessionEdit[1])) {
    return { kind: "app", path };
  }

  const session = path.match(/^\/sessions\/([^/]+)$/);
  if (session) {
    const id = oneSegment(session[1]);
    if (id) {
      return {
        kind: "session",
        id,
        canonicalPath: `/sessions/${encodeURIComponent(id)}`,
      };
    }
  }

  const legacySession = path.match(/^\/session\/([^/]+)$/);
  if (legacySession) {
    const id = oneSegment(legacySession[1]);
    if (id) {
      return {
        kind: "session",
        id,
        canonicalPath: `/sessions/${encodeURIComponent(id)}`,
      };
    }
  }

  const maintenance = path.match(/^\/status\/maintenance\/([^/]+)$/);
  if (maintenance) {
    const id = oneSegment(maintenance[1]);
    if (id) {
      return {
        kind: "maintenance",
        id,
        canonicalPath: `/status/maintenance/${encodeURIComponent(id)}`,
      };
    }
  }

  return { kind: "notFound", path };
}
