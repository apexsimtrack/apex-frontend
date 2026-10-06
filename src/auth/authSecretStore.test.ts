import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupAdminCredentialsForImpersonation } from "@/lib/impersonation";
import {
  APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY,
  APEX_REFRESH_TOKEN_KEY,
  APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY,
  APEX_SESSION_TOKEN_KEY,
  APEX_TOKEN_ADMIN_KEY,
  AUTH_SECRET_KEYS,
  LEGACY_SESSION_ADMIN_BACKUP_KEY,
  hydrateAuthStorage,
  resetAuthStorageForTests,
  type AuthSecretStore,
} from "./authSecretStore";
import {
  clearToken,
  getRefreshToken,
  getSessionToken,
  getToken,
  persistSessionTokenFromAuthPayload,
  setToken,
} from "./token";

function installWebStorage() {
  const localData = new Map<string, string>();
  const sessionData = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => localData.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localData.set(key, value);
    },
    removeItem: (key: string) => {
      localData.delete(key);
    },
  };
  const sessionStorage = {
    getItem: (key: string) => sessionData.get(key) ?? null,
    setItem: (key: string, value: string) => {
      sessionData.set(key, value);
    },
    removeItem: (key: string) => {
      sessionData.delete(key);
    },
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  return { localData, sessionData };
}

function fakeStore(initial?: Record<string, string>): AuthSecretStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
}

describe("auth secret store", () => {
  beforeEach(() => {
    resetAuthStorageForTests();
  });

  afterEach(() => {
    resetAuthStorageForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps website secrets in localStorage", async () => {
    const { localData } = installWebStorage();

    await setToken("jwt-access");
    await persistSessionTokenFromAuthPayload({
      sessionToken: "sid",
      refreshToken: "refresh-1",
    });

    expect(localData.get("apex_token")).toBe("jwt-access");
    expect(localData.get(APEX_SESSION_TOKEN_KEY)).toBe("sid");
    expect(localData.get(APEX_REFRESH_TOKEN_KEY)).toBe("refresh-1");
    expect(getToken()).toBe("jwt-access");
    expect(getSessionToken()).toBe("sid");
    expect(getRefreshToken()).toBe("refresh-1");
  });

  it("clears website secrets, admin backups, and the legacy session key", async () => {
    const { localData, sessionData } = installWebStorage();
    localData.set("apex_token", "jwt");
    localData.set(APEX_SESSION_TOKEN_KEY, "sid");
    localData.set(APEX_REFRESH_TOKEN_KEY, "refresh");
    localData.set(APEX_TOKEN_ADMIN_KEY, "admin-jwt");
    sessionData.set(LEGACY_SESSION_ADMIN_BACKUP_KEY, "legacy");

    await clearToken();

    for (const key of AUTH_SECRET_KEYS) {
      expect(localData.has(key)).toBe(false);
    }
    expect(sessionData.has(LEGACY_SESSION_ADMIN_BACKUP_KEY)).toBe(false);
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it("copies WebView secrets into the secure store once, then deletes them", async () => {
    const { localData, sessionData } = installWebStorage();
    localData.set("apex_token", "jwt");
    localData.set(APEX_SESSION_TOKEN_KEY, "sid");
    localData.set(APEX_REFRESH_TOKEN_KEY, "refresh");
    localData.set(APEX_TOKEN_ADMIN_KEY, "admin-jwt");
    localData.set(APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY, "admin-sid");
    localData.set(APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY, "admin-refresh");
    localData.set("apex_device_id", "device-stays");
    sessionData.set(LEGACY_SESSION_ADMIN_BACKUP_KEY, "legacy");
    const store = fakeStore();

    await hydrateAuthStorage({ store });

    expect(getToken()).toBe("jwt");
    expect(getSessionToken()).toBe("sid");
    expect(getRefreshToken()).toBe("refresh");
    expect(store.data.get("apex_token")).toBe("jwt");
    expect(store.data.get(APEX_TOKEN_ADMIN_KEY)).toBe("admin-jwt");
    expect(store.data.get(APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY)).toBe(
      "admin-refresh",
    );
    for (const key of AUTH_SECRET_KEYS) {
      expect(localData.has(key)).toBe(false);
    }
    expect(localData.get("apex_device_id")).toBe("device-stays");
    expect(sessionData.has(LEGACY_SESSION_ADMIN_BACKUP_KEY)).toBe(false);
  });

  it("keeps an existing secure-store session and still deletes WebView copies", async () => {
    const { localData } = installWebStorage();
    localData.set("apex_token", "webview-jwt");
    const store = fakeStore({ apex_token: "keystore-jwt" });

    await hydrateAuthStorage({ store });

    expect(getToken()).toBe("keystore-jwt");
    expect(store.data.get("apex_token")).toBe("keystore-jwt");
    expect(localData.has("apex_token")).toBe(false);
  });

  it("writes native secrets to the store and not WebView localStorage", async () => {
    const { localData } = installWebStorage();
    const store = fakeStore();
    await hydrateAuthStorage({ store });

    await setToken("new-jwt");
    await persistSessionTokenFromAuthPayload({ refreshToken: "new-refresh" });
    await backupAdminCredentialsForImpersonation();

    expect(store.data.get("apex_token")).toBe("new-jwt");
    expect(store.data.get(APEX_REFRESH_TOKEN_KEY)).toBe("new-refresh");
    expect(store.data.get(APEX_TOKEN_ADMIN_KEY)).toBe("new-jwt");
    expect(localData.has("apex_token")).toBe(false);
    expect(localData.has(APEX_TOKEN_ADMIN_KEY)).toBe(false);
    expect(localData.has(APEX_REFRESH_TOKEN_KEY)).toBe(false);

    await clearToken();
    expect(getToken()).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("fills missing secure-store keys from the WebView one at a time", async () => {
    const { localData } = installWebStorage();
    localData.set("apex_token", "webview-jwt");
    localData.set(APEX_SESSION_TOKEN_KEY, "webview-sid");
    localData.set(APEX_REFRESH_TOKEN_KEY, "webview-refresh");
    const store = fakeStore({ apex_token: "keystore-jwt" });

    await hydrateAuthStorage({ store });

    expect(store.data.get("apex_token")).toBe("keystore-jwt");
    expect(store.data.get(APEX_SESSION_TOKEN_KEY)).toBe("webview-sid");
    expect(store.data.get(APEX_REFRESH_TOKEN_KEY)).toBe("webview-refresh");
    expect(getToken()).toBe("keystore-jwt");
    expect(getRefreshToken()).toBe("webview-refresh");
    expect(localData.has("apex_token")).toBe(false);
    expect(localData.has(APEX_SESSION_TOKEN_KEY)).toBe(false);
    expect(localData.has(APEX_REFRESH_TOKEN_KEY)).toBe(false);
  });

  it("stops migration when a secure-store write throws and keeps uncopied WebView keys", async () => {
    const { localData } = installWebStorage();
    localData.set("apex_token", "webview-jwt");
    localData.set(APEX_SESSION_TOKEN_KEY, "webview-sid");
    localData.set(APEX_REFRESH_TOKEN_KEY, "webview-refresh");
    const store = fakeStore({ apex_token: "keystore-jwt" });
    let sets = 0;
    store.set = async (key, value) => {
      sets += 1;
      if (sets === 2) throw new Error("secure store write failed");
      store.data.set(key, value);
    };

    await hydrateAuthStorage({ store });

    expect(store.data.get(APEX_SESSION_TOKEN_KEY)).toBe("webview-sid");
    expect(store.data.has(APEX_REFRESH_TOKEN_KEY)).toBe(false);
    expect(localData.has(APEX_SESSION_TOKEN_KEY)).toBe(false);
    expect(localData.get(APEX_REFRESH_TOKEN_KEY)).toBe("webview-refresh");
    expect(getRefreshToken()).toBeNull();
    expect(getToken()).toBe("keystore-jwt");
  });

  it("does not fall back to localStorage when the native store cannot be opened", async () => {
    const { localData } = installWebStorage();
    for (const key of AUTH_SECRET_KEYS) {
      localData.set(key, `kept-${key}`);
    }

    await hydrateAuthStorage({
      openStore: async () => {
        throw new Error("plugin missing");
      },
    });

    expect(getToken()).toBeNull();
    expect(getSessionToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    for (const key of AUTH_SECRET_KEYS) {
      expect(localData.get(key)).toBe(`kept-${key}`);
    }

    await expect(setToken("new-jwt")).rejects.toThrow(
      /secure storage is unavailable/i,
    );
    await clearToken();
    for (const key of AUTH_SECRET_KEYS) {
      expect(localData.get(key)).toBe(`kept-${key}`);
    }
    expect(getToken()).toBeNull();
  });

  it("does not load the native plugin on the website", async () => {
    const { localData } = installWebStorage();
    localData.set("apex_token", "web-jwt");
    const plugin = await import("./nativeAuthStore");
    const create = vi.spyOn(plugin, "createNativeAuthSecretStore");

    await hydrateAuthStorage();

    expect(create).not.toHaveBeenCalled();
    expect(getToken()).toBe("web-jwt");
    create.mockRestore();
  });
});
