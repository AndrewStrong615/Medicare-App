/**
 * Turns the raw text off a prescription label into the fields the medication
 * form already has.
 *
 * This is a pure function over a string. It does no I/O, holds no state, and
 * knows nothing about cameras — which is what makes it testable against a
 * pile of real-world label layouts without a device.
 *
 * ## What this deliberately does NOT do
 *
 * **It does not interpret the prescription.** The directions line is carried
 * across VERBATIM. "TAKE 1 TABLET BY MOUTH TWICE DAILY" is copied, not
 * reworded, and abbreviations like BID/TID/QHS are left exactly as printed.
 * Expanding them would mean this app authoring dosing instructions from an
 * abbreviation it decoded, and a wrong expansion changes when someone takes a
 * medication. CLAUDE.md forbids agent-authored clinical content; rendering the
 * source text unchanged is the same rule the MedlinePlus code follows.
 *
 * **It does not check, correct, or recognise drug names.** There is no
 * dictionary and no spell-correction. A misread name stays misread so the user
 * can see it is wrong. Silently "fixing" OCR output to the nearest real drug is
 * how you turn a legible mistake into a plausible one.
 *
 * **It does not convert or restate a dose.** Numbers are never rounded or
 * converted between units. Spacing and capitalisation are tidied; the value is
 * not. A concentration stays a concentration — "250 mg/5 mL" does not become
 * "250 mg", because those mean different things to whoever reads it next.
 *
 * **It does not extract the patient's name, address, or Rx number**, even
 * though they are usually the most prominent text on the label. The app has no
 * field for them, so reading them out would create identifiable health
 * information with nowhere to go. Only the four fields the medication form
 * already stores are pulled out.
 *
 * ## What the caller must do
 *
 * Everything here is a guess about a photograph. Nothing this returns may be
 * saved without the user confirming it on screen first — see
 * `MedicationScanScreen`. A misread dosage that saves itself is a
 * medication-timing error with no human in the loop.
 */

export type LabelConfidence = "high" | "partial" | "none";

export interface ParsedLabel {
  name: string | null;
  dosage: string | null;
  /** The directions line, exactly as printed. Never reworded. */
  frequency: string | null;
  prescribingDoctor: string | null;
  confidence: LabelConfidence;
  /** Plain-language notes on what could not be read, shown to the user. */
  warnings: string[];
}

function emptyResult(): ParsedLabel {
  return {
    name: null,
    dosage: null,
    frequency: null,
    prescribingDoctor: null,
    confidence: "none",
    warnings: ["Nothing readable was found on this photo."],
  };
}

/** Units seen on a dispensed label. */
const UNIT = "mcg|mg|g|ml|units?|iu|%";

/**
 * A strength, including the forms that carry more than one number:
 *
 *   "10mg"            single strength
 *   "20-25 mg"        combination product — both numbers are the dose
 *   "250 MG/5 ML"     a concentration, not a plain strength
 *   "100 UNITS/ML"    a concentration whose denominator has no number
 *
 * Splitting any of these apart would misstate the dose, so the whole
 * expression is matched and kept together.
 *
 * The denominator's number is optional because plenty of concentrations are
 * printed without one — "100 units/mL" and "5 mg/mL" are per *one* millilitre
 * and simply do not write the 1. Requiring it stopped the match at "100
 * units", which is not the same quantity: it turns a concentration into a
 * plain strength, exactly the restatement this module is not allowed to make.
 * It also left the orphaned "/ML" behind on the line for `extractName` to
 * read as part of the drug's name.
 */
const STRENGTH = new RegExp(
  `\\d+(?:\\.\\d+)?(?:\\s*-\\s*\\d+(?:\\.\\d+)?)*\\s*(?:${UNIT})` +
    `(?:\\s*/\\s*(?:\\d+(?:\\.\\d+)?\\s*)?(?:${UNIT}))?` +
    `(?![a-z])`,
  "i"
);

/**
 * Dosage forms — used to spot the drug line and to tidy the name.
 *
 * Release modifiers (ER, XR, SR) and salts (HCl) are deliberately absent:
 * they are part of the product, and "Metformin ER" is not the same product as
 * "Metformin". Only things that describe the physical form are listed.
 */
const FORM_WORDS = [
  "tablets",
  "tablet",
  "tabs",
  "tab",
  "capsules",
  "capsule",
  "caps",
  "cap",
  "caplets",
  "caplet",
  "softgels",
  "softgel",
  "solution",
  "suspension",
  "syrup",
  "elixir",
  "cream",
  "ointment",
  "gel",
  "patches",
  "patch",
  "inhaler",
  "drops",
  "spray",
  "injection",
  "suppository",
  "lotion",
  "powder",
  "oral",
];

const FORM_WORD_SET = new Set(FORM_WORDS);

/**
 * Lines that are never the drug, the directions, or the prescriber.
 *
 * Pharmacy branding, the patient block and the dispensing metadata sit around
 * the useful text and would otherwise be mistaken for it — the patient's name
 * in particular is usually the largest text on the label.
 */
const NOISE_PATTERNS: RegExp[] = [
  /\b(pharmacy|pharmacies|drug\s*store|walgreens|cvs|rite\s*aid|walmart|costco|kroger|safeway)\b/i,
  /\brx\s*(#|no\.?|number)?\s*[:#]?\s*\d/i,
  /\bndc\b/i,
  /\b(qty|quantity)\b\s*[:.]?\s*\d/i,
  /\brefills?\b/i,
  /\bdiscard\s+after\b/i,
  /\bkeep\s+out\s+of\s+(the\s+)?reach\b/i,
  /\bfederal\s+law\b/i,
  /\bstore\s+at\b/i,
  /\bexp(iry|ires|iration)?\b\s*[:.]?\s*\d/i,
  /\bfilled\b\s*[:.]?\s*\d/i,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  /^\s*\d+\s+[a-z].*\b(st|street|ave|avenue|rd|road|blvd|drive|ln|lane|way|suite|ste|apt)\b/i,
  /\b[A-Z]{2}\s+\d{5}(-\d{4})?\b/,
  /\bwww\.|\.com\b/i,
];

/** Words that mark a directions ("sig") line. */
const SIG_VERBS =
  /^\s*(take|takes|use|uses|apply|applies|inject|instill|insert|inhale|place|swallow|chew|give|dissolve|rinse|drink)\b/i;

const FREQUENCY_HINTS =
  /\b(daily|day|days|nightly|weekly|hourly|bedtime|morning|evening|night|noon|hours?|hrs?|times?|twice|thrice|once|every\s+other|as\s+needed|prn|bid|tid|qid|qhs|qd|q\d+h|with\s+meals?|before\s+meals?|after\s+meals?|mealtimes?)\b/i;

const PRESCRIBER_PREFIX =
  /^\s*(prescriber|prescribed\s+by|doctor|physician|dr)\b\s*[:.]?\s*/i;
const PRESCRIBER_SUFFIX =
  /,?\s*\b(m\.?\s?d\.?|d\.?\s?o\.?|n\.?\s?p\.?|p\.?\s?a\.?-?c?|d\.?\s?d\.?\s?s\.?)\b\.?\s*$/i;

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

const UNIT_CASE: Record<string, string> = {
  mcg: "mcg",
  mg: "mg",
  g: "g",
  ml: "mL",
  unit: "unit",
  units: "units",
  iu: "IU",
};

/**
 * Tidy a matched strength: spacing and unit capitalisation only.
 *
 * The number itself is never touched. "10MG" becomes "10 mg" because that is
 * easier to read; it does not become "10mg of something else".
 */
function normaliseDosage(matched: string): string {
  let text = matched.replace(/\s+/g, " ").trim();

  text = text.replace(
    new RegExp(`(\\d)\\s*(${UNIT})`, "gi"),
    (_full, digit: string, unit: string) => {
      if (unit === "%") return `${digit}%`;
      return `${digit} ${UNIT_CASE[unit.toLowerCase()] ?? unit.toLowerCase()}`;
    }
  );

  // A unit straight after the slash has no number in front of it to key off
  // ("100 UNITS/ML"), so it needs its own pass or it stays shouted.
  text = text.replace(
    new RegExp(`(/)\\s*(${UNIT})`, "gi"),
    (_full, slash: string, unit: string) => {
      if (unit === "%") return `${slash}%`;
      return `${slash}${UNIT_CASE[unit.toLowerCase()] ?? unit.toLowerCase()}`;
    }
  );

  // "20 - 25 mg" -> "20-25 mg", "250 mg / 5 mL" -> "250 mg/5 mL".
  text = text.replace(/\s*([-/])\s*/g, "$1");

  return text;
}

function containsFormWord(line: string): boolean {
  return line
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => word.length > 0 && FORM_WORD_SET.has(word));
}

/**
 * Labels are usually printed in block capitals. Shouting the name back at the
 * user is a readability problem, not a data problem, so the case is tidied —
 * but an all-caps abbreviation like "HCL", "XR" or "HCTZ" is left alone,
 * because that is how the product is actually written.
 *
 * An abbreviation is recognised as one of two orthographic shapes: very short
 * ("XR", "ER", "HFA"), or containing no vowel at all ("HCL", "HCTZ", "SMZ").
 * Length alone was not enough — "LISINOPRIL-HCTZ" came back as
 * "Lisinopril-Hctz", which is not the name of the product. Neither test reads
 * a dictionary or asks what the letters stand for.
 */
const VOWELS = /[aeiouy]/i;

function toDisplayCase(word: string): string {
  return word
    .split("-")
    .map((part) => {
      if (!part) return part;
      if (part !== part.toUpperCase()) return part;
      if (part.length <= 3 || !VOWELS.test(part)) return part;
      return part.charAt(0) + part.slice(1).toLowerCase();
    })
    .join("-");
}

/**
 * Strip the strength and any trailing form words off the drug line.
 *
 *   "LISINOPRIL 10MG TABLETS"  -> "Lisinopril"
 *   "METFORMIN HCL 500 MG TAB" -> "Metformin HCL"
 *
 * Only trailing form words are removed. A form word in the middle is left
 * alone, because it may be part of the product name.
 */
function extractName(line: string): string | null {
  let working = line.replace(STRENGTH, " ");

  // Drop a leading list marker from a multi-drug printout.
  working = working.replace(/^\s*(\d+[.)]|[-*•])\s*/, "");

  let words = working
    .split(/\s+/)
    .map((word) => word.replace(/^[^\w%]+|[^\w%]+$/g, ""))
    .filter((word) => word.length > 0);

  while (words.length > 0) {
    const last = words[words.length - 1].toLowerCase();
    if (FORM_WORD_SET.has(last)) {
      words.pop();
    } else {
      break;
    }
  }

  // A bare number left over is dispensing metadata, not part of the name.
  words = words.filter((word) => !/^\d+$/.test(word));

  if (words.length === 0) return null;

  return words.map(toDisplayCase).join(" ");
}

function cleanPrescriber(line: string): string | null {
  const withoutPrefix = line.replace(PRESCRIBER_PREFIX, "");
  const cleaned = withoutPrefix.replace(/^[^\w]+/, "").replace(/[^\w.]+$/, "").trim();
  if (!cleaned) return null;
  // A line that is only a credential carries no name.
  if (/^(m\.?d\.?|d\.?o\.?|n\.?p\.?|p\.?a\.?-?c?)$/i.test(cleaned)) return null;
  return cleaned;
}

function looksLikePrescriber(line: string): boolean {
  if (isNoise(line)) return false;
  if (SIG_VERBS.test(line)) return false;
  return PRESCRIBER_PREFIX.test(line) || PRESCRIBER_SUFFIX.test(line);
}

/**
 * Parse raw OCR text into the medication form's fields.
 *
 * Every field is independently optional. A label that yields only a name is
 * still a useful result — the user gets a head start and fills in the rest —
 * so partial reads are returned rather than rejected.
 */
export function parseLabelText(raw: string): ParsedLabel {
  if (!raw || !raw.trim()) return emptyResult();

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return emptyResult();

  const usable = lines.filter((line) => !isNoise(line));

  // --- the drug line -------------------------------------------------------
  // Only a line carrying a strength or a dosage form is considered. A line
  // that is merely prominent is far more likely to be the patient's name, and
  // guessing wrong there would put a person's name in the medication field.
  const withStrength = usable.filter(
    (line) => STRENGTH.test(line) && !SIG_VERBS.test(line)
  );
  const withForm = usable.filter(
    (line) => containsFormWord(line) && !SIG_VERBS.test(line)
  );

  const drugLine = withStrength[0] ?? withForm[0] ?? null;

  let name: string | null = null;
  let dosage: string | null = null;

  if (drugLine) {
    name = extractName(drugLine);
    const match = STRENGTH.exec(drugLine);
    if (match) dosage = normaliseDosage(match[0]);
  }

  // --- the directions line -------------------------------------------------
  // Carried across verbatim. See the module comment: this app does not
  // rewrite dosing instructions.
  const sigLine =
    usable.find((line) => SIG_VERBS.test(line)) ??
    usable.find((line) => line !== drugLine && FREQUENCY_HINTS.test(line)) ??
    null;

  const frequency = sigLine ? sigLine.replace(/\s+/g, " ").trim() : null;

  // --- the prescriber ------------------------------------------------------
  const prescriberLine = usable.find(
    (line) => line !== drugLine && line !== sigLine && looksLikePrescriber(line)
  );
  const prescribingDoctor = prescriberLine ? cleanPrescriber(prescriberLine) : null;

  // --- how much of this to trust -------------------------------------------
  const warnings: string[] = [];
  if (!name) warnings.push("The medication name could not be read.");
  if (!dosage) warnings.push("The dosage could not be read.");
  if (!frequency) warnings.push("The directions could not be read.");

  let confidence: LabelConfidence;
  if (!name) {
    confidence = "none";
  } else if (dosage && frequency) {
    confidence = "high";
  } else {
    confidence = "partial";
  }

  return { name, dosage, frequency, prescribingDoctor, confidence, warnings };
}

/**
 * Whether a parse produced anything worth carrying into the form.
 *
 * This is deliberately not `confidence !== "none"`. `confidence` answers a
 * different question: it is "none" whenever the drug *name* is missing, even
 * when the directions and the prescriber came through perfectly. Treating
 * that as a failed read discarded fields that had been read correctly and
 * returned the user to an empty form with nothing to show for the photo —
 * the dead end this feature is not allowed to have.
 *
 * A read is useful if any single field survived. Only a photo that yielded
 * nothing at all is worth refusing.
 */
export function hasAnyField(parsed: ParsedLabel): boolean {
  return Boolean(
    parsed.name || parsed.dosage || parsed.frequency || parsed.prescribingDoctor
  );
}
