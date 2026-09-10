/**
 * Turning a run-out estimate into a moment to notify, shared by both
 * platforms and by the screens.
 *
 * Pure functions over dates. No I/O and no platform APIs, which is what makes
 * the awkward cases — an estimate already in the past, a lead time longer than
 * the supply — testable without a device. Same shape and same reasons as
 * `reminderTiming.ts`.
 *
 * ## ⛔ Every alert says it is an estimate
 *
 * The notification body is fixed here rather than in either platform file, so
 * there is one place the wording lives and one place to change it. It says
 * "estimate" because the projection assumes each dose is taken exactly on
 * schedule and MedHelp does not track doses — see
 * `backend/app/services/refill_forecast.py`.
 *
 * It must never say a dose was missed, or imply MedHelp knows how much is
 * actually left. It knows what the user last counted and no more.
 */

import type { Medication } from "@/services/medicationService";

/** The hour a refill alert fires, local time. */
export const ALERT_HOUR = 9;

export interface RefillAlert {
  medicationId: string;
  medicationName: string;
  /** When to fire, as a local wall-clock instant. */
  fireAt: Date;
  /** Ready-made notification text. See the module note. */
  title: string;
  body: string;
}

/**
 * The moment an alert for this run-out date should fire.
 *
 * `leadDays` before the run-out date, at `ALERT_HOUR` local time. Returns null
 * when that moment has already gone by: a notification cannot be scheduled
 * into the past, and re-firing one every time a screen loads would be worse
 * than not firing it. The on-screen badge is what covers the passed case —
 * the same division of labour the reminders screen already relies on, where
 * the list is always correct and the notification is the bonus.
 */
export function alertMoment(
  runOutOn: string,
  leadDays: number,
  now: Date = new Date()
): Date | null {
  // Parsed as local midnight, not UTC. `new Date("2026-09-18")` is UTC by
  // spec, which lands on the previous evening west of Greenwich and would
  // move the alert a day for most of the Americas.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(runOutOn);
  if (!match) return null;

  const fireAt = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    ALERT_HOUR,
    0,
    0,
    0
  );
  fireAt.setDate(fireAt.getDate() - leadDays);

  return fireAt.getTime() > now.getTime() ? fireAt : null;
}

/**
 * Alerts for whichever medications have an estimate worth notifying about.
 *
 * A medication with no estimate produces nothing — declining is an ordinary
 * outcome and the client must not invent a date the server would not give.
 */
export function toRefillAlerts(
  medications: Medication[],
  leadDays: number,
  now: Date = new Date()
): RefillAlert[] {
  const alerts: RefillAlert[] = [];

  for (const medication of medications) {
    const { runOutOn } = medication.refillEstimate;
    if (!runOutOn) continue;

    const fireAt = alertMoment(runOutOn, leadDays, now);
    if (!fireAt) continue;

    alerts.push({
      medicationId: medication.id,
      medicationName: medication.name,
      fireAt,
      title: "You may be running low",
      // Names the medication, because an alert that will not say what to
      // reorder is no use. That makes it visible on a lock screen to anyone
      // nearby — the same accepted trade as the dose reminders, recorded in
      // CLAUDE.md.
      body: `${medication.name} — MedHelp estimates you have about ${leadDays} ${
        leadDays === 1 ? "day" : "days"
      } left. This is an estimate, not a count.`,
    });
  }

  return alerts;
}
