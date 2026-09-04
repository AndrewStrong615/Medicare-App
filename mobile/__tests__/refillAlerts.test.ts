/**
 * Tests for turning a run-out estimate into a moment to notify
 * (`refillAlerts.ts`).
 *
 * The two that would bite in the real world:
 *
 * 1. **The date is read as local midnight, not UTC.** `new Date("2026-09-18")`
 *    is UTC by specification, which is the previous evening anywhere west of
 *    Greenwich — so the naive reading moves the alert a day for most of the
 *    Americas.
 * 2. **A moment that has passed produces nothing.** A notification cannot be
 *    scheduled into the past, and re-firing one on every screen load would be
 *    worse than not firing it at all.
 *
 * All medication names below are invented.
 */

import type { Medication } from "@/services/medicationService";
import { ALERT_HOUR, alertMoment, toRefillAlerts } from "@/services/refillAlerts";

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Placebofen",
    dosage: "10 mg",
    frequency: "twice daily",
    prescribingDoctor: null,
    refillDate: null,
    notes: null,
    quantityRemaining: 30,
    quantityCountedOn: "2026-09-03",
    dosesPerDay: 2,
    refillDueSoon: false,
    refillOverdue: false,
    daysUntilRefill: null,
    refillEstimate: {
      runOutOn: "2026-09-18",
      daysRemaining: 15,
      alert: false,
      isEstimate: true,
      dosesPerDay: 2,
      dosesPerDaySource: "entered",
      reason: null,
      leadDays: 3,
    },
    ...overrides,
  };
}

const NOW = new Date(2026, 8, 3, 12, 0, 0, 0); // 3 September 2026, midday local

describe("alertMoment", () => {
  it("fires the lead time before the run-out date, at the alert hour", () => {
    const moment = alertMoment("2026-09-18", 3, NOW);

    expect(moment).not.toBeNull();
    expect(moment?.getFullYear()).toBe(2026);
    expect(moment?.getMonth()).toBe(8); // September
    expect(moment?.getDate()).toBe(15);
    expect(moment?.getHours()).toBe(ALERT_HOUR);
  });

  it("reads the date as local midnight, not UTC", () => {
    // `new Date("2026-09-18")` is UTC, which is 17 September in every US
    // timezone — a whole day's difference in when someone is told.
    const moment = alertMoment("2026-09-18", 0, NOW);

    expect(moment?.getDate()).toBe(18);
  });

  it("offers nothing when the moment has already gone by", () => {
    // The badge on the medication list is what covers this case.
    expect(alertMoment("2026-09-04", 3, NOW)).toBeNull();
  });

  it("offers nothing for a date it cannot read", () => {
    expect(alertMoment("next Tuesday", 3, NOW)).toBeNull();
  });

  it("moves earlier as the lead time grows", () => {
    expect(alertMoment("2026-09-18", 3, NOW)?.getDate()).toBe(15);
    expect(alertMoment("2026-09-18", 10, NOW)?.getDate()).toBe(8);
  });
});

describe("toRefillAlerts", () => {
  it("builds an alert for a medication with an estimate", () => {
    const [alert] = toRefillAlerts([medication()], 3, NOW);

    expect(alert.medicationId).toBe("med-1");
    expect(alert.medicationName).toBe("Placebofen");
    expect(alert.fireAt.getDate()).toBe(15);
  });

  it("always says the number is an estimate", () => {
    // MedHelp does not know whether a dose was taken. Nothing it sends may
    // read as a count.
    const [alert] = toRefillAlerts([medication()], 3, NOW);

    expect(alert.body).toMatch(/estimate/i);
    expect(alert.body).toMatch(/not a count/i);
  });

  it("names the medication, because an alert that will not is no use", () => {
    const [alert] = toRefillAlerts([medication()], 3, NOW);

    expect(alert.body).toContain("Placebofen");
  });

  it("never implies a dose was missed", () => {
    const [alert] = toRefillAlerts([medication()], 3, NOW);

    expect(`${alert.title} ${alert.body}`).not.toMatch(/missed|skipped|forgot/i);
  });

  it("produces nothing for a medication the server declined to estimate", () => {
    // Declining is an ordinary outcome, and the client must not invent a date
    // the server would not give.
    const declined = medication({
      refillEstimate: {
        runOutOn: null,
        daysRemaining: null,
        alert: false,
        isEstimate: false,
        dosesPerDay: null,
        dosesPerDaySource: null,
        reason: "Add how many you have left.",
        leadDays: 3,
      },
    });

    expect(toRefillAlerts([declined], 3, NOW)).toEqual([]);
  });

  it("produces nothing once the alert moment has passed", () => {
    const soon = medication({
      refillEstimate: { ...medication().refillEstimate, runOutOn: "2026-09-04" },
    });

    expect(toRefillAlerts([soon], 3, NOW)).toEqual([]);
  });

  it("covers every medication that has one", () => {
    const alerts = toRefillAlerts(
      [medication(), medication({ id: "med-2", name: "Fictitine" })],
      3,
      NOW
    );

    expect(alerts.map((alert) => alert.medicationName)).toEqual([
      "Placebofen",
      "Fictitine",
    ]);
  });
});
