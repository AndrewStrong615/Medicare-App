/**
 * Medication reminders in a browser.
 *
 * Metro picks this over `notificationService.ts` for web builds. Both expose
 * the same functions so the screens need no platform knowledge.
 *
 * ## What this can and cannot do, stated plainly
 *
 * Notifications are fired **from this page, while it is open**. A browser tab
 * that has been closed runs no code, so it fires nothing. That is a real
 * limitation and the UI says so rather than implying an alarm clock.
 *
 * Making it work with the browser closed needs Web Push: a backend scheduler,
 * push subscriptions, and a payload travelling through Google's, Apple's or
 * Mozilla's push infrastructure. That payload would name a person's
 * medication, which makes those services processors of health data and raises
 * the BAA question this project has no answer to. It also needs HTTPS, so it
 * would not work on the LAN address the app is served from today. Deliberately
 * not built — see the note in CLAUDE.md.
 *
 * ## Nothing leaves the device
 *
 * Every reminder is scheduled and fired locally from data already on screen.
 * There is no `fetch` in this module, and no notification content is sent
 * anywhere. A test asserts it.
 */

import type { DueReminder } from "@/services/reminderTiming";
import { nextOccurrence } from "@/services/reminderTiming";

export type ReminderPermission = "granted" | "denied" | "prompt" | "unsupported";

/**
 * setTimeout's delay is a signed 32-bit int; anything larger fires
 * immediately, which would mean a reminder for tomorrow going off now.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

let timers: ReturnType<typeof setTimeout>[] = [];

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Notification === "function";
}

/**
 * What permission we already have, without asking for it.
 *
 * Same rule as location: checking must never trigger a prompt. Browsers
 * suppress a permission request that is not tied to a user gesture, and a site
 * the user once blocked never prompts again — so an unprompted request is both
 * useless and unrecoverable. The screen turns "prompt" into a button.
 */
export function getPermission(): ReminderPermission {
  if (!notificationsSupported()) return "unsupported";
  const current = window.Notification.permission;
  if (current === "granted") return "granted";
  if (current === "denied") return "denied";
  return "prompt";
}

/**
 * The same value as `getPermission`, as a promise.
 *
 * Exists only so both platforms expose one interface: the native API can only
 * answer asynchronously, and the screens must not know which one they got.
 */
export async function refreshPermission(): Promise<ReminderPermission> {
  return getPermission();
}

/** Only ever called from a button press. */
export async function requestPermission(): Promise<ReminderPermission> {
  if (!notificationsSupported()) return "unsupported";
  try {
    const result = await window.Notification.requestPermission();
    if (result === "granted") return "granted";
    if (result === "denied") return "denied";
    return "prompt";
  } catch {
    // Older Safari used a callback form and can reject the promise API.
    return getPermission();
  }
}

function show(reminder: DueReminder): void {
  try {
    // The medication name is in the body because a reminder that will not say
    // what to take is no use. Worth knowing that this makes it visible on a
    // lock screen to anyone nearby — see CLAUDE.md.
    new window.Notification("Time to take your medication", {
      body: reminder.dosage
        ? `${reminder.medicationName} — ${reminder.dosage}`
        : reminder.medicationName,
      tag: `${reminder.medicationId}-${reminder.timeOfDay}`,
      requireInteraction: false,
    });
  } catch {
    // A browser can refuse to construct one (permission revoked mid-session).
    // Nothing useful to do; the on-screen list still shows what is due.
  }
}

/**
 * Arm every enabled reminder for as long as this page stays open.
 *
 * Replaces any previously armed set, so calling it again after the user edits
 * a schedule is the correct and only way to refresh.
 */
export async function scheduleAll(
  reminders: DueReminder[],
  now: Date = new Date()
): Promise<void> {
  await cancelAll();
  if (getPermission() !== "granted") return;

  for (const reminder of reminders) {
    const delay = nextOccurrence(reminder.timeOfDay, now).getTime() - now.getTime();
    if (delay < 0 || delay > MAX_TIMEOUT_MS) continue;

    timers.push(
      setTimeout(() => {
        show(reminder);
        // Re-arm for tomorrow. The page may well be closed by then, which is
        // the limitation stated at the top of this file.
        scheduleOne(reminder);
      }, delay)
    );
  }
}

function scheduleOne(reminder: DueReminder): void {
  const now = new Date();
  const delay = nextOccurrence(reminder.timeOfDay, now).getTime() - now.getTime();
  if (delay < 0 || delay > MAX_TIMEOUT_MS) return;
  timers.push(setTimeout(() => {
    show(reminder);
    scheduleOne(reminder);
  }, delay));
}

export async function cancelAll(): Promise<void> {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

/**
 * Whether reminders can fire in the background on this platform.
 *
 * False here, and the screen says so. Kept as a function rather than a
 * constant so the native module can answer differently without the screen
 * knowing which platform it is on.
 */
export function supportsBackgroundDelivery(): boolean {
  return false;
}
