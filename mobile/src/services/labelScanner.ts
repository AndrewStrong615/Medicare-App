/**
 * Reading a prescription label with the device camera.
 *
 * ## Why on-device OCR, and nothing else
 *
 * A prescription label is close to a worst case for data handling. It carries
 * the patient's name and address, the prescriber, the pharmacy, an Rx number
 * and the drug and dose together — identifiable health information in a single
 * photograph. Sending that photo to a cloud OCR service would make that vendor
 * a processor of PHI, which under CLAUDE.md needs a signed BAA that this
 * project does not have with anyone.
 *
 * So the recognition runs on the phone:
 *
 * * iOS — Apple Vision, Android — Google ML Kit Text Recognition v2, both
 *   through `expo-mlkit-ocr`.
 * * The image is never uploaded. No network call is made by this module at
 *   all, which is a property you can check by reading it: there is no `fetch`
 *   here.
 * * It works with no signal, and costs nothing per scan.
 *
 * The cost of that choice is accuracy on hard photographs — a curled label on
 * a cylindrical bottle, low light, or a worn thermal print. Cloud OCR is
 * better at those. That is the trade being made, and it is why every read is
 * shown to the user for correction rather than trusted.
 *
 * ## The raw text does not leave this module
 *
 * `readLabel` recognises the text, parses it, and returns ONLY the four
 * medication fields. The full OCR string — which contains the patient's name
 * and address — is dropped on the floor inside this function. It is never
 * returned to a screen, never put in component state, never logged, and never
 * sent to the MedHelp backend. What ultimately reaches the server is exactly
 * what reaches it today when someone types the form in by hand.
 *
 * ## Requires a development build
 *
 * `expo-mlkit-ocr` is a native module and does not run in Expo Go. Every
 * import below is lazy and guarded, so on a build without the native module
 * the feature reports itself unavailable and the user is sent to manual entry
 * rather than hitting a crash.
 */

import { hasAnyField, parseLabelText, type ParsedLabel } from "@/services/labelParser";

// Defined in their own module so `labelScanner.web.ts` can throw exactly the
// same errors and the screen needs no platform knowledge. Re-exported here so
// existing importers are unaffected.
import { ScanError, type ImageSource, type ScanFailure } from "@/services/scanErrors";

export { ScanError };
export type { ImageSource, ScanFailure };

interface OcrModule {
  recognizeText: (uri: string) => Promise<{ text: string }>;
  isSupported?: () => boolean;
}

interface PickerModule {
  launchCameraAsync: (options: object) => Promise<PickerResult>;
  launchImageLibraryAsync: (options: object) => Promise<PickerResult>;
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
}

interface PickerResult {
  canceled: boolean;
  assets?: Array<{ uri: string }> | null;
}

/**
 * Load the native modules without letting a missing one crash the screen.
 *
 * Expo Go, the web build and the jest environment have none of these, and that
 * has to be an ordinary "not available here" rather than a red screen.
 *
 * THE MODULE NAME MUST BE A LITERAL. Metro resolves requires statically at
 * bundle time, so `require(someVariable)` is not merely discouraged — it fails
 * to resolve on a device even when the package is installed correctly. Written
 * that way, the catch below swallowed the failure and `isScanAvailable()`
 * returned false permanently, which looks exactly like "this phone doesn't
 * support it" and would have been very hard to spot in the field. Node's
 * require handles dynamic names happily, so the tests passed throughout.
 */
function ocrModule(): OcrModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("expo-mlkit-ocr") as OcrModule;
    // On web the package may resolve to a stub with no native binding behind
    // it, so presence of the module is not proof it can do anything.
    return typeof loaded?.recognizeText === "function" ? loaded : null;
  } catch {
    return null;
  }
}

function pickerModule(): PickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("expo-image-picker") as PickerModule;
    return typeof loaded?.launchCameraAsync === "function" ? loaded : null;
  } catch {
    return null;
  }
}

/**
 * Whether scanning can run at all on this build and device.
 *
 * False on Expo Go, on a build without the native module, and on devices below
 * the OS versions ML Kit needs. The UI uses this to decide whether to offer
 * the option — an option that always fails is worse than no option.
 */
export function isScanAvailable(): boolean {
  const ocr = ocrModule();
  const picker = pickerModule();
  if (!ocr || !picker) return false;

  try {
    if (typeof ocr.isSupported === "function" && !ocr.isSupported()) return false;
  } catch {
    // Asking an absent native binding whether it is supported can throw
    // rather than answer. That is an answer.
    return false;
  }

  return true;
}

/**
 * Ask for a photo of the label. Returns its local URI, or null if the user
 * backed out.
 *
 * Nothing is uploaded. The URI points at a file on the device, and it is used
 * only as an argument to on-device recognition.
 */
export async function captureLabelImage(source: ImageSource): Promise<string | null> {
  const picker = pickerModule();
  if (!picker) {
    throw new ScanError(
      "unavailable",
      "Scanning isn't available in this version of the app."
    );
  }

  const permission =
    source === "camera"
      ? await picker.requestCameraPermissionsAsync()
      : await picker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new ScanError(
      "permission-denied",
      source === "camera"
        ? "MedHelp needs permission to use the camera to read a label. You can still type the details in yourself."
        : "MedHelp needs permission to open your photos to read a label. You can still type the details in yourself."
    );
  }

  const options = {
    mediaTypes: ["images"],
    // The label is the subject, so let the user crop to it. A tighter crop is
    // the single biggest thing that improves an on-device read.
    allowsEditing: true,
    quality: 1,
  };

  const result =
    source === "camera"
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);

  if (result.canceled) return null;

  const uri = result.assets?.[0]?.uri;
  if (!uri) return null;

  return uri;
}

/**
 * Recognise the label in an image and return the medication fields.
 *
 * The recognised text is parsed and discarded inside this function. Only the
 * parsed fields come back — see the note at the top of this file.
 */
export async function readLabel(uri: string): Promise<ParsedLabel> {
  const ocr = ocrModule();
  if (!ocr) {
    throw new ScanError(
      "unavailable",
      "Scanning isn't available in this version of the app."
    );
  }

  let recognised: { text: string };
  try {
    recognised = await ocr.recognizeText(uri);
  } catch {
    throw new ScanError(
      "failed",
      "That photo couldn't be read. You can try another photo, or type the details in yourself."
    );
  }

  // The only place the full label text exists. It goes no further than the
  // next line.
  const parsed = parseLabelText(recognised?.text ?? "");

  // Refused only when the photo yielded nothing at all. A read that missed
  // the drug name but got the directions is still a head start, and it is
  // handed over with the missing fields named in `warnings` — see
  // `hasAnyField`. Throwing on a missing name discarded the rest of a good
  // read and left the user with an empty form.
  if (!hasAnyField(parsed)) {
    throw new ScanError(
      "unreadable",
      "Nothing could be read from that photo. Try again with the label flat and well lit, or type the details in yourself."
    );
  }

  return parsed;
}
