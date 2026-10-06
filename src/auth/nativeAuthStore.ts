import {
  KeychainAccess,
  SecureStorage,
} from "@aparajita/capacitor-secure-storage";
import type { AuthSecretStore } from "./authSecretStore";

/** Non-blank prefix required by the plugin. Not synced to iCloud Keychain. */
const KEY_PREFIX = "apex_auth_";

/**
 * iOS Keychain + Android Keystore via @aparajita/capacitor-secure-storage.
 * Loaded only after Capacitor.isNativePlatform() is true.
 * whenUnlockedThisDeviceOnly keeps iOS items out of device backups.
 */
export async function createNativeAuthSecretStore(): Promise<AuthSecretStore> {
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setKeyPrefix(KEY_PREFIX);
  await SecureStorage.setDefaultKeychainAccess(
    KeychainAccess.whenUnlockedThisDeviceOnly,
  );
  return {
    async get(key) {
      const value = await SecureStorage.getItem(key);
      return typeof value === "string" && value.length > 0 ? value : null;
    },
    async set(key, value) {
      await SecureStorage.setItem(key, value);
    },
    async remove(key) {
      await SecureStorage.removeItem(key);
    },
  };
}
