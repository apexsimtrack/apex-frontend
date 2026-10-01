/**
 * Vercel Routing Middleware. Not part of the Vite bundle Capacitor ships.
 *
 * API host: set APEX_API_BASE_URL on each Vercel deployment to that
 * deployment's API (staging must not point at production). If it is unset,
 * dynamic pages use their static head and the dynamic sitemap is empty.
 *
 * HTML responses are Cache-Control: no-store. Sitemap XML may be cached.
 */
import { applySeoBlock } from "./src/seo/buildHead";
import { shouldBypassMiddleware } from "./src/seo/routeMatch";
import { apiBaseUrl, resolveSeo } from "./src/seo/resolveSeo";

export const config = {
  matcher: [
    "/sitemap-dynamic.xml",
    "/((?!assets/|fonts/|sims/|\\.well-known/|api/|.*\\..*).*)",
  ],
};

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (shouldBypassMiddleware(url.pathname)) {
    return continueRequest();
  }

  const apiBase = apiBaseUrl(process.env.APEX_API_BASE_URL);
  const resolved = await resolveSeo({
    pathname: url.pathname,
    apiBase,
    fetchImpl: async (target, init) => {
      const res = await fetch(target, {
        signal: init?.signal,
        headers: init?.headers,
        redirect: "manual",
      });
      return {
        ok: res.ok,
        status: res.status,
        json: () => res.json() as Promise<unknown>,
      };
    },
    origin: url.origin,
  });

  if (resolved.contentType.startsWith("application/xml")) {
    return new Response(resolved.body, {
      status: resolved.status,
      headers: {
        "content-type": resolved.contentType,
        "cache-control": resolved.cacheControl,
      },
    });
  }

  const shellUrl = new URL("/index.html", url.origin);
  const shell = await fetch(shellUrl);
  const html = applySeoBlock(await shell.text(), resolved.body);
  return new Response(html, {
    status: resolved.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Hand the request back to Vercel static routing. Matcher should make this rare. */
function continueRequest(): Response {
  return new Response(null, {
    headers: { "x-middleware-next": "1" },
  });
}
