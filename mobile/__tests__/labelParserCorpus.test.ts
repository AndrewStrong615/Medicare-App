/**
 * Accuracy measurement for the label parser, over a corpus of whole labels
 * rather than one case at a time.
 *
 * SYNTHETIC ONLY. Every label below was written by an engineer. There is no
 * real patient, prescriber, pharmacy, or prescription here, and CLAUDE.md
 * forbids putting one in this repository. The names are deliberately obvious
 * inventions.
 *
 * WHY A CORPUS: `labelParser.test.ts` asserts specific behaviours on specific
 * strings, which is the right way to pin a rule down but says nothing about
 * how often the parser gets a whole label right. A real label is a pile of
 * pharmacy branding, a patient block and dispensing metadata with four useful
 * lines buried in it, and the failure that matters is "the drug line lost to
 * something else on the label", which only shows up end to end.
 *
 * These are layout variations, not OCR noise. Recognition quality is a
 * property of the engine (Vision / ML Kit / Tesseract), not of this module,
 * and it cannot be measured without real photographs.
 */

import { parseLabelText, hasAnyField } from "../src/services/labelParser";

interface LabelCase {
  readonly what: string;
  readonly text: string;
  readonly name: string | null;
  readonly dosage: string | null;
  /** Substring the verbatim directions line must contain. */
  readonly frequency: string | null;
  readonly prescriber: string | null;
}

const PHARMACY_HEADER = [
  "CORNER DRUG PHARMACY #1188",
  "742 EXAMPLE STREET",
  "SPRINGFIELD IL 62704",
  "555-0100",
].join("\n");

const DISPENSING_FOOTER = [
  "QTY: 30",
  "REFILLS: 2",
  "DISCARD AFTER 04/30/2027",
  "KEEP OUT OF REACH OF CHILDREN",
];

/** A label in the ordinary US retail layout. */
function retailLabel(parts: {
  patient: string;
  rx: string;
  drug: string;
  sig: string;
  prescriber: string;
}): string {
  return [
    PHARMACY_HEADER,
    `RX# ${parts.rx}`,
    parts.patient,
    parts.sig,
    parts.drug,
    `PRESCRIBER: ${parts.prescriber}`,
    ...DISPENSING_FOOTER,
  ].join("\n");
}

const CASES: LabelCase[] = [
  {
    what: "ordinary retail layout, tablet",
    text: retailLabel({
      patient: "SAMPLE A PATIENT",
      rx: "4471902",
      drug: "LISINOPRIL 10MG TABLET",
      sig: "TAKE 1 TABLET BY MOUTH ONCE DAILY",
      prescriber: "R. EXAMPLE, MD",
    }),
    name: "Lisinopril",
    dosage: "10 mg",
    frequency: "TAKE 1 TABLET BY MOUTH ONCE DAILY",
    prescriber: "R. EXAMPLE, MD",
  },
  {
    what: "salt in the product name is kept",
    text: retailLabel({
      patient: "SAMPLE B PATIENT",
      rx: "4471903",
      drug: "METFORMIN HCL 500 MG TAB",
      sig: "TAKE 1 TABLET BY MOUTH TWICE DAILY WITH MEALS",
      prescriber: "T. FICTITIOUS, DO",
    }),
    name: "Metformin HCL",
    dosage: "500 mg",
    frequency: "TWICE DAILY WITH MEALS",
    prescriber: "T. FICTITIOUS, DO",
  },
  {
    what: "release modifier is part of the product",
    text: retailLabel({
      patient: "SAMPLE C PATIENT",
      rx: "4471904",
      drug: "METOPROLOL SUCCINATE ER 25 MG TABLET",
      sig: "TAKE 1 TABLET BY MOUTH DAILY",
      prescriber: "PRESCRIBER: A. MADEUP NP",
    }),
    name: "Metoprolol Succinate ER",
    dosage: "25 mg",
    frequency: "TAKE 1 TABLET BY MOUTH DAILY",
    prescriber: null,
  },
  {
    what: "concentration stays a concentration",
    text: retailLabel({
      patient: "SAMPLE D PATIENT",
      rx: "4471905",
      drug: "AMOXICILLIN 250 MG/5 ML SUSPENSION",
      sig: "TAKE 5 ML BY MOUTH THREE TIMES DAILY FOR 10 DAYS",
      prescriber: "K. NOTREAL, MD",
    }),
    name: "Amoxicillin",
    dosage: "250 mg/5 mL",
    frequency: "THREE TIMES DAILY",
    prescriber: "K. NOTREAL, MD",
  },
  {
    what: "combination strength is kept whole",
    text: retailLabel({
      patient: "SAMPLE E PATIENT",
      rx: "4471906",
      drug: "LISINOPRIL-HCTZ 20-25 MG TABLET",
      sig: "TAKE 1 TABLET BY MOUTH EVERY MORNING",
      prescriber: "DR. J. INVENTED",
    }),
    name: "Lisinopril-HCTZ",
    dosage: "20-25 mg",
    frequency: "EVERY MORNING",
    prescriber: "J. INVENTED",
  },
  {
    what: "micrograms",
    text: retailLabel({
      patient: "SAMPLE F PATIENT",
      rx: "4471907",
      drug: "LEVOTHYROXINE 88 MCG TABLET",
      sig: "TAKE 1 TABLET BY MOUTH DAILY ON AN EMPTY STOMACH",
      prescriber: "M. PRETEND, MD",
    }),
    name: "Levothyroxine",
    dosage: "88 mcg",
    frequency: "DAILY",
    prescriber: "M. PRETEND, MD",
  },
  {
    what: "an as-needed sig is still carried verbatim",
    text: retailLabel({
      patient: "SAMPLE G PATIENT",
      rx: "4471908",
      drug: "IBUPROFEN 600 MG TABLET",
      sig: "TAKE 1 TABLET BY MOUTH EVERY 6 HOURS AS NEEDED FOR PAIN",
      prescriber: "L. IMAGINARY, PA-C",
    }),
    name: "Ibuprofen",
    dosage: "600 mg",
    frequency: "AS NEEDED FOR PAIN",
    prescriber: "L. IMAGINARY, PA-C",
  },
  {
    what: "an abbreviated sig is not expanded",
    text: retailLabel({
      patient: "SAMPLE H PATIENT",
      rx: "4471909",
      drug: "ATORVASTATIN 40 MG TABLET",
      sig: "TAKE 1 TAB PO QHS",
      prescriber: "N. FABRICATED, MD",
    }),
    name: "Atorvastatin",
    dosage: "40 mg",
    frequency: "QHS",
    prescriber: "N. FABRICATED, MD",
  },
  {
    what: "percentage strength, topical",
    text: retailLabel({
      patient: "SAMPLE I PATIENT",
      rx: "4471910",
      drug: "HYDROCORTISONE 1% CREAM",
      sig: "APPLY TO AFFECTED AREA TWICE DAILY",
      prescriber: "P. UNREAL, MD",
    }),
    name: "Hydrocortisone",
    dosage: "1%",
    frequency: "APPLY TO AFFECTED AREA TWICE DAILY",
    prescriber: "P. UNREAL, MD",
  },
  {
    what: "units",
    text: retailLabel({
      patient: "SAMPLE J PATIENT",
      rx: "4471911",
      drug: "INSULIN GLARGINE 100 UNITS/ML SOLUTION",
      sig: "INJECT 20 UNITS SUBCUTANEOUSLY AT BEDTIME",
      prescriber: "Q. NONEXISTENT, MD",
    }),
    name: "Insulin Glargine",
    dosage: "100 units/mL",
    frequency: "AT BEDTIME",
    prescriber: "Q. NONEXISTENT, MD",
  },
  {
    what: "drug line above the sig, no prescriber prefix",
    text: [
      PHARMACY_HEADER,
      "RX# 5501234",
      "SAMPLE K PATIENT",
      "SERTRALINE 50 MG TABLET",
      "TAKE 1 TABLET BY MOUTH EVERY MORNING",
      "S. NOTAPERSON, MD",
      ...DISPENSING_FOOTER,
    ].join("\n"),
    name: "Sertraline",
    dosage: "50 mg",
    frequency: "EVERY MORNING",
    prescriber: "S. NOTAPERSON, MD",
  },
  {
    what: "patient name is prominent and must not become the drug",
    text: [
      "SAMPLE L PATIENT",
      "12 NOWHERE LANE",
      "SPRINGFIELD IL 62704",
      PHARMACY_HEADER,
      "RX# 5501235",
      "GABAPENTIN 300 MG CAPSULE",
      "TAKE 1 CAPSULE BY MOUTH THREE TIMES DAILY",
      ...DISPENSING_FOOTER,
    ].join("\n"),
    name: "Gabapentin",
    dosage: "300 mg",
    frequency: "THREE TIMES DAILY",
    prescriber: null,
  },
  {
    what: "no strength printed, only a form",
    text: [
      PHARMACY_HEADER,
      "RX# 5501236",
      "SAMPLE M PATIENT",
      "MULTIVITAMIN TABLET",
      "TAKE 1 TABLET BY MOUTH DAILY",
      ...DISPENSING_FOOTER,
    ].join("\n"),
    name: "Multivitamin",
    dosage: null,
    frequency: "TAKE 1 TABLET BY MOUTH DAILY",
    prescriber: null,
  },
  {
    what: "inhaler",
    text: retailLabel({
      patient: "SAMPLE N PATIENT",
      rx: "5501237",
      drug: "ALBUTEROL 90 MCG INHALER",
      sig: "INHALE 2 PUFFS EVERY 4 HOURS AS NEEDED",
      prescriber: "V. MADEUP, MD",
    }),
    name: "Albuterol",
    dosage: "90 mcg",
    frequency: "EVERY 4 HOURS AS NEEDED",
    prescriber: "V. MADEUP, MD",
  },
  {
    what: "lowercase label",
    text: [
      "corner drug pharmacy #1188",
      "rx# 5501238",
      "sample o patient",
      "amlodipine 5 mg tablet",
      "take 1 tablet by mouth daily",
      "prescriber: w. fake, md",
      "qty: 90",
    ].join("\n"),
    // A lowercase label is left lowercase. De-shouting block capitals is a
    // readability fix; re-casing text the label did not shout would be
    // editing the printed name.
    name: "amlodipine",
    dosage: "5 mg",
    frequency: "take 1 tablet by mouth daily",
    prescriber: "w. fake, md",
  },
  {
    what: "eye drops",
    text: retailLabel({
      patient: "SAMPLE P PATIENT",
      rx: "5501239",
      drug: "LATANOPROST 0.005% DROPS",
      sig: "INSTILL 1 DROP IN EACH EYE AT BEDTIME",
      prescriber: "Y. NOTREAL, MD",
    }),
    name: "Latanoprost",
    dosage: "0.005%",
    frequency: "AT BEDTIME",
    prescriber: "Y. NOTREAL, MD",
  },
];

/** Reports the score even when everything passes, so drift is visible. */
function score(): void {
  const fields = ["name", "dosage", "frequency", "prescriber"] as const;
  const totals: Record<string, { ok: number; of: number }> = {};
  for (const field of fields) totals[field] = { ok: 0, of: 0 };
  let wholeLabels = 0;

  for (const testCase of CASES) {
    const parsed = parseLabelText(testCase.text);
    let allOk = true;

    for (const field of fields) {
      const expected =
        field === "prescriber" ? testCase.prescriber : testCase[field];
      const actual =
        field === "prescriber" ? parsed.prescribingDoctor : parsed[field];

      totals[field].of += 1;
      const ok =
        expected === null
          ? actual === null || field === "prescriber"
          : actual !== null && actual.includes(expected);
      if (ok) totals[field].ok += 1;
      else allOk = false;
    }
    if (allOk) wholeLabels += 1;
  }

  const lines = fields.map(
    (f) => `  ${f.padEnd(12)} ${totals[f].ok}/${totals[f].of}`
  );
  // eslint-disable-next-line no-console
  console.log(
    [
      `label parser corpus: ${wholeLabels}/${CASES.length} labels fully correct`,
      ...lines,
    ].join("\n")
  );
}

describe("label parser, over whole labels", () => {
  it.each(CASES.map((c) => [c.what, c] as const))(
    "reads %s",
    (_what, testCase) => {
      const parsed = parseLabelText(testCase.text);

      if (testCase.name !== null) expect(parsed.name).toBe(testCase.name);
      if (testCase.dosage !== null) expect(parsed.dosage).toBe(testCase.dosage);
      if (testCase.frequency !== null) {
        expect(parsed.frequency).toContain(testCase.frequency);
      }
      if (testCase.prescriber !== null) {
        expect(parsed.prescribingDoctor).toContain(testCase.prescriber);
      }
    }
  );

  it("never mistakes the patient block for the medication", () => {
    for (const testCase of CASES) {
      const parsed = parseLabelText(testCase.text);
      expect(parsed.name ?? "").not.toMatch(/patient/i);
      expect(parsed.frequency ?? "").not.toMatch(/^SAMPLE /);
    }
  });

  it("returns something usable for every label in the corpus", () => {
    for (const testCase of CASES) {
      expect(hasAnyField(parseLabelText(testCase.text))).toBe(true);
    }
  });

  it("reports the corpus score", () => {
    score();
  });
});
