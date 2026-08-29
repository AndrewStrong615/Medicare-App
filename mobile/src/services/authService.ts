/**
 * Placeholder auth service. Talks to the FastAPI /auth endpoints and holds
 * the token in memory only — no persisted/secure storage yet. Before this
 * ships, swap the in-memory token for expo-secure-store (or equivalent) and
 * add token refresh handling.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

async function postJson(
  path: string,
  payload: Record<string, unknown>,
  fallbackMessage: string
): Promise<unknown> {
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

export function logout(): void {
  inMemoryToken = null;
}
