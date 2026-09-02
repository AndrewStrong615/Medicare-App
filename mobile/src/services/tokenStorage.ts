/**
 * Where the session token is kept between launches, on iOS and Android.
 *
 * Metro picks this over `tokenStorage.web.ts` for native builds. Both expose
 * the same three functions, so `authService` needs no platform knowledge.
 *
 * The token is a bearer credential for one person's medications, appointments
 * and symptom assessments, so it goes in the platform keystore — Keychain on
 * iOS, Keystore on Android — and never in a plain file.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` is deliberate on both counts:
 *
 * - **This device only** keeps the token out of iCloud Keychain sync and out
 *   of encrypted device backups, so a credential for health data does not
 *   quietly acquire copies on hardware nobody signed in on.
 * - **When unlocked** means a locked phone cannot yield it.
 *
 * Every call swallows its failure and degrades to a session that lasts as
 * long as the process. Losing the store is a reason to sign in again; it is
 * never a reason to fail a sign-in that otherwise worked.
 */

import * as SecureStore from "expo-secure-store";

// SecureStore keys accept alphanumerics, ".", "-" and "_" only.
const STORAGE_KEY = "medhelp_session_token";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function saveToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, token, OPTIONS);
  } catch {
    // Keystore unavailable (no biometrics hardware, locked device, a build
    // without the native module). The in-memory token still works for this
    // run of the app.
  }
}

export async function loadToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY, OPTIONS);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY, OPTIONS);
  } catch {
    // Nothing better to do; the caller has already forgotten the token.
  }
}
