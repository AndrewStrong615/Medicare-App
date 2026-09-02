/**
 * Auth service. Talks to the FastAPI /auth endpoints and owns the session
 * token for the whole app.
 *
 * ## The token outlives the page, and only just
 *
 * It used to live in a module variable and nowhere else, so a browser refresh
 * — or anything else that restarted the JS bundle — threw the session away
 * and dropped the user back on the sign-in screen mid-task. It is now also
 * handed to `tokenStorage`, which is platform-split: the OS keystore on iOS
 * and Android, `sessionStorage` in a browser. Read that module for what each
 * one does and does not survive.
 *
 * The in-memory copy is still the one every request reads, so `getToken()`
 * stays synchronous for its callers. Storage is consulted once, by
 * `restoreSession()` at startup.
 *
 * Still missing, and still a Known Gap in CLAUDE.md: there is no refresh flow
 * and no revocation. A restored token is valid until it expires and cannot be
 * recalled before then.
 */

import { API_BASE_URL, baseUrlIsTransportSafe } from "@/services/baseUrl";
import { clearToken, loadToken, saveToken } from "@/services/tokenStorage";
import { accessTokenIsExpired } from "@/utils/jwt";

let inMemoryToken: string | null = null;

export interface AuthResult {
  accessToken: string;
}

/**
 * Carries a message already phrased for the person reading it. `isNetworkError`
 * separates "we never reached the server" from "the server said no", because
 * those need opposite things from the user: retry vs. correct your details.
 */
export class AuthError extends Error {
  readonly isNetworkError: boolean;

  constructor(message: string, options?: { isNetworkError?: boolean }) {
    super(message);
    this.name = "AuthError";
    this.isNetworkError = options?.isNetworkError ?? false;
  }
}

const OFFLINE_MESSAGE =
  "Can't reach the MedHelp server. Check your internet connection and try again.";

/**
 * FastAPI returns `detail` as a string for raised HTTPExceptions but as a list
 * of per-field objects for request-validation (422) failures. Reading it
 * naively renders "[object Object]" to the user, so pull out a sentence.
 */
function readErrorDetail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === "object" && item !== null
          ? (item as { msg?: unknown }).msg
          : null
      )
      .filter((msg): msg is string => typeof msg === "string" && msg.trim().length > 0)
      // Pydantic prefixes messages with "Value error, "; drop that noise.
      .map((msg) => msg.replace(/^Value error,\s*/i, ""));

    if (messages.length > 0) return messages.join(" ");
  }

  return null;
}

/**
 * The one call carrying a password was the one call with no transport check at
 * all — every other service had one and this did not. See `baseUrl.ts`.
 */
function assertSecureBaseUrl(): void {
  if (!baseUrlIsTransportSafe()) {
    throw new AuthError(
      "MedHelp is not configured securely and can't sign you in. Please update the app."
    );
  }
}

async function postJson(
  path: string,
  payload: Record<string, unknown>,
  fallbackMessage: string
): Promise<unknown> {
  assertSecureBaseUrl();

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // fetch rejects only when the request never completed: server down, DNS
    // failure, connection dropped, or a blocked cross-origin request.
    throw new AuthError(OFFLINE_MESSAGE, { isNetworkError: true });
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body (proxy error page, empty 500) is not fatal on its own —
    // the status code below still decides the outcome.
  }

  if (!response.ok) {
    throw new AuthError(readErrorDetail(body) ?? fallbackMessage);
  }

  return body;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const body = await postJson(
    "/auth/login",
    { email, password },
    "That email and password didn't match. Please check them and try again."
  );

  const accessToken = (body as { access_token?: unknown })?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    // A 200 without a usable token means the client and server disagree about
    // the response shape; failing here beats storing `undefined` as the token.
    throw new AuthError("Signed in, but the server didn't return a valid session. Please try again.");
  }

  inMemoryToken = accessToken;
  // Awaited so a caller navigating onward can rely on the session having been
  // written. A storage failure is swallowed inside `saveToken` rather than
  // thrown here: being unable to persist a session is not a failed sign-in.
  await saveToken(accessToken);
  return { accessToken };
}

export async function signup(email: string, password: string): Promise<void> {
  await postJson(
    "/auth/signup",
    { email, password },
    "We couldn't create your account. Please try again."
  );
}

export function getToken(): string | null {
  return inMemoryToken;
}

/**
 * Brings back a session written by an earlier run of the app, if there is one
 * and it is still usable. Called once, at startup, before the navigator
 * decides which screen to open on.
 *
 * Returns whether the app now holds a token — not whether the server will
 * accept it. Only the server can say that, so a token this app cannot read is
 * restored and allowed to fail as a 401 rather than being second-guessed
 * here. A token that readably expired is dropped instead, because sending it
 * can only produce "your session has expired" after the user has already been
 * shown a signed-in screen.
 */
export async function restoreSession(): Promise<boolean> {
  const stored = await loadToken();

  if (!stored) {
    inMemoryToken = null;
    return false;
  }

  if (accessTokenIsExpired(stored)) {
    inMemoryToken = null;
    await clearToken();
    return false;
  }

  inMemoryToken = stored;
  return true;
}

/**
 * Forgets the session everywhere. Memory is cleared synchronously, so nothing
 * can read a stale token while the storage write is still in flight; the
 * returned promise is for callers that want to wait for the store to empty.
 *
 * This does not invalidate the token server-side — there is no revocation.
 */
export function logout(): Promise<void> {
  inMemoryToken = null;
  return clearToken();
}
