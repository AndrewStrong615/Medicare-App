/**
 * Shared failure vocabulary for label scanning.
 *
 * Extracted so the native and web scanners can throw the same errors and the
 * screen can handle them identically. Only one implementation is ever bundled
 * for a given platform, so `instanceof ScanError` works either way.
 */

export type ScanFailure =
  | "unavailable"
  | "permission-denied"
  | "cancelled"
  | "unreadable"
  | "failed";

export class ScanError extends Error {
  readonly reason: ScanFailure;

  constructor(reason: ScanFailure, message: string) {
    super(message);
    this.name = "ScanError";
    this.reason = reason;
  }
}

export type ImageSource = "camera" | "library";

/**
 * Every failure message must leave the user somewhere to go. A scan that
 * fails is a shortcut that did not pay off, not a wall — manual entry is
 * always still there, and the copy has to say so.
 */
export const MANUAL_FALLBACK = "You can still type the details in yourself.";
