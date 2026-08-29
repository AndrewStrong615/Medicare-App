/**
 * Tests for the label scanner.
 *
 * The native modules are not installed in this environment (they need a
 * development build), so they are supplied as virtual mocks. That is also what
 * lets the "no native module" case be tested honestly rather than assumed.
 *
 * Two of these tests are the reason the feature is safe to ship at all:
 *
 * * `readLabel` makes no network call. The photo and the text read from it
 *   stay on the device.
 * * `readLabel` returns only the four medication fields. The rest of the
 *   label — the patient's name, address and Rx number — is discarded inside
 *   the function and never reaches a screen.
 *
 * Every label string below is synthetic.
 */

const SYNTHETIC_LABEL = [
  "CVS/pharmacy",
  "742 Evergreen Terrace",
  "Springfield IL 62701",
  "Rx# 8675309",
  "DOE, JANE A",
  "LISINOPRIL 10MG TABLETS",
  "TAKE 1 TABLET BY MOUTH ONCE DAILY",
].join("\n");

interface Fakes {
  recognised?: string;
  recogniseFails?: boolean;
  supported?: boolean;
  ocrMissing?: boolean;
  pickerMissing?: boolean;
  granted?: boolean;
  canceled?: boolean;
  uri?: string | null;
}

function loadScanner(fakes: Fakes = {}) {
  const {
    recognised = SYNTHETIC_LABEL,
    recogniseFails = false,
    supported = true,
    ocrMissing = false,
    pickerMissing = false,
    granted = true,
    canceled = false,
    uri = "file:///tmp/synthetic-label.jpg",
  } = fakes;

  jest.resetModules();

  const recognizeText = jest.fn(async () => {
    if (recogniseFails) throw new Error("RECOGNITION_FAILED");
    return { text: recognised };
  });

  const launchCameraAsync = jest.fn(async () => ({
    canceled,
    assets: uri ? [{ uri }] : null,
  }));
  const launchImageLibraryAsync = jest.fn(async () => ({
    canceled,
    assets: uri ? [{ uri }] : null,
  }));
  const requestCameraPermissionsAsync = jest.fn(async () => ({ granted }));
  const requestMediaLibraryPermissionsAsync = jest.fn(async () => ({ granted }));

  if (ocrMissing) {
    jest.doMock(
      "expo-mlkit-ocr",
      () => {
        throw new Error("Cannot find native module 'ExpoMlkitOcr'");
      },
      { virtual: true }
    );
  } else {
    jest.doMock(
      "expo-mlkit-ocr",
      () => ({ recognizeText, isSupported: () => supported }),
      { virtual: true }
    );
  }

  if (pickerMissing) {
    jest.doMock(
      "expo-image-picker",
      () => {
        throw new Error("missing");
      },
      { virtual: true }
    );
  } else {
    jest.doMock(
      "expo-image-picker",
      () => ({
        launchCameraAsync,
        launchImageLibraryAsync,
        requestCameraPermissionsAsync,
        requestMediaLibraryPermissionsAsync,
      }),
      { virtual: true }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const scanner = require("@/services/labelScanner");
  return {
    scanner,
    recognizeText,
    launchCameraAsync,
    launchImageLibraryAsync,
    requestCameraPermissionsAsync,
  };
}

describe("isScanAvailable", () => {
  it("is available when the native modules are present and supported", () => {
    const { scanner } = loadScanner();

    expect(scanner.isScanAvailable()).toBe(true);
  });

  it("is unavailable when the OCR native module is missing", () => {
    // The Expo Go case. It has to be an ordinary "not here", not a crash.
    const { scanner } = loadScanner({ ocrMissing: true });

    expect(scanner.isScanAvailable()).toBe(false);
  });

  it("is unavailable when the image picker is missing", () => {
    const { scanner } = loadScanner({ pickerMissing: true });

    expect(scanner.isScanAvailable()).toBe(false);
  });

  it("is unavailable when the device is too old for on-device recognition", () => {
    const { scanner } = loadScanner({ supported: false });

    expect(scanner.isScanAvailable()).toBe(false);
  });
});

describe("captureLabelImage", () => {
  it("returns the local file URI of the photo", async () => {
    const { scanner } = loadScanner();

    await expect(scanner.captureLabelImage("camera")).resolves.toBe(
      "file:///tmp/synthetic-label.jpg"
    );
  });

  it("returns null when the user backs out of the camera", async () => {
    const { scanner } = loadScanner({ canceled: true });

    // Backing out is not a failure and must not raise an error at the user.
    await expect(scanner.captureLabelImage("camera")).resolves.toBeNull();
  });

  it("asks for permission before opening the camera", async () => {
    const { scanner, requestCameraPermissionsAsync } = loadScanner();

    await scanner.captureLabelImage("camera");

    expect(requestCameraPermissionsAsync).toHaveBeenCalled();
  });

  it("does not open the camera when permission is refused", async () => {
    const { scanner, launchCameraAsync } = loadScanner({ granted: false });

    await expect(scanner.captureLabelImage("camera")).rejects.toMatchObject({
      reason: "permission-denied",
    });
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it("points a user who refused permission at manual entry", async () => {
    const { scanner } = loadScanner({ granted: false });

    await expect(scanner.captureLabelImage("camera")).rejects.toThrow(
      /type the details in yourself/i
    );
  });

  it("reports unavailable rather than crashing with no picker installed", async () => {
    const { scanner } = loadScanner({ pickerMissing: true });

    await expect(scanner.captureLabelImage("camera")).rejects.toMatchObject({
      reason: "unavailable",
    });
  });
});

describe("readLabel", () => {
  it("returns the medication fields read from the label", async () => {
    const { scanner } = loadScanner();

    const parsed = await scanner.readLabel("file:///tmp/synthetic-label.jpg");

    expect(parsed.name).toBe("Lisinopril");
    expect(parsed.dosage).toBe("10 mg");
    expect(parsed.frequency).toBe("TAKE 1 TABLET BY MOUTH ONCE DAILY");
  });

  it("makes no network call", async () => {
    const { scanner } = loadScanner();
    const fetchSpy = jest.fn();
    const original = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;

    try {
      await scanner.readLabel("file:///tmp/synthetic-label.jpg");
      // The whole reason this is on-device. A prescription label is
      // identifiable health information and no vendor here has a BAA.
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });

  it("does not return the patient's name, address or Rx number", async () => {
    const { scanner } = loadScanner();

    const parsed = await scanner.readLabel("file:///tmp/synthetic-label.jpg");
    const serialised = JSON.stringify(parsed);

    // The full OCR text exists for one line inside readLabel and goes no
    // further. Nothing the app has no field for should survive the call.
    expect(serialised).not.toMatch(/DOE|JANE|Evergreen|Springfield|62701|8675309/);
  });

  it("returns only the known medication fields", async () => {
    const { scanner } = loadScanner();

    const parsed = await scanner.readLabel("file:///tmp/synthetic-label.jpg");

    expect(Object.keys(parsed).sort()).toEqual(
      [
        "confidence",
        "dosage",
        "frequency",
        "name",
        "prescribingDoctor",
        "warnings",
      ].sort()
    );
  });

  it("fails clearly when nothing readable is on the photo", async () => {
    const { scanner } = loadScanner({ recognised: "???\n###" });

    await expect(scanner.readLabel("file:///x.jpg")).rejects.toMatchObject({
      reason: "unreadable",
    });
  });

  it("offers manual entry when the photo cannot be read", async () => {
    const { scanner } = loadScanner({ recognised: "" });

    // A failed scan must never be a dead end.
    await expect(scanner.readLabel("file:///x.jpg")).rejects.toThrow(
      /type the details in yourself/i
    );
  });

  it("turns a recognition crash into a handled failure", async () => {
    const { scanner } = loadScanner({ recogniseFails: true });

    await expect(scanner.readLabel("file:///x.jpg")).rejects.toMatchObject({
      reason: "failed",
    });
  });

  it("returns a partial read rather than refusing it", async () => {
    const { scanner } = loadScanner({ recognised: "IBUPROFEN TABLETS" });

    const parsed = await scanner.readLabel("file:///x.jpg");

    // A name alone still saves the user typing, and the form shows what is
    // missing.
    expect(parsed.name).toBe("Ibuprofen");
    expect(parsed.confidence).toBe("partial");
  });
});
