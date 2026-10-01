import { describe, expect, it, vi } from "vitest";
import { escapeHtml } from "./escapeHtml";
import { applySeoBlock, buildHead } from "./buildHead";
import { matchRoute } from "./routeMatch";
import { resolveSeo, type FetchLike } from "./resolveSeo";

const API = "https://api.staging.example";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("escapeHtml", () => {
  it("escapes characters that would break HTML", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("does not leave raw tags in a built head", () => {
    const head = buildHead({
      title: `</title><script>alert(1)</script>`,
      description: `<img onerror="alert(1)">`,
      canonicalPath: "/leaderboards",
      robots: "index, follow",
    });
    expect(head).not.toContain("<script>alert");
    expect(head).toContain("&lt;/title&gt;");
    expect(head).toContain("&lt;img");
  });
});

describe("route matcher", () => {
  it("returns 200 with the marketing title", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const result = await resolveSeo({
      pathname: "/leaderboards",
      apiBase: API,
      fetchImpl,
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain("<title>Leaderboards | Apex</title>");
    expect(result.cacheControl).toBe("no-store");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 200 with noindex for /login", async () => {
    const result = await resolveSeo({
      pathname: "/login",
      apiBase: API,
      fetchImpl: vi.fn<FetchLike>(),
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain('content="noindex, nofollow"');
    expect(result.body).toContain("<title>Sign in | Apex</title>");
  });

  it("returns 404 with noindex for an unknown path", async () => {
    const result = await resolveSeo({
      pathname: "/this-page-does-not-exist",
      apiBase: API,
      fetchImpl: vi.fn<FetchLike>(),
    });
    expect(result.status).toBe(404);
    expect(result.body).toContain('content="noindex, nofollow"');
    expect(matchRoute("/this-page-does-not-exist").kind).toBe("notFound");
  });

  it("treats the legacy discussion path as the same discussion", () => {
    const legacy = matchRoute("/community/discussions/abc");
    const current = matchRoute("/discussion/abc");
    expect(legacy.kind).toBe("discussion");
    expect(current.kind).toBe("discussion");
    if (legacy.kind === "discussion" && current.kind === "discussion") {
      expect(legacy.canonicalPath).toBe(current.canonicalPath);
      expect(legacy.canonicalPath).toBe("/discussion/abc");
    }
  });

  it("omits a private profile bio and display name", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        displayName: "Secret Driver",
        bio: "SECRET_BIO_SHOULD_NOT_LEAK",
        privateProfile: true,
        avatarUrl: "https://cdn.example/avatar.png",
      }),
    );
    const result = await resolveSeo({
      pathname: "/user/user_1",
      apiBase: API,
      fetchImpl,
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain('content="noindex, nofollow"');
    expect(result.body).toContain("<title>Profile | Apex</title>");
    expect(result.body).not.toContain("SECRET_BIO_SHOULD_NOT_LEAK");
    expect(result.body).not.toContain("Secret Driver");
    expect(result.body).not.toContain("cdn.example");
    expect(result.apiUrls.some((url) => url.includes("/api/sessions"))).toBe(
      false,
    );
  });

  it("does not call the session API for a session URL", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error("session API must not be called");
    });
    const result = await resolveSeo({
      pathname: "/sessions/sess_1",
      apiBase: API,
      fetchImpl,
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain("<title>Apex session | Apex</title>");
    expect(result.body).toContain('content="noindex, nofollow"');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.apiUrls).toEqual([]);

    const legacy = await resolveSeo({
      pathname: "/session/sess_1",
      apiBase: API,
      fetchImpl,
    });
    expect(legacy.status).toBe(200);
    expect(legacy.body).toContain('href="https://apexsimtracker.com/sessions/sess_1"');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses a public discussion title and still returns 200", async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      expect(url).not.toContain("/api/sessions");
      return jsonResponse(200, {
        title: "Spa setup notes",
        content: "Brake earlier into Eau Rouge.",
      });
    });
    const result = await resolveSeo({
      pathname: "/discussion/disc_1",
      apiBase: API,
      fetchImpl,
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain("<title>Spa setup notes | Apex</title>");
    expect(result.apiUrls[0]).toContain("/api/community/discussions/disc_1");
  });
});

describe("applySeoBlock", () => {
  it("replaces only the marked block", () => {
    const html = "<head><!--seo:start-->OLD<!--seo:end--><link rel=\"icon\" /></head>";
    const next = applySeoBlock(html, "<!--seo:start-->NEW<!--seo:end-->");
    expect(next).toContain("NEW");
    expect(next).not.toContain("OLD");
    expect(next).toContain('<link rel="icon" />');
  });
});
