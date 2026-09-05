/**
 * Turning saved reminder times into "when next", shared by both platforms and
 * by the screens.
 *
 * Pure functions over a clock time and a `Date`. No I/O, no platform APIs,
 * which is what makes the awkward cases — midnight rollover, a time that has
 * already passed today — testable without a device.
 *
 * A reminder time is a **local wall-clock time**, never a UTC instant. Eight
 * in the morning means eight in the morning wherever the person is; see the
 * note on the `MedicationReminder` model.
 */

export interface DueReminder {
  reminderId: string;
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  /** "HH:MM", 24-hour, local. */
  timeOfDay: string;
}

export function parseTimeOfDay(timeOfDay: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeOfDay);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Today at `timeOfDay`, in local time. */
export function todayAt(timeOfDay: string, now: Date): Date | null {
  const parsed = parseTimeOfDay(timeOfDay);
  if (!parsed) return null;
  const when = new Date(now);
  when.setHours(parsed.hours, parsed.minutes, 0, 0);
  return when;
}

/**
 * The next time this reminder comes round: today if it is still ahead,
 * otherwise tomorrow.
 *
 * Returns `now` for an unparseable time only so callers never get null in a
 * scheduling path; they filter those out first.
 */
export function nextOccurrence(timeOfDay: string, now: Date): Date {
  const when = todayAt(timeOfDay, now);
  if (!when) return now;
  if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1);
  return when;
}

/** "08:00" -> "8:00 AM", using the device's own locale conventions. */
export function formatTimeOfDay(timeOfDay: string, now: Date = new Date()): string {
  const when = todayAt(timeOfDay, now);
  if (!when) return timeOfDay;
  try {
    return when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return timeOfDay;
  }
}

export type DueState = "upcoming" | "due" | "passed";

/**
 * Where a time sits relative to now, for today only.
 *
 * "due" is a short window around the time itself so the screen can highlight
 * the one the user is most likely looking for. "passed" says the time has gone
 * by today — it deliberately does **not** say the dose was missed, because
 * MedHelp has no idea whether the person took it. Nothing here tracks
 * adherence, and the copy must not imply it does.
 */
export function dueState(
  timeOfDay: string,
  now: Date = new Date(),
  dueWindowMinutes = 30
): DueState {
  const when = todayAt(timeOfDay, now);
  if (!when) return "upcoming";
  const differenceMinutes = (now.getTime() - when.getTime()) / 60_000;
  if (differenceMinutes < 0) return "upcoming";
  if (differenceMinutes <= dueWindowMinutes) return "due";
  return "passed";
}

/** Every reminder for today, soonest first. */
export function sortByTime<T extends { timeOfDay: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay));
}
