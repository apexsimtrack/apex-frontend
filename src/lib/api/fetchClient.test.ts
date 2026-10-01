import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APEX_REFRESH_TOKEN_KEY, APEX_SESSION_TOKEN_KEY } from "@/auth/token";
import { APEX_DEVICE_ID_KEY } from "@/auth/deviceId";
import { ApiError } from "./errors";
import { buildApiAuthHeaders, fetchApi } from "./fetchClient";

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("buildApiAuthHeaders", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns Bearer and X-Apex-Session when both tokens are stored", () => {
    storage.set("apex_token", "jwt-access");
    storage.set(APEX_SESSION_TOKEN_KEY, "opaque-session-id");

    expect(buildApiAuthHeaders()).toEqual({
      Authorization: "Bearer jwt-access",
      "X-Apex-Session": "opaque-session-id",
      "X-Apex-Device-Id": expect.any(String),
      "X-Request-Id": expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });

  it("omits Authorization when only session token is stored", () => {
    storage.set(APEX_SESSION_TOKEN_KEY, "opaque-only");

    const headers = buildApiAuthHeaders();
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Apex-Session"]).toBe("opaque-only");
  });

  it("reuses existing device id from localStorage", () => {
    storage.set(APEX_DEVICE_ID_KEY, "device-abc");

    expect(buildApiAuthHeaders()["X-Apex-Device-Id"]).toBe("device-abc");
  });
});

describe("fetchApi token refresh", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes the access token and retries the original request once", async () => {
    storage.set("apex_token", "old-jwt");
    storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-1");
    storage.set(APEX_DEVICE_ID_KEY, "device-abc");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { token: "new-jwt", refreshToken: "refresh-2" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApi<{ ok: boolean }>("GET", "/api/sessions"),
    ).resolves.toEqual({ ok: true });
    expect(storage.get("apex_token")).toBe("new-jwt");
    expect(storage.get(APEX_REFRESH_TOKEN_KEY)).toBe("refresh-2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryAuth = (fetchMock.mock.calls[2][1] as RequestInit)
      .headers as Record<string, string>;
    expect(retryAuth.Authorization).toBe("Bearer new-jwt");
  });

  it("does not refresh when skipAuthExpiredCheck is set", async () => {
    storage.set("apex_token", "old-jwt");
    storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { message: "Invalid credentials" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchApi("POST", "/api/auth/login", { email: "a@b.c" }, true),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.get("apex_token")).toBe("old-jwt");
  });

  it("clears tokens when refresh fails", async () => {
    storage.set("apex_token", "old-jwt");
    storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(
        jsonResponse(401, { message: "Invalid or expired refresh token" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("GET", "/api/sessions")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(storage.get("apex_token")).toBeUndefined();
    expect(storage.get(APEX_REFRESH_TOKEN_KEY)).toBeUndefined();
  });

  it("uses credentials rotated by another tab instead of refreshing again", async () => {
    storage.set("apex_token", "old-jwt");
    storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", {
      locks: {
        request: vi.fn(
          async (_name: string, callback: () => Promise<unknown>) => {
            storage.set("apex_token", "winner-jwt");
            storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-2");
            return callback();
          },
        ),
      },
    });

    await expect(
      fetchApi<{ ok: boolean }>("GET", "/api/sessions"),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryAuth = (fetchMock.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(retryAuth.Authorization).toBe("Bearer winner-jwt");
    expect(storage.get(APEX_REFRESH_TOKEN_KEY)).toBe("refresh-2");
  });

  it("preserves tokens when refresh fails because the connection is offline", async () => {
    storage.set("apex_token", "old-jwt");
    storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("GET", "/api/sessions")).rejects.toMatchObject({
      status: 0,
    });
    expect(storage.get("apex_token")).toBe("old-jwt");
    expect(storage.get(APEX_REFRESH_TOKEN_KEY)).toBe("refresh-1");
  });

  it("preserves tokens when refresh fails with a server error", async () => {
    storage.set("apex_token", "old-jwt");
    storage.set(APEX_REFRESH_TOKEN_KEY, "refresh-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "expired" }))
      .mockResolvedValueOnce(jsonResponse(503, { message: "Unavailable" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("GET", "/api/sessions")).rejects.toMatchObject({
      status: 503,
    });
    expect(storage.get("apex_token")).toBe("old-jwt");
    expect(storage.get(APEX_REFRESH_TOKEN_KEY)).toBe("refresh-1");
  });
});

describe("fetchApi request id", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a 16-hex X-Request-Id and prefers requestId from the error body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        400,
        { message: "nope", requestId: "aabbccddeeff0011" },
        { "x-request-id": "0011223344556677" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchApi("GET", "/api/sessions")).rejects.toMatchObject({
      status: 400,
      message: "nope",
      requestId: "aabbccddeeff0011",
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["X-Request-Id"]).toMatch(/^[0-9a-f]{16}$/);
  });

  it("uses the response header when the body has no valid request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(500, { message: "An unexpected error occurred", requestId: "nope" }, {
          "x-request-id": "ff00ff00ff00ff00",
        }),
      ),
    );

    await expect(fetchApi("POST", "/api/auth/login", { email: "a@b.c" }, true)).rejects.toMatchObject({
      requestId: "ff00ff00ff00ff00",
    });
  });

  it("does not attach an id when the connection fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await fetchApi("GET", "/api/sessions").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).requestId).toBeUndefined();
  });
});
