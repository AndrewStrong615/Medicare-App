/**
 * Tests for device-local settings (`appSettings.ts`).
 *
 * The property worth holding: a settings read is total. A missing, corrupt or
 * out-of-range value produces the default, because a preference must never be
 * able to stop a screen rendering — and a lead time read as `NaN` would be
 * passed to the API and rejected as a 422 on a screen the user only wanted to
 * look at.
 */

const mockStore = new Map<string, string>();
let mockWriteShouldFail = false;

jest.mock("@/services/deviceStorage", () => ({
  readRaw: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  writeRaw: jest.fn(async (key: string, value: string) => {
    if (mockWriteShouldFail) throw new Error("storage-unavailable");
    mockStore.set(key, value);
  }),
  removeRaw: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import {
  REFILL_LEAD_DAYS_DEFAULT,
  REFILL_LEAD_DAYS_MAX,
  REFILL_LEAD_DAYS_MIN,
  clampLeadDays,
  getRefillLeadDays,
  setRefillLeadDays,
} from "@/services/appSettings";

const KEY = "medhelp_refill_lead_days";

describe("appSettings", () => {
  beforeEach(() => {
    mockStore.clear();
    mockWriteShouldFail = false;
  });

  it("defaults to three days before anything is chosen", () => {
    return expect(getRefillLeadDays()).resolves.toBe(REFILL_LEAD_DAYS_DEFAULT);
  });

  it("hands back what was chosen", async () => {
    await setRefillLeadDays(7);

    await expect(getRefillLeadDays()).resolves.toBe(7);
  });

  it("clamps a value rather than storing one an alert cannot live in", async () => {
    await expect(setRefillLeadDays(0)).resolves.toBe(REFILL_LEAD_DAYS_MIN);
    await expect(setRefillLeadDays(9999)).resolves.toBe(REFILL_LEAD_DAYS_MAX);
  });

  it("reads a corrupted value as the default rather than as NaN", async () => {
    // A NaN would reach the API as `refill_lead_days=NaN` and come back 422,
    // on a screen the user only wanted to look at.
    mockStore.set(KEY, "not a number");

    await expect(getRefillLeadDays()).resolves.toBe(REFILL_LEAD_DAYS_DEFAULT);
  });

  it("reads an out-of-range stored value back into range", async () => {
    mockStore.set(KEY, "500");

    await expect(getRefillLeadDays()).resolves.toBe(REFILL_LEAD_DAYS_MAX);
  });

  it("does not throw when the device refuses to store a preference", async () => {
    // Losing a preference is a reset to the default; it must not cost the
    // user the screen they set it on.
    mockWriteShouldFail = true;

    await expect(setRefillLeadDays(7)).resolves.toBe(7);
  });

  describe("clampLeadDays", () => {
    it("rounds rather than truncating a fractional value", () => {
      expect(clampLeadDays(3.6)).toBe(4);
    });

    it("treats a non-finite value as unset", () => {
      expect(clampLeadDays(Number.NaN)).toBe(REFILL_LEAD_DAYS_DEFAULT);
    });
  });
});
