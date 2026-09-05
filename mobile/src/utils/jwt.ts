/**
 * Just enough JWT reading to answer one question: is this token already dead?
 *
 * The server remains the only authority on whether a token is valid — it
 * verifies the signature, the issuer, the audience and the expiry, and this
 * cannot. The single use for reading `exp` here is to avoid restoring a
 * session that is certain to fail, which would land someone on the home
 * screen only to be told their session expired the moment they tapped
 * anything.
 *
 * So the rule is deliberately one-directional: a token is dropped only when
 * we can positively read an expiry that has passed. Anything unreadable is
 * kept and sent, and the server decides. Being unable to parse a token is not
 * evidence that it is bad.
 *
 * The base64url decoding is done by hand rather than through `atob`, which is
 * a browser global that React Native has only recently started shipping.
 */

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeBase64Url(input: string): string | null {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const char of input) {
    // Standard base64 padding and its url-safe absence both end the payload.
    if (char === "=") break;
    const index = BASE64URL.indexOf(char);
    if (index === -1) return null;

    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }

  return out;
}

/** The `exp` claim in milliseconds, or null if it cannot be read. */
export function accessTokenExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const payload = decodeBase64Url(parts[1]);
  if (!payload) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof claims !== "object" || claims === null) return null;
  const exp = (claims as { exp?: unknown }).exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;

  // `exp` is seconds since the epoch, per RFC 7519.
  return exp * 1000;
}

/**
 * True only when the token says, readably, that it has already expired.
 * Unreadable tokens are reported as not expired on purpose — see above.
 */
export function accessTokenIsExpired(token: string, now: number = Date.now()): boolean {
  const expiresAt = accessTokenExpiry(token);
  if (expiresAt === null) return false;
  return expiresAt <= now;
}
