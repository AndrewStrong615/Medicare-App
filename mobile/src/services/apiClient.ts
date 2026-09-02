/**
 * Shared request plumbing for the appointment feature's services.
 *
 * `medicationService` and `intakeService` each carry their own copy of the
 * request/error handling. Rather than adding a third and fourth copy, the
 * appointment and provider services share this one. Those two are otherwise
 * left alone — they are covered by their own tests.
 *
 * The exception is where the backend lives and whether it can be talked to in
 * the clear: all four services now import that from `baseUrl.ts`. They used to
 * each answer it themselves, they disagreed, and the disagreement was a bug —
 * sign-in had no transport check while everything else refused to run on a
 * LAN. See that module.
 */

import { API_BASE_URL, baseUrlIsTransportSafe } from "@/services/baseUrl";

import { getToken, logout } from "@/services/authService";

export { API_BASE_URL };

const OFFLINE_MESSAGE =
  "Can't reach the MedHelp server. Check your internet connection and try again.";

export class ApiError extends Error {
  readonly isNetworkError: boolean;
  readonly isAuthError: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options?: {
      isNetworkError?: boolean;
      isAuthError?: boolean;
      status?: number | null;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isAuthError = options?.isAuthError ?? false;
    this.status = options?.status ?? null;
  }
}

function assertSecureBaseUrl(): void {
  // https anywhere, or plain http only to loopback/LAN. See `baseUrl.ts` —
  // the previous `__DEV__` test refused an exported build talking to a server
  // on your own network, which is exactly how this app is run on a phone.
  if (!baseUrlIsTransportSafe()) {
    throw new ApiError(
      "MedHelp is not configured securely and can't continue. Please update the app."
    );
  }
}

function readDetail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const first = detail.find(
      (item) => typeof item === "object" && item !== null && "msg" in item
    ) as { msg?: unknown } | undefined;
    if (typeof first?.msg === "string") {
      return first.msg.replace(/^Value error,\s*/i, "");
    }
  }
  return null;
}

export async function apiRequest(
  path: string,
  init: RequestInit & { fallbackMessage: string }
): Promise<unknown> {
  assertSecureBaseUrl();

  const token = getToken();
  if (!token) {
    throw new ApiError("Please sign in again to continue.", { isAuthError: true });
  }

  const { fallbackMessage, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(rest.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, { isNetworkError: true });
  }

  if (response.status === 204) return null;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Status decides the outcome below.
  }

  if (!response.ok) {
    if (response.status === 401) {
      // The token the server just refused is worthless, so drop it here
      // rather than leaving a dead session to be restored on the next launch.
      void logout();
      throw new ApiError("Your session has expired. Please sign in again.", {
        isAuthError: true,
        status: 401,
      });
    }
    throw new ApiError(readDetail(body) ?? fallbackMessage, {
      status: response.status,
    });
  }

  return body;
}
