/**
 * Settings that belong to the device rather than to the account.
 *
 * ## Why these are not on the server
 *
 * There is no user-settings table, and adding one for this would put a row
 * about a named person's medication habits into a database with no encryption
 * at rest — for a number that only ever changes when a notification fires on
 * this device. The lead time is a local preference, so it lives locally, in
 * the same store as the emergency card (`deviceStorage`).
 *
 * The consequence is stated where it matters: the setting does not follow the
 * user to another phone or browser, and each device keeps its own.
 *
 * Every read is total. A missing, corrupt, or out-of-range value produces the
 * default rather than an error — a settings read must never be able to stop a
 * screen rendering.
 */

import { readRaw, writeRaw } from "@/services/deviceStorage";

const REFILL_LEAD_DAYS_KEY = "medhelp_refill_lead_days";

/**
 * Days before the estimated run-out that a refill alert fires.
 *
 * Three is a working default rather than a clinical one: long enough to
 * contact a prescriber or pharmacy, short enough that the estimate has not
 * drifted far. Kept in step with `REFILL_LEAD_DAYS_DEFAULT` in
 * `backend/app/services/refill_forecast.py`, which is the authority — the
 * server does the arithmetic and this is what the client asks it for.
 */
export const REFILL_LEAD_DAYS_DEFAULT = 3;
export const REFILL_LEAD_DAYS_MIN = 1;
export const REFILL_LEAD_DAYS_MAX = 30;

/** The choices the UI offers. Any value in range is accepted on the way in. */
export const REFILL_LEAD_DAY_CHOICES = [1, 3, 5, 7, 14] as const;

export function clampLeadDays(value: number): number {
  if (!Number.isFinite(value)) return REFILL_LEAD_DAYS_DEFAULT;
  return Math.max(
    REFILL_LEAD_DAYS_MIN,
    Math.min(REFILL_LEAD_DAYS_MAX, Math.round(value))
  );
}

export async function getRefillLeadDays(): Promise<number> {
  const raw = await readRaw(REFILL_LEAD_DAYS_KEY);
  if (!raw) return REFILL_LEAD_DAYS_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? REFILL_LEAD_DAYS_DEFAULT : clampLeadDays(parsed);
}

/**
 * Returns the value actually stored, which is the clamped one.
 *
 * Never throws. A refused write costs the user a preference that resets to
 * the default; it must not cost them the screen they set it on.
 */
export async function setRefillLeadDays(value: number): Promise<number> {
  const clamped = clampLeadDays(value);
  try {
    await writeRaw(REFILL_LEAD_DAYS_KEY, String(clamped));
  } catch {
    // See above.
  }
  return clamped;
}
