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

/**
 * Validates an optional YYYY-MM-DD date.
 *
 * Checks the calendar, not just the shape: "2026-02-30" matches the pattern
 * but is not a real day, and Date would silently roll it forward to March.
 */
export function validateIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // optional

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return "Use the format YYYY-MM-DD, for example 2026-03-14.";

  const [, year, month, day] = match;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "That date doesn't exist. Check the day and month.";
  }
  // Round-trip: a rolled-over date won't match what was typed.
  const roundTrip =
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day);
  if (!roundTrip) {
    return "That date doesn't exist. Check the day and month.";
  }

  return null;
}

/**
 * Validates an optional whole number, mirroring the bounds in
 * `backend/app/schemas/medication.py`.
 *
 * Rejects rather than reinterprets. "30ish", "2.5" and "1e3" are refused with
 * a message instead of being coerced — these feed a run-out estimate, and a
 * silently-rounded input would produce a confident date built on a number
 * nobody typed. Same rule as the reminder times, which refuse "8am" rather
 * than guessing which end of the day it means.
 */
export function validateWholeNumber(
  value: string,
  { min, max, label }: { min: number; max: number; label: string }
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null; // optional

  if (!/^\d+$/.test(trimmed)) {
    return `Enter ${label} as a whole number, for example ${min || 1}.`;
  }

  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) {
    return `Enter ${label} as a number between ${min} and ${max}.`;
  }

  return null;
}

/** Login accepts any non-empty password so existing accounts stay reachable. */
export function validateLoginPassword(password: string): string | null {
  if (!password) return "Enter your password.";
  return null;
}
