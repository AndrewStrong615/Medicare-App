/**
 * Where the emergency card is kept on iOS and Android.
 *
 * Metro picks this over `emergencyCardStorage.web.ts` for native builds. Both
 * expose the same three functions, so `emergencyCard.ts` needs no platform
 * knowledge — the same shape as `tokenStorage`, `labelScanner`,
 * `notificationService` and `locationService`.
 *
 * ## Why the keystore, and why this is not `tokenStorage`
 *
 * The card holds allergies, conditions and a blood type: health data about
 * one identifiable person, so it goes in Keychain/Keystore rather than a
 * plain file, with the same `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility
 * the session token uses — out of iCloud Keychain sync, out of encrypted
 * device backups.
 *
 * It is a *separate* store from the token on purpose. Signing out clears the
 * token; it must not clear the card, because the card is the one screen that
 * has to work when nothing else does.
 *
 * ## ⛔ Values here must stay small
 *
 * Android's SecureStore is backed by SharedPreferences with an encrypted
 * value, and warns above ~2048 bytes. Everything written through here is
 * capped by `emergencyCard.ts` for exactly that reason. Do not add an
 * uncapped list.
 */

import * as SecureStore from "expo-secure-store";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readRaw(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    // Keystore unavailable (locked device, a build without the native
    // module). An unreadable card is an empty card, never a crash.
    return null;
  }
}

export async function writeRaw(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, OPTIONS);
  } catch {
    // Nothing better to do. The editor reports the failure to the user
    // rather than pretending the card was saved — see `emergencyCard.ts`.
    throw new Error("storage-unavailable");
  }
}

export async function removeRaw(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, OPTIONS);
  } catch {
    // Already gone, or the store is unreachable. Either way there is nothing
    // left for the caller to do.
  }
}
