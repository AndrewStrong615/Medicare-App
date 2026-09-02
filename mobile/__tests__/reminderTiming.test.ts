/**
 * Tests for the shared reminder-time arithmetic.
 *
 * These are the awkward cases — a time that has already gone by, midnight
 * rollover, an unparseable string — which are exactly the ones that would
 * silently fire a medication reminder at the wrong hour.
 */

import {
  dueState,
  nextOccurrence,
  parseTimeOfDay,
  sortByTime,
  todayAt,
} from "@/services/reminderTiming";

/** A fixed local moment, so these never depend on when they are run. */
function at(hours: number, minutes = 0): Date {
  return new Date(2026, 7, 30, hours, minutes, 0, 0);
}

describe("parseTimeOfDay", () => {
  it("accepts a 24-hour clock time", () => {
    expect(parseTimeOfDay("08:00")).toEqual({ hours: 8, minutes: 0 });
    expect(parseTimeOfDay("23:59")).toEqual({ hours: 23, minutes: 59 });
    expect(parseTimeOfDay("00:00")).toEqual({ hours: 0, minutes: 0 });
  });

  it.each(["8:00", "0800", "8am", "24:00", "08:60", "", "nonsense"])(
    "rejects %p rather than reinterpreting it",
    (value) => {
      // A guessed time is a medication taken at the wrong hour. "8" could be
      // either end of the day, so it is refused, not assumed.
      expect(parseTimeOfDay(value)).toBeNull();
    }
  );
});

describe("nextOccurrence", () => {
  it("is later today when the time is still ahead", () => {
    const next = nextOccurrence("20:00", at(8));

    expect(next.getDate()).toBe(30);
    expect(next.getHours()).toBe(20);
  });

  it("rolls to tomorrow when the time has gone by", () => {
    const next = nextOccurrence("08:00", at(20));

    expect(next.getDate()).toBe(31);
    expect(next.getHours()).toBe(8);
  });

  it("rolls to tomorrow when the time is exactly now", () => {
    // Otherwise a zero delay fires an alarm the instant the schedule loads.
    const next = nextOccurrence("08:00", at(8));

    expect(next.getDate()).toBe(31);
  });

  it("handles an after-midnight dose from an every-6-hours schedule", () => {
    const next = nextOccurrence("02:00", at(23));

    expect(next.getDate()).toBe(31);
    expect(next.getHours()).toBe(2);
  });
});

describe("dueState", () => {
  it("is upcoming before the time", () => {
    expect(dueState("20:00", at(8))).toBe("upcoming");
  });

  it("is due at the time and shortly after", () => {
    expect(dueState("08:00", at(8))).toBe("due");
    expect(dueState("08:00", at(8, 29))).toBe("due");
  });

  it("is passed once the window has gone", () => {
    // Reported as "earlier today", never as "missed" — MedHelp has no idea
    // whether the person took it, and must not imply it is keeping score.
    expect(dueState("08:00", at(9))).toBe("passed");
  });

  it("treats an unparseable time as upcoming rather than throwing", () => {
    expect(dueState("nonsense", at(12))).toBe("upcoming");
  });
});

describe("todayAt and sortByTime", () => {
  it("builds a local time on today's date", () => {
    const when = todayAt("14:30", at(9));

    expect(when?.getHours()).toBe(14);
    expect(when?.getMinutes()).toBe(30);
    expect(when?.getSeconds()).toBe(0);
  });

  it("orders times through the day, including after midnight", () => {
    const sorted = sortByTime([
      { timeOfDay: "20:00" },
      { timeOfDay: "02:00" },
      { timeOfDay: "08:00" },
    ]);

    expect(sorted.map((item) => item.timeOfDay)).toEqual(["02:00", "08:00", "20:00"]);
  });
});
