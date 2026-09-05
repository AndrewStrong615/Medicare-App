/**
 * Medication reminders on iOS and Android.
 *
 * Metro picks `notificationService.web.ts` for the browser; this is the native
 * build. Both export the same functions, so the screens are platform-agnostic.
 *
 * ## Why this one is better than the web path
 *
 * `expo-notifications` schedules a **daily repeating local notification with
 * the operating system**. Once handed over, the OS fires it whether or not
 * MedHelp is running — which is what a medication reminder actually needs and
 * what a browser tab cannot do.
 *
 * ## Local, not push
 *
 * These are local notifications only. No push token is requested, nothing is
 * registered with Expo's push service, FCM or APNs, and no medication name
 * leaves the device. That is deliberate: a push payload naming someone's
 * medication would make those services processors of health data and require a
 * BAA this project does not have. **Do not add `getExpoPushTokenAsync` or a
 * remote notification path here without that decision being made first.**
 *
 * ## Requires a development build
 *
 * `expo-notifications` is a native module. Remote notifications were removed
 * from Expo Go on Android in SDK 53, and scheduling behaviour there is
 * unreliable generally, so every import below is lazy and guarded: without the
 * native module the feature reports itself unavailable and the screen says so
 * rather than crashing.
 *
 * ⚠️ **Untested on a device.** There is no development build or hardware in
 * this environment, so the code path below has been written against the
 * documented API and unit-tested against a mock, but never observed firing a
 * real notification. The web path has been checked end to end.
 */

import type { DueReminder } from "@/services/reminderTiming";
import { parseTimeOfDay } from "@/services/reminderTiming";

export type ReminderPermission = "granted" | "denied" | "prompt" | "unsupported";

interface NotificationsModule {
  getPermissionsAsync: () => Promise<{ status: string; canAskAgain?: boolean }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  scheduleNotificationAsync: (request: object) => Promise<string>;
  cancelAllScheduledNotificationsAsync: () => Promise<void>;
  setNotificationHandler: (handler: object) => void;
  AndroidNotificationPriority?: Record<string, unknown>;
  SchedulableTriggerInputTypes?: { DAILY: string };
}

/**
 * Load the native module without letting a missing one crash the screen.
 *
 * THE MODULE NAME MUST BE A LITERAL — Metro resolves requires statically at
 * bundle time, and a dynamic name fails to resolve on a device even when the
 * package is installed. That mistake was made once already in `labelScanner`
 * and looked exactly like "this phone doesn't support it".
 */
function notificationsModule(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("expo-notifications") as NotificationsModule;
    return typeof loaded?.scheduleNotificationAsync === "function" ? loaded : null;
  } catch {
    return null;
  }
}

let handlerInstalled = false;

/** Show the banner even when MedHelp happens to be open at the time. */
function ensureHandler(notifications: NotificationsModule): void {
  if (handlerInstalled) return;
  try {
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerInstalled = true;
  } catch {
    // A build without the native side can throw here; scheduling below will
    // report unavailable anyway.
  }
}

function toPermission(status: string): ReminderPermission {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "prompt";
}

export function getPermission(): ReminderPermission {
  // The native API is async, so the synchronous answer the screens share is
  // the conservative one; `refreshPermission` gets the real value.
  return notificationsModule() ? cachedPermission : "unsupported";
}

let cachedPermission: ReminderPermission = "prompt";

/** Reads the real permission without prompting for it. */
export async function refreshPermission(): Promise<ReminderPermission> {
  const notifications = notificationsModule();
  if (!notifications) return "unsupported";
  try {
    const { status } = await notifications.getPermissionsAsync();
    cachedPermission = toPermission(status);
    return cachedPermission;
  } catch {
    return "unsupported";
  }
}

/** Only ever called from a button press. */
export async function requestPermission(): Promise<ReminderPermission> {
  const notifications = notificationsModule();
  if (!notifications) return "unsupported";
  try {
    const { status } = await notifications.requestPermissionsAsync();
    cachedPermission = toPermission(status);
    return cachedPermission;
  } catch {
    return "unsupported";
  }
}

/**
 * Hand the whole set to the OS as daily repeating alarms.
 *
 * Everything previously scheduled is cancelled first: the screen shows the
 * whole schedule at once, so what it passes here is the whole schedule, and
 * merging would leave alarms behind for times the user has deleted.
 */
export async function scheduleAll(reminders: DueReminder[]): Promise<void> {
  const notifications = notificationsModule();
  if (!notifications) return;
  ensureHandler(notifications);

  await cancelAll();
  if (cachedPermission !== "granted") return;

  for (const reminder of reminders) {
    const parsed = parseTimeOfDay(reminder.timeOfDay);
    if (!parsed) continue;

    try {
      await notifications.scheduleNotificationAsync({
        content: {
          title: "Time to take your medication",
          // Names the medication because a reminder that will not say what to
          // take is no use. This is visible on a lock screen — see CLAUDE.md.
          body: reminder.dosage
            ? `${reminder.medicationName} — ${reminder.dosage}`
            : reminder.medicationName,
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes?.DAILY ?? "daily",
          hour: parsed.hours,
          minute: parsed.minutes,
        },
      });
    } catch {
      // One failed alarm must not take the rest of the schedule with it.
    }
  }
}

export async function cancelAll(): Promise<void> {
  const notifications = notificationsModule();
  if (!notifications) return;
  try {
    await notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing useful to do.
  }
}

/** True here: the OS fires these whether or not MedHelp is running. */
export function supportsBackgroundDelivery(): boolean {
  return notificationsModule() !== null;
}
