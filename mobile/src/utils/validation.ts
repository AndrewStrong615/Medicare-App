/**
 * Client-side checks mirroring the rules the API enforces in
 * backend/app/schemas/user.py. These exist to give immediate, specific
 * feedback — the server remains the authority.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

// Deliberately permissive: the server does full RFC validation. This only
// catches obviously-incomplete entries before spending a network round-trip.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function byteLength(value: string): number {
  // Matches the server's UTF-8 byte count, so a password of multi-byte
  // characters is measured the same way on both sides.
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Enter your email address.";
  if (!LOOKS_LIKE_EMAIL.test(trimmed)) {
    return "That doesn't look like an email address. Check for typos.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (byteLength(password) > MAX_PASSWORD_BYTES) {
    return `That password is too long. Use ${MAX_PASSWORD_BYTES} characters or fewer.`;
  }
  return null;
}

/** Login accepts any non-empty password so existing accounts stay reachable. */
export function validateLoginPassword(password: string): string | null {
  if (!password) return "Enter your password.";
  return null;
}
