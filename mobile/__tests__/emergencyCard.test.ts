/**
 * Tests for the emergency card store (`emergencyCard.ts`).
 *
 * The properties that matter, in order of how much they would cost to get
 * wrong:
 *
 * 1. **Nothing here touches the network.** The card is read at the moment a
 *    request is most likely to fail, so a `fetch` in this path would be a
 *    feature that works everywhere except where it is needed.
 * 2. **A damaged record reads as an empty card, never as an error.** There is
 *    no failure mode that should stop the card screen rendering.
 * 3. **The medication mirror is capped**, because the record has to fit
 *    inside Android's SecureStore limit and an uncapped list would silently
 *    push it past that and lose the whole card.
 *
 * All values below are invented. No real allergy, condition or contact
 * belongs in this repository.
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
  EMPTY_CARD,
  FIELD_MAX_LENGTH,
  MIRRORED_MEDICATION_LIMIT,
  clearCard,
  dialableNumber,
  loadCard,
  loadMirroredMedications,
  mirrorMedications,
  saveCard,
} from "@/services/emergencyCard";

const SYNTHETIC_CARD = {
  ...EMPTY_CARD,
  bloodType: "O positive",
  allergies: "Placebillin",
  conditions: "Synthetic condition",
  contactName: "Sam Imaginary",
  contactRelationship: "sister",
  contactPhone: "(555) 010-0100",
};

describe("emergencyCard", () => {
  beforeEach(() => {
    mockStore.clear();
    mockWriteShouldFail = false;
  });

  it("makes no network request on any path", async () => {
    // The one property this feature cannot trade away. If the card ever needs
    // the network it stops being an emergency card.
    const fetchSpy = jest.spyOn(global, "fetch" as never);

    await saveCard(SYNTHETIC_CARD);
    await loadCard();
    await mirrorMedications([{ name: "Placebofen", dosage: "10 mg" }]);
    await loadMirroredMedications();
    await clearCard();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  describe("reading and writing", () => {
    it("hands back what was saved", async () => {
      await saveCard(SYNTHETIC_CARD);

      const loaded = await loadCard();

      expect(loaded.bloodType).toBe("O positive");
      expect(loaded.allergies).toBe("Placebillin");
      expect(loaded.contactPhone).toBe("(555) 010-0100");
    });

    it("stamps the save so the card can say how old it is", async () => {
      const saved = await saveCard(SYNTHETIC_CARD);

      expect(saved.updatedAt).toBeTruthy();
      expect(Number.isNaN(Date.parse(saved.updatedAt as string))).toBe(false);
    });

    it("reports a refused write instead of pretending it saved", async () => {
      // Someone who believes they recorded an allergy and did not is worse off
      // than someone who is told the save failed.
      mockWriteShouldFail = true;

      await expect(saveCard(SYNTHETIC_CARD)).rejects.toThrow();
    });

    it("is empty before anything has been written", async () => {
      expect(await loadCard()).toEqual(EMPTY_CARD);
    });

    it("reads a corrupted record as an empty card rather than throwing", async () => {
      mockStore.set("medhelp_emergency_card", "{not json at all");

      await expect(loadCard()).resolves.toEqual(EMPTY_CARD);
    });

    it("ignores fields a record does not have, whatever type they are", async () => {
      mockStore.set(
        "medhelp_emergency_card",
        JSON.stringify({ bloodType: 42, allergies: null, conditions: "Synthetic" })
      );

      const loaded = await loadCard();

      expect(loaded.bloodType).toBe("");
      expect(loaded.allergies).toBe("");
      expect(loaded.conditions).toBe("Synthetic");
    });

    it("caps a field so one long answer cannot lose the whole card", async () => {
      await saveCard({ ...EMPTY_CARD, allergies: "a".repeat(FIELD_MAX_LENGTH + 200) });

      expect((await loadCard()).allergies).toHaveLength(FIELD_MAX_LENGTH);
    });

    it("erases the card and the medication copy together", async () => {
      await saveCard(SYNTHETIC_CARD);
      await mirrorMedications([{ name: "Placebofen", dosage: "10 mg" }]);

      await clearCard();

      // A clear that left a list of medications behind would not be a clear.
      expect(await loadCard()).toEqual(EMPTY_CARD);
      expect(await loadMirroredMedications()).toEqual([]);
    });
  });

  describe("the medication mirror", () => {
    it("keeps name and dosage so the card reads without a connection", async () => {
      await mirrorMedications([
        { name: "Placebofen", dosage: "10 mg" },
        { name: "Fictitine", dosage: null },
      ]);

      expect(await loadMirroredMedications()).toEqual([
        { name: "Placebofen", dosage: "10 mg" },
        { name: "Fictitine", dosage: null },
      ]);
    });

    it("caps the list, because the record has to fit the platform keystore", async () => {
      await mirrorMedications(
        Array.from({ length: MIRRORED_MEDICATION_LIMIT + 10 }, (_, index) => ({
          name: `Synthetic ${index}`,
          dosage: "1 mg",
        }))
      );

      expect(await loadMirroredMedications()).toHaveLength(MIRRORED_MEDICATION_LIMIT);
    });

    it("never throws, so a storage failure cannot break the medication screen", async () => {
      mockWriteShouldFail = true;

      await expect(
        mirrorMedications([{ name: "Placebofen", dosage: "10 mg" }])
      ).resolves.toBeUndefined();
    });

    it("reads a corrupted mirror as no medications", async () => {
      mockStore.set("medhelp_emergency_medications", "[[[");

      await expect(loadMirroredMedications()).resolves.toEqual([]);
    });

    it("drops entries with no name rather than rendering a blank row", async () => {
      mockStore.set(
        "medhelp_emergency_medications",
        JSON.stringify([{ name: "", dosage: "10 mg" }, { name: "Placebofen", dosage: null }])
      );

      expect(await loadMirroredMedications()).toEqual([
        { name: "Placebofen", dosage: null },
      ]);
    });
  });

  describe("dialableNumber", () => {
    it("strips what a dialler cannot use", () => {
      expect(dialableNumber("(555) 010-0100")).toBe("5550100100");
    });

    it("keeps an international prefix and an extension pause", () => {
      expect(dialableNumber("+44 20 7946 0000,123")).toBe("+442079460000,123");
    });

    it("offers no call at all when there is no number to ring", () => {
      // Better to render the text and no button than a button that fails.
      expect(dialableNumber("ask my sister")).toBeNull();
      expect(dialableNumber("")).toBeNull();
    });
  });
});
