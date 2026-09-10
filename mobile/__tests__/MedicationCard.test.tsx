/**
 * Tests for the medication card's refill indicators.
 *
 * There are two badges here and they make different claims. `refill_date` is
 * a date the user wrote down; the supply badge is arithmetic MedHelp did from
 * a count and a dose figure. The rule this file exists to hold is that the
 * second one always says so — a guess must never inherit the authority of a
 * record, and MedHelp does not know whether any dose was taken.
 *
 * All values below are invented.
 */

import { render, screen } from "@testing-library/react-native";

import { MedicationCard } from "@/components/MedicationCard";
import type { Medication, RefillEstimate } from "@/services/medicationService";

const NO_ESTIMATE: RefillEstimate = {
  runOutOn: null,
  daysRemaining: null,
  alert: false,
  isEstimate: false,
  dosesPerDay: null,
  dosesPerDaySource: null,
  reason: null,
  leadDays: 3,
};

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    name: "Placebofen",
    dosage: "10 mg",
    frequency: "twice daily",
    prescribingDoctor: null,
    refillDate: null,
    notes: null,
    quantityRemaining: null,
    quantityCountedOn: null,
    dosesPerDay: null,
    refillDueSoon: false,
    refillOverdue: false,
    daysUntilRefill: null,
    refillEstimate: NO_ESTIMATE,
    ...overrides,
  };
}

function estimate(overrides: Partial<RefillEstimate> = {}): RefillEstimate {
  return {
    ...NO_ESTIMATE,
    runOutOn: "2026-09-06",
    daysRemaining: 3,
    alert: true,
    isEstimate: true,
    dosesPerDay: 2,
    dosesPerDaySource: "entered",
    ...overrides,
  };
}

function renderCard(value: Medication) {
  render(<MedicationCard medication={value} onPress={jest.fn()} />);
}

describe("MedicationCard supply indicator", () => {
  it("flags a medication estimated to be running low", () => {
    renderCard(medication({ refillEstimate: estimate() }));

    expect(screen.getByText("About 3 days left (estimate)")).toBeTruthy();
  });

  it("always calls it an estimate", () => {
    // The single rule this component must not lose. MedHelp projects from a
    // count the user gave; it does not know what is actually left.
    renderCard(medication({ refillEstimate: estimate() }));

    expect(screen.getByText(/estimate/i)).toBeTruthy();
  });

  it("says so when the estimated date has passed, without claiming a dose was missed", () => {
    renderCard(
      medication({ refillEstimate: estimate({ daysRemaining: -2 }) })
    );

    expect(screen.getByText("Estimated to have run out")).toBeTruthy();
    expect(screen.queryByText(/missed|skipped/i)).toBeNull();
  });

  it("says today rather than 'about 0 days'", () => {
    renderCard(medication({ refillEstimate: estimate({ daysRemaining: 0 }) }));

    expect(screen.getByText("Estimated to run out today")).toBeTruthy();
  });

  it("shows nothing when the estimate is outside the lead time", () => {
    renderCard(
      medication({
        refillEstimate: estimate({ daysRemaining: 40, alert: false }),
      })
    );

    expect(screen.queryByText(/estimate/i)).toBeNull();
  });

  it("shows nothing when there is no estimate at all", () => {
    renderCard(medication());

    expect(screen.queryByText(/estimate/i)).toBeNull();
  });

  it("keeps the written-down refill date as a separate, differently worded badge", () => {
    // One is a record, the other a guess. Collapsing them would let the guess
    // borrow the record's authority.
    renderCard(
      medication({
        refillDate: "2026-09-08",
        refillDueSoon: true,
        daysUntilRefill: 5,
        refillEstimate: estimate(),
      })
    );

    expect(screen.getByText("Refill due in 5 days")).toBeTruthy();
    expect(screen.getByText("About 3 days left (estimate)")).toBeTruthy();
  });

  it("reads both badges out to a screen reader", () => {
    renderCard(
      medication({
        refillDate: "2026-09-08",
        refillDueSoon: true,
        daysUntilRefill: 5,
        refillEstimate: estimate(),
      })
    );

    const card = screen.getByLabelText("Placebofen");
    const hint = card.props.accessibilityHint as string;

    expect(hint).toContain("Refill due in 5 days");
    expect(hint).toContain("About 3 days left (estimate)");
  });
});
