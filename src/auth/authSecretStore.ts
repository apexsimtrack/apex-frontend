/**
 * Auth secret adapter.
 * Website: synchronous localStorage (unchanged keys).
 * iOS/Android: in-memory cache after one secure-store read. Request headers
 * never touch Keychain/Keystore. The native plugin is loaded only when
 * Capacitor reports a native platform.
 */

export const TOKEN_KEY = "apex_token";
export const APEX_SESSION_TOKEN_KEY = "apex_session_token";
export const APEX_REFRESH_TOKEN_KEY = "apex_refresh_token";
export const APEX_TOKEN_ADMIN_KEY = "apex_token_admin";
export const APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY = "apex_session_token_admin";
export const APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY = "apex_refresh_token_admin";
export const LEGACY_SESSION_ADMIN_BACKUP_KEY = "apex_token_admin_backup";

export const AUTH_SECRET_KEYS = [
  TOKEN_KEY,
  APEX_SESSION_TOKEN_KEY,
  APEX_REFRESH_TOKEN_KEY,
  APEX_TOKEN_ADMIN_KEY,
  APEX_SESSION_TOKEN_ADMIN_BACKUP_KEY,
  APEX_REFRESH_TOKEN_ADMIN_BACKUP_KEY,
] as const;

export type AuthSecretStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const SECURE_STORAGE_UNAVAILABLE_MESSAGE =
  "Secure storage is unavailable on this device. Sign-in cannot be saved until the app is updated.";

type Mode = "web" | "native";

let mode: Mode = "web";
let memory = new Map<string, string>();
let store: AuthSecretStore | null = null;
const pending = new Map<string, string | null>();

export function readAuthSecret(key: string): string | null {
  if (mode === "native") return memory.get(key) ?? null;
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

function scrubWebSecret(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

function scrubLegacySessionBackup(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(LEGACY_SESSION_ADMIN_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

/** Apply a secret immediately. Native persistence is flushed separately. */
export function stageAuthSecret(key: string, value: string | null): void {
  const stored = value && value.length > 0 ? value : null;
  if (mode === "native") {
    if (!store) {
      // Plugin failed to open. Do not read or delete leftover WebView copies.
      if (stored == null) return;
      throw new Error(SECURE_STORAGE_UNAVAILABLE_MESSAGE);
    }
    if (stored == null) memory.delete(key);
    else memory.set(key, stored);
    scrubWebSecret(key);
    pending.set(key, stored);
    return;
  }
  if (typeof localStorage === "undefined") return;
  if (stored == null) localStorage.removeItem(key);
  else localStorage.setItem(key, stored);
}

export async function flushAuthSecrets(): Promise<void> {
  if (mode !== "native" || !store || pending.size === 0) {
    pending.clear();
    return;
  }
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, value] of batch) {
    if (value == null) await store.remove(key);
    else await store.set(key, value);
  }
}

function readWebSecret(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key);
  return raw && raw.length > 0 ? raw : null;
}

async function adoptNativeStore(next: AuthSecretStore): Promise<void> {
  mode = "native";
  store = next;
  memory = new Map();
  pending.clear();

  for (const key of AUTH_SECRET_KEYS) {
    const stored = await next.get(key);
    if (stored) {
      memory.set(key, stored);
      scrubWebSecret(key);
      continue;
    }
    const legacy = readWebSecret(key);
    if (!legacy) continue;
    await next.set(key, legacy);
    memory.set(key, legacy);
    scrubWebSecret(key);
  }
  scrubLegacySessionBackup();
}

function enterUnavailableNative(): void {
  mode = "native";
  store = null;
  memory = new Map();
  pending.clear();
}

/**
 * Open the native store and migrate. A missing plugin stays native and does not
 * touch WebView secrets. A failed copy stops without deleting keys not yet stored.
 */
async function openAndAdopt(
  factory: () => Promise<AuthSecretStore>,
): Promise<void> {
  try {
    await adoptNativeStore(await factory());
  } catch {
    if (mode === "native" && store) {
      console.error(
        "[auth] Could not finish moving credentials into secure storage.",
      );
      return;
    }
    console.error("[auth] Secure storage is unavailable.");
    enterUnavailableNative();
  }
}

/**
 * Load native secrets once before the first render. No-op on the website.
 * Pass `store` in tests to simulate the OS store without the native plugin.
 */
export async function hydrateAuthStorage(options?: {
  store?: AuthSecretStore;
  /** Test hook: treat the platform as native and open the store with this factory. */
  openStore?: () => Promise<AuthSecretStore>;
}): Promise<void> {
  if (options?.store) {
    await openAndAdopt(async () => options.store as AuthSecretStore);
    return;
  }
  if (options?.openStore) {
    await openAndAdopt(options.openStore);
    return;
  }

  let native = false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }
  if (!native) {
    mode = "web";
    store = null;
    memory = new Map();
    pending.clear();
    return;
  }

  await openAndAdopt(async () => {
    const { createNativeAuthSecretStore } = await import("./nativeAuthStore");
    return createNativeAuthSecretStore();
  });
}

export function resetAuthStorageForTests(): void {
  mode = "web";
  store = null;
  memory = new Map();
  pending.clear();
}
