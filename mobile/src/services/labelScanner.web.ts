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

import { createWorker } from "tesseract.js";

import { parseLabelText, type ParsedLabel } from "@/services/labelParser";
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
 * Recognise the label and return the medication fields.
 *
 * As on the native path, the full recognised text lives inside this function
 * and goes no further: it is parsed, and only the four medication fields come
 * back. The patient's name and address are never returned to a screen.
 */
export async function readLabel(uri: string): Promise<ParsedLabel> {
  let text: string;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    // Downloads the WASM core and English data on first use, then caches it.
    worker = await createWorker("eng");
    const result = await worker.recognize(uri);
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

  if (parsed.confidence === "none") {
    throw new ScanError(
      "unreadable",
      "No medication name could be read from that photo. Try again with the label flat and well lit, or type the details in yourself."
    );
  }

  return parsed;
}
