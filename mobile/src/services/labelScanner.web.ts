/**
 * Label scanning in a browser.
 *
 * Metro picks this file over `labelScanner.ts` for web builds. It exposes the
 * same three functions, throws the same `ScanError`s, and hands back the same
 * `ParsedLabel`, so `MedicationScanScreen` needs no idea which one it got.
 *
 * ## Why a different engine
 *
 * The native scanner uses Apple Vision and Google ML Kit. Both are operating
 * system frameworks; a browser cannot reach either, on any platform. So the
 * web build uses Tesseract compiled to WebAssembly, which runs inside the page.
 *
 * That makes scanning work on an iPhone through Safari with no App Store, no
 * development build, and no Apple Developer account — which is the only free
 * route onto an iOS device.
 *
 * ## The privacy property, stated precisely
 *
 * **The photograph never leaves the browser.** It is read into a data URL and
 * handed to WebAssembly running in the page. There is no upload, no server
 * round trip, and no OCR vendor. The label — patient name, address, Rx number
 * — stays on the device exactly as it does on the native path.
 *
 * **But this engine is not a zero-network engine, and the native one is.** On
 * first use Tesseract fetches its WASM core and English training data from a
 * CDN (several megabytes, then cached). What travels is the *model, coming
 * down* — never the user's image going up. That distinction matters for this
 * app: no PHI is transmitted, so no BAA question arises, but the claim "makes
 * no network call" is true of `labelScanner.ts` and false here. Do not copy
 * that sentence onto this file.
 *
 * If even the model fetch is unacceptable later, the assets can be self-hosted
 * by pointing `workerPath`/`corePath`/`langPath` at our own origin. That is a
 * deployment change, not a code change.
 *
 * ## Accuracy
 *
 * Tesseract is meaningfully worse than Apple Vision or ML Kit on the hard
 * cases — a curled label on a round bottle, low light, worn thermal print. It
 * is fine on a flat, well-lit label. Since every read is confirmed by the user
 * before saving, a worse engine costs accuracy and the user's patience, not
 * safety.
 */

import { createWorker, PSM } from "tesseract.js";

import { hasAnyField, parseLabelText, type ParsedLabel } from "@/services/labelParser";
import {
  MANUAL_FALLBACK,
  ScanError,
  type ImageSource,
} from "@/services/scanErrors";

export { ScanError };
export type { ImageSource, ScanFailure } from "@/services/scanErrors";

/**
 * Whether scanning can run in this browser.
 *
 * Needs a DOM to open a file picker and WebAssembly to run the engine. Both
 * are present in every browser this app supports, but an old one or a locked
 * down environment can be missing WASM, and that has to degrade to manual
 * entry rather than throw.
 */
export function isScanAvailable(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    typeof FileReader !== "undefined"
  );
}

/**
 * Ask for a photo of the label.
 *
 * A hidden file input does the work. With `capture="environment"` iOS Safari
 * and Android Chrome open the rear camera directly, which is what makes this
 * feel like scanning rather than uploading; where capture is unsupported the
 * browser falls back to its own picker, which is a perfectly good outcome.
 *
 * Resolves to a data URL, or null if the user backed out.
 */
export function captureLabelImage(source: ImageSource): Promise<string | null> {
  if (!isScanAvailable()) {
    return Promise.reject(
      new ScanError("unavailable", `Scanning isn't available in this browser. ${MANUAL_FALLBACK}`)
    );
  }

  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") {
      // Opens the rear camera on a phone. Ignored on desktop.
      input.setAttribute("capture", "environment");
    }
    input.style.display = "none";

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (error: ScanError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      window.removeEventListener("focus", onFocus);
      input.remove();
    };

    // Cancelling a file dialog fires no event in most browsers. Returning
    // focus to the page is the only signal, and it needs a beat for a
    // selection to register before "nothing was chosen" means cancelled.
    const onFocus = () => {
      window.setTimeout(() => {
        if (!input.files || input.files.length === 0) finish(null);
      }, 600);
    };

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return finish(null);

      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? finish(reader.result)
          : fail(new ScanError("failed", `That photo couldn't be opened. ${MANUAL_FALLBACK}`));
      reader.onerror = () =>
        fail(new ScanError("failed", `That photo couldn't be opened. ${MANUAL_FALLBACK}`));
      reader.readAsDataURL(file);
    };

    window.addEventListener("focus", onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * How wide the image should be before Tesseract sees it.
 *
 * Tesseract needs roughly 20-30 pixels of character height to read a glyph
 * reliably, and the small print on a label — the prescriber, the quantity, the
 * NDC — is the first thing to fall below that. It is a resolution problem, not
 * a focus problem: the same label rendered smaller loses the fine print while
 * the big lines stay perfect.
 *
 * Measured on synthetic labels photographed at decreasing sizes: at roughly
 * 8px of body type the prescriber line was lost outright, and enlarging the
 * image before recognition brought it back. 1600px was the smallest target
 * that recovered everything recoverable; going wider changed nothing and only
 * costs memory.
 */
const OCR_TARGET_WIDTH = 1600;

/**
 * Enlarging past this stops helping.
 *
 * Interpolation invents no detail that was not captured, so a genuinely
 * under-resolved photo — text a handful of pixels tall — stays unreadable
 * however far it is blown up. The cap keeps a tiny image from being scaled to
 * something enormous for no gain.
 */
const OCR_MAX_UPSCALE = 4;

/** Guards against a decode that never settles leaving the user with a spinner. */
const DECODE_TIMEOUT_MS = 8_000;

/**
 * Whether this environment can actually do the preprocessing.
 *
 * jsdom has a `<canvas>` element but no 2D context behind it, and a locked
 * down browser can refuse one too. Both must skip preprocessing quietly rather
 * than fail the scan — a slightly worse read beats no read.
 */
function canPreprocess(): boolean {
  if (typeof document === "undefined" || typeof Image === "undefined") return false;
  try {
    return document.createElement("canvas").getContext("2d") !== null;
  } catch {
    return false;
  }
}

function decode(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error("decode timed out")), DECODE_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("decode failed"));
    };
    image.src = uri;
  });
}

/**
 * Enlarge a small photo, and flatten it to grey, before recognition.
 *
 * Both steps happen in a canvas inside the page. **Nothing here touches the
 * network** — the privacy property at the top of this file is unchanged, and
 * the enlarged copy is a local blob that is dropped when this function
 * returns.
 *
 * Returns the original URI untouched whenever preprocessing cannot run or is
 * not needed, so a failure here can never fail a scan.
 */
async function prepareForOcr(uri: string): Promise<string> {
  if (!canPreprocess()) return uri;

  try {
    const image = await decode(uri);
    if (!image.width || !image.height) return uri;

    // Already big enough: leave a phone-camera photo exactly as it is.
    const factor = Math.min(OCR_TARGET_WIDTH / image.width, OCR_MAX_UPSCALE);
    if (factor <= 1) return uri;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * factor);
    canvas.height = Math.round(image.height * factor);

    const context = canvas.getContext("2d");
    if (!context) return uri;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Colour carries nothing on a printed label, and dropping it measurably
    // recovered the prescriber line on the smallest photographs. It never made
    // any field worse across the sizes tested.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = grey;
      data[i + 1] = grey;
      data[i + 2] = grey;
    }
    context.putImageData(pixels, 0, 0);

    return canvas.toDataURL("image/png");
  } catch {
    // Every failure here is recoverable by just using the original photo.
    return uri;
  }
}

/**
 * Recognise the label and return the medication fields.
 *
 * As on the native path, the full recognised text lives inside this function
 * and goes no further: it is parsed, and only the four medication fields come
 * back. The patient's name and address are never returned to a screen.
 */
export async function readLabel(uri: string): Promise<ParsedLabel> {
  let text: string;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  const prepared = await prepareForOcr(uri);

  try {
    // Downloads the WASM core and English data on first use, then caches it.
    worker = await createWorker("eng");

    // A pharmacy label is one column of text in wildly different sizes: a
    // large drug name, a large sig line, and small print around them. That is
    // exactly what PSM 4 describes, and Tesseract's default auto-segmentation
    // gets it wrong in the worst possible place — it discarded the single
    // largest line on the label, which on a dispensed label is always the drug
    // name. Measured on synthetic labels: the name was lost at 40px and read
    // correctly at 26px, and setting this recovers it at every size while
    // changing nothing else that was already being read.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });

    const result = await worker.recognize(prepared);
    text = result?.data?.text ?? "";
  } catch {
    throw new ScanError(
      "failed",
      `That photo couldn't be read. You can try another photo, or type the details in yourself.`
    );
  } finally {
    // The worker holds a WASM instance and a web worker. Leaking one per scan
    // would quietly chew through memory on a phone.
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // Nothing useful to do; the scan already succeeded or failed.
      }
    }
  }

  // The only place the full label text exists. It goes no further.
  const parsed = parseLabelText(text);

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
