/**
 * Tests for the browser notification path (`notificationService.web.ts`).
 *
 * Metro resolves this file only for web builds, so it is required explicitly.
 *
 * The properties that matter: permission is never requested without a user
 * gesture, nothing fires without permission, and no notification content is
 * sent anywhere.
 */

const globals = global as unknown as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const service = require("@/services/notificationService.web");

const REMINDERS = [
  {
    reminderId: "r1",
    medicationId: "m1",
    medicationName: "Synthetic Tablet",
    dosage: "10 mg",
    timeOfDay: "20:00",
  },
];

function at(hours: number): Date {
  return new Date(2026, 7, 30, hours, 0, 0, 0);
}

interface NotificationStub {
  permission: string;
  requestPermission: jest.Mock;
}

function stubNotification(permission: string): {
  constructed: Array<{ title: string; options: Record<string, unknown> }>;
  requestPermission: jest.Mock;
} {
  const constructed: Array<{ title: string; options: Record<string, unknown> }> = [];
  const requestPermission = jest.fn(async () => permission);

  function NotificationStubCtor(title: string, options: Record<string, unknown>) {
    constructed.push({ title, options });
  }
  (NotificationStubCtor as unknown as NotificationStub).permission = permission;
  (NotificationStubCtor as unknown as NotificationStub).requestPermission =
    requestPermission;

  globals.window = { Notification: NotificationStubCtor };
  return { constructed, requestPermission };
}

describe("notification permission in a browser", () => {
  const savedWindow = globals.window;

  afterEach(async () => {
    await service.cancelAll();
    jest.useRealTimers();
    globals.window = savedWindow;
  });

  it("reports what is already granted without asking", () => {
    const { requestPermission } = stubNotification("granted");

    expect(service.getPermission()).toBe("granted");
    // Checking must never prompt. A request not tied to a user gesture is
    // suppressed by browsers, and a blocked site never prompts again — which
    // is the bug that made location appear never to ask.
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("reports 'prompt' when nothing has been decided", () => {
    stubNotification("default");

    expect(service.getPermission()).toBe("prompt");
  });

  it("reports 'denied' when the user has blocked it", () => {
    stubNotification("denied");

    expect(service.getPermission()).toBe("denied");
  });

  it("reports 'unsupported' in a browser without the API", () => {
    globals.window = {};

    expect(service.getPermission()).toBe("unsupported");
  });

  it("asks only when explicitly told to", async () => {
    const { requestPermission } = stubNotification("granted");

    await expect(service.requestPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("arming reminders in a browser", () => {
  const savedWindow = globals.window;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await service.cancelAll();
    jest.useRealTimers();
    globals.window = savedWindow;
  });

  it("fires a notification at the reminder time", async () => {
    const { constructed } = stubNotification("granted");

    await service.scheduleAll(REMINDERS, at(8));
    expect(constructed).toHaveLength(0);

    // Twelve hours later, 08:00 -> 20:00.
    jest.advanceTimersByTime(12 * 60 * 60 * 1000);

    expect(constructed).toHaveLength(1);
    expect(constructed[0].title).toMatch(/time to take/i);
    expect(constructed[0].options.body).toBe("Synthetic Tablet — 10 mg");
  });

  it("arms nothing without permission", async () => {
    const { constructed } = stubNotification("denied");

    await service.scheduleAll(REMINDERS, at(8));
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(constructed).toHaveLength(0);
  });

  it("re-arms itself for the following day", async () => {
    const { constructed } = stubNotification("granted");

    await service.scheduleAll(REMINDERS, at(8));
    jest.advanceTimersByTime(12 * 60 * 60 * 1000);
    expect(constructed).toHaveLength(1);

    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(constructed).toHaveLength(2);
  });

  it("replaces the previous set rather than stacking alarms", async () => {
    const { constructed } = stubNotification("granted");

    await service.scheduleAll(REMINDERS, at(8));
    await service.scheduleAll(REMINDERS, at(8));
    jest.advanceTimersByTime(12 * 60 * 60 * 1000);

    // Arming twice must not mean two notifications for one dose.
    expect(constructed).toHaveLength(1);
  });

  it("stops firing once cancelled", async () => {
    const { constructed } = stubNotification("granted");

    await service.scheduleAll(REMINDERS, at(8));
    await service.cancelAll();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(constructed).toHaveLength(0);
  });

  it("never sends the reminder anywhere", async () => {
    stubNotification("granted");
    const fetchSpy = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;

    try {
      await service.scheduleAll(REMINDERS, at(8));
      jest.advanceTimersByTime(12 * 60 * 60 * 1000);

      // Notifications are fired locally from data already on screen. Nothing
      // about someone's medication leaves the device.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("says it cannot deliver in the background", () => {
    stubNotification("granted");

    // A closed tab runs no code. The screen tells the user this rather than
    // letting them assume an alarm clock.
    expect(service.supportsBackgroundDelivery()).toBe(false);
  });
});
