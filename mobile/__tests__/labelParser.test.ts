/**
 * Tests for prescription-label parsing.
 *
 * Every label below is SYNTHETIC. The drug names are real drugs because the
 * layouts have to be realistic to be worth testing, but every patient name,
 * address, phone number, prescriber and Rx number is invented. No real
 * person's prescription appears here, and none may ever be added.
 *
 * The properties being defended, in order of how much they matter:
 *
 * 1. The directions line is never reworded. What the label says is what the
 *    user sees.
 * 2. The dose is never restated, converted, or split apart.
 * 3. The patient's name never lands in the medication field.
 * 4. A bad read fails to "nothing", not to something plausible.
 */

import { parseLabelText } from "@/services/labelParser";

describe("parseLabelText — common pharmacy layouts", () => {
  it("reads a full chain-pharmacy label", () => {
    const label = [
      "CVS/pharmacy",
      "742 Evergreen Terrace",
      "Springfield IL 62701",
      "Rx# 8675309",
      "DOE, JANE A",
      "LISINOPRIL 10MG TABLETS",
      "TAKE 1 TABLET BY MOUTH ONCE DAILY",
      "Dr. RIVERA",
      "Qty: 30   Refills: 2",
    ].join("\n");

    const parsed = parseLabelText(label);

    expect(parsed.name).toBe("Lisinopril");
    expect(parsed.dosage).toBe("10 mg");
    expect(parsed.frequency).toBe("TAKE 1 TABLET BY MOUTH ONCE DAILY");
    expect(parsed.prescribingDoctor).toBe("RIVERA");
    expect(parsed.confidence).toBe("high");
  });

  it("reads a second chain's layout, where the prescriber comes first", () => {
    const label = [
      "WALGREENS #4417",
      "DR. A. SMITH, M.D.",
      "AMOXICILLIN 500 MG CAPSULE",
      "TAKE ONE CAPSULE BY MOUTH THREE TIMES A DAY",
    ].join("\n");

    const parsed = parseLabelText(label);

    expect(parsed.name).toBe("Amoxicillin");
    expect(parsed.dosage).toBe("500 mg");
    expect(parsed.frequency).toBe("TAKE ONE CAPSULE BY MOUTH THREE TIMES A DAY");
    expect(parsed.confidence).toBe("high");
  });

  it("reads a bare independent-pharmacy printout", () => {
    const label = [
      "METFORMIN HCL 500MG TAB",
      "TAKE 1 TABLET TWICE DAILY WITH MEALS",
    ].join("\n");

    const parsed = parseLabelText(label);

    // The salt is part of the product name and is kept.
    expect(parsed.name).toBe("Metformin HCL");
    expect(parsed.dosage).toBe("500 mg");
    expect(parsed.confidence).toBe("high");
  });

  it("reads a mail-order layout with a labelled prescriber", () => {
    const label = [
      "PREDNISONE 20 MG TABLET",
      "TAKE 2 TABLETS BY MOUTH DAILY WITH FOOD",
      "Prescriber: Dana Okafor, MD",
    ].join("\n");

    const parsed = parseLabelText(label);

    expect(parsed.name).toBe("Prednisone");
    expect(parsed.dosage).toBe("20 mg");
    expect(parsed.prescribingDoctor).toContain("Dana Okafor");
  });

  it("reads directions that carry no sig verb", () => {
    const label = ["SERTRALINE 50 MG TABLET", "ONE TABLET EVERY MORNING"].join("\n");

    const parsed = parseLabelText(label);

    expect(parsed.name).toBe("Sertraline");
    expect(parsed.frequency).toBe("ONE TABLET EVERY MORNING");
  });
});

describe("parseLabelText — the dose is never restated", () => {
  it("keeps a concentration whole", () => {
    const label = [
      "AMOXICILLIN 250 MG/5 ML ORAL SUSPENSION",
      "TAKE 5 ML BY MOUTH THREE TIMES DAILY",
    ].join("\n");

    const parsed = parseLabelText(label);

    // "250 mg" alone would be a different instruction to whoever reads it.
    expect(parsed.dosage).toBe("250 mg/5 mL");
  });

  it("keeps both strengths of a combination product", () => {
    const label = [
      "LISINOPRIL-HYDROCHLOROTHIAZIDE 20-25 MG TABLET",
      "TAKE 1 TABLET BY MOUTH DAILY",
    ].join("\n");

    const parsed = parseLabelText(label);

    expect(parsed.dosage).toBe("20-25 mg");
    expect(parsed.name).toBe("Lisinopril-Hydrochlorothiazide");
  });

  it("keeps a decimal dose exactly as printed", () => {
    const parsed = parseLabelText("ALPRAZOLAM 0.25 MG TABLET\nTAKE 1 TABLET AT BEDTIME");

    expect(parsed.dosage).toBe("0.25 mg");
  });

  it("keeps a percentage strength", () => {
    const parsed = parseLabelText(
      "HYDROCORTISONE 1% CREAM\nAPPLY TO AFFECTED AREA TWICE DAILY"
    );

    expect(parsed.dosage).toBe("1%");
    expect(parsed.name).toBe("Hydrocortisone");
  });

  it("keeps unit-based strengths", () => {
    const parsed = parseLabelText("VITAMIN D 1000 IU CAPSULE\nTAKE 1 CAPSULE DAILY");

    expect(parsed.dosage).toBe("1000 IU");
  });

  it("normalises spacing without altering the number", () => {
    const parsed = parseLabelText("ATORVASTATIN 20MG TABLET\nTAKE 1 TABLET AT BEDTIME");

    expect(parsed.dosage).toBe("20 mg");
  });
});

describe("parseLabelText — directions are carried verbatim", () => {
  it("does not expand dosing abbreviations", () => {
    const parsed = parseLabelText("ATORVASTATIN 20 MG TABLET\nTAKE 1 TABLET PO QHS");

    // Decoding QHS into "at bedtime" would be this app authoring dosing
    // instructions from an abbreviation it interpreted.
    expect(parsed.frequency).toBe("TAKE 1 TABLET PO QHS");
    expect(parsed.frequency).not.toMatch(/bedtime/i);
  });

  it("does not reword or summarise a long direction", () => {
    const sig =
      "TAKE 1 TABLET BY MOUTH EVERY 4 TO 6 HOURS AS NEEDED FOR PAIN, NOT TO EXCEED 6 TABLETS IN 24 HOURS";
    const parsed = parseLabelText(`IBUPROFEN 400 MG TABLET\n${sig}`);

    expect(parsed.frequency).toBe(sig);
  });

  it("collapses only whitespace, never words", () => {
    const parsed = parseLabelText(
      "SERTRALINE 50 MG TABLET\nTAKE   1  TABLET    ONCE   DAILY"
    );

    expect(parsed.frequency).toBe("TAKE 1 TABLET ONCE DAILY");
  });
});

describe("parseLabelText — the patient never becomes the medication", () => {
  it("does not take the patient name from a full label", () => {
    const label = [
      "CVS/pharmacy",
      "SMITH, JOHN A",
      "Rx# 4429173",
      "ATORVASTATIN 20 MG TABLET",
      "TAKE 1 TABLET AT BEDTIME",
    ].join("\n");

    const parsed = parseLabelText(label);

    expect(parsed.name).toBe("Atorvastatin");
    expect(parsed.name).not.toMatch(/smith|john/i);
  });

  it("returns nothing rather than guessing when there is no drug line", () => {
    const label = ["CVS/pharmacy", "SMITH, JOHN A", "Rx# 4429173"].join("\n");

    const parsed = parseLabelText(label);

    // A person's name is the most prominent text on the label. Guessing here
    // would put it in the medication field.
    expect(parsed.name).toBeNull();
    expect(parsed.confidence).toBe("none");
  });

  it("does not surface the address, phone number or Rx number anywhere", () => {
    const label = [
      "CVS/pharmacy",
      "742 Evergreen Terrace",
      "Springfield IL 62701",
      "555-0142",
      "Rx# 8675309",
      "DOE, JANE A",
      "LISINOPRIL 10MG TABLETS",
      "TAKE 1 TABLET BY MOUTH ONCE DAILY",
    ].join("\n");

    const parsed = parseLabelText(label);
    const everything = [
      parsed.name,
      parsed.dosage,
      parsed.frequency,
      parsed.prescribingDoctor,
    ]
      .filter(Boolean)
      .join(" ");

    // The app has no field for any of these, so reading them out would create
    // identifiable health information with nowhere to put it.
    expect(everything).not.toMatch(/Evergreen|Springfield|62701|555-0142|8675309/);
    expect(everything).not.toMatch(/DOE|JANE/);
  });
});

describe("parseLabelText — partial and failed reads", () => {
  it("returns a name alone as a partial read", () => {
    const parsed = parseLabelText("IBUPROFEN TABLETS");

    expect(parsed.name).toBe("Ibuprofen");
    expect(parsed.dosage).toBeNull();
    expect(parsed.confidence).toBe("partial");
  });

  it("says which fields it could not read", () => {
    const parsed = parseLabelText("IBUPROFEN TABLETS");

    expect(parsed.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/dosage/i),
        expect.stringMatching(/directions/i),
      ])
    );
  });

  it("treats an empty photo as nothing found, not as a blank medication", () => {
    const parsed = parseLabelText("");

    expect(parsed.name).toBeNull();
    expect(parsed.confidence).toBe("none");
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("treats whitespace-only text as nothing found", () => {
    expect(parseLabelText("   \n\n  \t ").confidence).toBe("none");
  });

  it("treats garbled output as nothing found", () => {
    const parsed = parseLabelText("!!! ??? ~~~\n#####\n....");

    expect(parsed.name).toBeNull();
    expect(parsed.confidence).toBe("none");
  });

  it("does not mistake dispensing metadata for directions", () => {
    const parsed = parseLabelText(
      ["IBUPROFEN 400 MG TABLET", "Qty: 30", "Refills: 2"].join("\n")
    );

    expect(parsed.frequency).toBeNull();
    expect(parsed.confidence).toBe("partial");
  });

  it("never returns an empty string in place of a missing field", () => {
    const parsed = parseLabelText("IBUPROFEN TABLETS");

    // A blank string would prefill the form with something that looks
    // answered. Missing has to stay visibly missing.
    for (const value of [parsed.name, parsed.dosage, parsed.frequency]) {
      expect(value === "" ? "blank" : "ok").toBe("ok");
    }
  });
});

describe("parseLabelText — determinism", () => {
  it("gives the same answer for the same text every time", () => {
    const label = [
      "LISINOPRIL 10MG TABLETS",
      "TAKE 1 TABLET BY MOUTH ONCE DAILY",
      "Dr. RIVERA",
    ].join("\n");

    expect(parseLabelText(label)).toEqual(parseLabelText(label));
  });

  it("is unaffected by trailing blank lines and carriage returns", () => {
    const unix = "LISINOPRIL 10MG TABLETS\nTAKE 1 TABLET ONCE DAILY";
    const windows = "LISINOPRIL 10MG TABLETS\r\nTAKE 1 TABLET ONCE DAILY\r\n\r\n";

    expect(parseLabelText(windows)).toEqual(parseLabelText(unix));
  });
});
