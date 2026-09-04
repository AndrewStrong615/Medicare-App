/**
 * The emergency card: what it holds, and how it is read and written.
 *
 * Shared by both platforms. The only thing that differs is where the bytes
 * land — see `emergencyCardStorage.ts` / `.web.ts`.
 *
 * ## ⛔ This is the one screen that must work when nothing else does
 *
 * The card is read from **on-device storage and nothing else**. There is no
 * `fetch` in this module, no API call behind the card screen, and a test
 * asserts it. A person holding an unlocked phone in an emergency may have no
 * signal, no data allowance, and a backend that is down; a card that needed
 * any of those would be a card that failed at the only moment it mattered.
 *
 * ## ⛔ MedHelp does not author, check, or interpret anything on this card
 *
 * Every field is free text the user typed, stored verbatim and rendered
 * verbatim. Nothing here parses an allergy, recognises a condition, validates
 * a blood type, or reasons about any of it — that would be app-authored
 * clinical content, which CLAUDE.md forbids outright. The card is a place to
 * write something down, not an assessment.
 *
 * Nothing reads this card either. It is not an input to triage, to the
 * emergency screening, or to anything else; those modules are fenced and
 * untouched.
 *
 * ## Where the data lives, and what that costs
 *
 * Allergies, conditions and the blood type are typed here and **never sent to
 * the MedHelp backend at all**. That is deliberate: the backend has no
 * encryption at rest (an open finding in CLAUDE.md), so the safest place for
 * new health data is a store it never reaches. The cost is that the card does
 * not follow the user to another device, and the editor says so.
 *
 * The medication mirror below is the exception in kind, and is discussed on
 * `mirrorMedications`.
 */

import { readRaw, removeRaw, writeRaw } from "@/services/emergencyCardStorage";

/**
 * SecureStore keys accept alphanumerics, ".", "-" and "_" only, and the web
 * store is happy with the same, so one constant serves both.
 */
const CARD_KEY = "medhelp_emergency_card";
const MEDICATIONS_KEY = "medhelp_emergency_medications";

/**
 * Shown in place of an empty field, never hidden.
 *
 * An empty row is information: someone reading this in an emergency needs to
 * know that "no allergies listed" means *nobody wrote any down*, not that
 * there are none. Hiding the row would let it read as the latter.
 */
export const NOT_PROVIDED = "Not provided";

export interface EmergencyCard {
  bloodType: string;
  allergies: string;
  conditions: string;
  contactName: string;
  contactRelationship: string;
  contactPhone: string;
  /** ISO 8601, set on save. Shown so a reader can judge how stale this is. */
  updatedAt: string | null;
}

export const EMPTY_CARD: EmergencyCard = {
  bloodType: "",
  allergies: "",
  conditions: "",
  contactName: "",
  contactRelationship: "",
  contactPhone: "",
  updatedAt: null,
};

/**
 * Per-field length cap.
 *
 * Not a validation rule about content — see the module note, nothing here
 * judges what the user wrote. It exists because Android's SecureStore warns
 * above ~2048 bytes for the whole value, and an uncapped free-text field
 * would silently push the record past that and lose the card.
 */
export const FIELD_MAX_LENGTH = 300;

/** Name and dosage only, of at most this many medications. See `mirrorMedications`. */
export const MIRRORED_MEDICATION_LIMIT = 25;

export interface MirroredMedication {
  name: string;
  dosage: string | null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, FIELD_MAX_LENGTH) : "";
}

/**
 * A stored record, whatever state it is in, as a card.
 *
 * Deliberately total: an absent key, malformed JSON, a record written by an
 * older build with different fields, and a browser that threw on read all
 * produce the empty card rather than an error. There is no failure mode here
 * that should stop the card screen rendering.
 */
function parseCard(raw: string | null): EmergencyCard {
  if (!raw) return { ...EMPTY_CARD };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_CARD };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_CARD };

  const record = parsed as Record<string, unknown>;
  return {
    bloodType: clean(record.bloodType),
    allergies: clean(record.allergies),
    conditions: clean(record.conditions),
    contactName: clean(record.contactName),
    contactRelationship: clean(record.contactRelationship),
    contactPhone: clean(record.contactPhone),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  };
}

export async function loadCard(): Promise<EmergencyCard> {
  return parseCard(await readRaw(CARD_KEY));
}

/**
 * Write the card, stamped with the moment it was saved.
 *
 * Throws when the store refuses. The editor turns that into a message rather
 * than swallowing it: someone who believes they have recorded a penicillin
 * allergy and has not is worse off than someone who knows the save failed.
 */
export async function saveCard(card: EmergencyCard): Promise<EmergencyCard> {
  const stamped: EmergencyCard = {
    bloodType: clean(card.bloodType),
    allergies: clean(card.allergies),
    conditions: clean(card.conditions),
    contactName: clean(card.contactName),
    contactRelationship: clean(card.contactRelationship),
    contactPhone: clean(card.contactPhone),
    updatedAt: new Date().toISOString(),
  };
  await writeRaw(CARD_KEY, JSON.stringify(stamped));
  return stamped;
}

/**
 * Remove the card and the medication mirror from this device.
 *
 * Both, always. Clearing the typed fields but leaving a list of medications
 * behind would be a clear that did not clear.
 */
export async function clearCard(): Promise<void> {
  await removeRaw(CARD_KEY);
  await removeRaw(MEDICATIONS_KEY);
}

/**
 * Keep an offline copy of the medication list for the card to show.
 *
 * ## Why there is a second copy of health data at all
 *
 * Medications are the one thing an emergency responder would most want from
 * this app, and they are already collected — but they live behind an
 * authenticated API call, which is exactly what the card cannot depend on.
 * The only way the card can show them with no signal is to have written them
 * down beforehand.
 *
 * So this is a real, deliberate widening of where health data rests: on web
 * it is `localStorage`, which survives the tab closing. It is stated on the
 * card, stated in the editor, and `clearCard()` removes it.
 *
 * ## What is copied
 *
 * Name and dosage, of at most `MIRRORED_MEDICATION_LIMIT` medications, each
 * field capped. Not the prescribing doctor, not the notes, not the refill
 * dates — none of that helps a responder, and every field left out is a field
 * that cannot leak from here. The cap is also what keeps the record inside
 * Android's SecureStore size limit.
 *
 * Never throws. A mirror that fails to write costs the card its medication
 * list; it must not cost the user their medication screen.
 */
export async function mirrorMedications(
  medications: { name: string; dosage: string | null }[]
): Promise<void> {
  const trimmed: MirroredMedication[] = medications
    .slice(0, MIRRORED_MEDICATION_LIMIT)
    .map((medication) => ({
      name: clean(medication.name),
      dosage: medication.dosage ? clean(medication.dosage) : null,
    }));

  try {
    await writeRaw(MEDICATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    // See the note above.
  }
}

export async function loadMirroredMedications(): Promise<MirroredMedication[]> {
  const raw = await readRaw(MEDICATIONS_KEY);
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    )
    .map((item) => ({ name: clean(item.name), dosage: clean(item.dosage) || null }))
    .filter((item) => item.name.length > 0)
    .slice(0, MIRRORED_MEDICATION_LIMIT);
}

/**
 * A `tel:` target for the emergency contact's number.
 *
 * The number is **displayed exactly as the user typed it** — this only
 * decides what to dial. Anything a dialler cannot use is stripped, and a
 * string with no digits at all returns null so the screen renders the text
 * without offering a call that would fail.
 *
 * `+`, `*`, `#` and `,` survive: an international prefix, an extension pause,
 * and tone digits are all things a real number can contain.
 */
export function dialableNumber(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+*#,]/g, "");
  return /\d/.test(cleaned) ? cleaned : null;
}
