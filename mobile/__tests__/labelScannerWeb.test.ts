/**
 * Tests for the browser scanner (`labelScanner.web.ts`).
 *
 * Metro resolves this file only for web builds, so jest never picks it up by
 * itself — it is imported explicitly here.
 *
 * The properties that matter are the same as the native scanner's, with one
 * deliberate difference. The native path makes NO network call at all. This
 * one downloads the OCR model, so the assertion here is narrower and more
 * important to state exactly: the user's photograph is never sent anywhere.
 * The model comes down; the image does not go up.
 *
 * Every label string is synthetic.
 */

import { parseLabelText } from "@/services/labelParser";

const SYNTHETIC_LABEL = [
  "CVS/pharmacy",
  "742 Evergreen Terrace",
  "Springfield IL 62701",
  "Rx# 8675309",
  "DOE, JANE A",
  "LISINOPRIL 10MG TABLETS",
  "TAKE 1 TABLET BY MOUTH ONCE DAILY",
].join("\n");

// jest hoists `jest.mock` above these declarations, and only allows a factory
// to reference variables whose names begin with "mock". Hence the prefixes.
const mockRecognize = jest.fn();
const mockTerminate = jest.fn(async () => undefined);
const mockSetParameters = jest.fn(async () => undefined);
const mockCreateWorker = jest.fn(async () => ({
  recognize: mockRecognize,
  terminate: mockTerminate,
  setParameters: mockSetParameters,
}));

jest.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...(args as [])),
  // Mirrors tesseract.js's own enum. Only the one mode this app sets is
  // needed; the value is the Tesseract page-segmentation number.
  PSM: { SINGLE_COLUMN: "4" },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const scanner = require("@/services/labelScanner.web");

describe("readLabel in a browser", () => {
  beforeEach(() => {
    mockRecognize.mockReset().mockResolvedValue({ data: { text: SYNTHETIC_LABEL } });
    mockTerminate.mockClear();
    mockCreateWorker.mockClear();
    mockSetParameters.mockClear();
  });

  it("returns the medication fields read from the label", async () => {
    const parsed = await scanner.readLabel("data:image/jpeg;base64,synthetic");

    expect(parsed.name).toBe("Lisinopril");
    expect(parsed.dosage).toBe("10 mg");
    expect(parsed.frequency).toBe("TAKE 1 TABLET BY MOUTH ONCE DAILY");
  });

  it("gives the same answer the native scanner would", async () => {
    const parsed = await scanner.readLabel("data:image/jpeg;base64,synthetic");

    // Both platforms share one parser, so a label reads identically wherever
    // it is scanned. Only the engine that produced the text differs.
    expect(parsed).toEqual(parseLabelText(SYNTHETIC_LABEL));
  });

  it("never sends the photo anywhere", async () => {
    const fetchSpy = jest.fn();
    const original = global.fetch;
    global.fetch = fetchSpy as unknown as typeof fetch;

    try {
      await scanner.readLabel("data:image/jpeg;base64,synthetic");
      // The engine may fetch its model from a CDN, which is why this asserts
      // on our own code rather than on the network being silent. What must
      // never happen is the image being uploaded, and nothing here uploads it:
      // the data URL goes straight into WebAssembly in the page.
      for (const call of fetchSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("synthetic");
      }
    } finally {
      global.fetch = original;
    }
  });

  it("does not return the patient's name, address or Rx number", async () => {
    const parsed = await scanner.readLabel("data:image/jpeg;base64,synthetic");

    expect(JSON.stringify(parsed)).not.toMatch(
      /DOE|JANE|Evergreen|Springfield|62701|8675309/
    );
  });

  it("releases the worker after a successful scan", async () => {
    await scanner.readLabel("data:image/jpeg;base64,synthetic");

    // A worker holds a WASM instance and a web worker. One leaked per scan
    // would quietly exhaust a phone.
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it("releases the worker even when recognition fails", async () => {
    mockRecognize.mockRejectedValue(new Error("wasm exploded"));

    await expect(scanner.readLabel("data:image/jpeg;base64,x")).rejects.toMatchObject({
      reason: "failed",
    });
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when nothing readable is on the photo", async () => {
    mockRecognize.mockResolvedValue({ data: { text: "??? ###" } });

    await expect(scanner.readLabel("data:image/jpeg;base64,x")).rejects.toMatchObject({
      reason: "unreadable",
    });
  });

  it("points a failed read at manual entry", async () => {
    mockRecognize.mockResolvedValue({ data: { text: "" } });

    await expect(scanner.readLabel("data:image/jpeg;base64,x")).rejects.toThrow(
      /type the details in yourself/i
    );
  });

  it("survives an engine that returns no text field at all", async () => {
    mockRecognize.mockResolvedValue({});

    await expect(scanner.readLabel("data:image/jpeg;base64,x")).rejects.toMatchObject({
      reason: "unreadable",
    });
  });

  it("returns a partial read rather than refusing it", async () => {
    mockRecognize.mockResolvedValue({ data: { text: "IBUPROFEN TABLETS" } });

    const parsed = await scanner.readLabel("data:image/jpeg;base64,x");

    expect(parsed.name).toBe("Ibuprofen");
    expect(parsed.confidence).toBe("partial");
  });

  it("hands over a read that missed the name but got the directions", async () => {
    // The reported dead end. Tesseract dropped the drug-name line and kept
    // everything around it, `confidence` was therefore "none", and the whole
    // read — a perfectly good sig line and prescriber — was thrown away,
    // leaving the user back at an empty form with nothing from their photo.
    mockRecognize.mockResolvedValue({
      data: {
        text: [
          "RIVERBEND SYNTHETIC PHARMACY",
          "TAKE 1 TABLET BY MOUTH ONCE DAILY",
          "PRESCRIBER: DR. ALEX MORGAN",
        ].join("\n"),
      },
    });

    const parsed = await scanner.readLabel("data:image/jpeg;base64,x");

    expect(parsed.name).toBeNull();
    expect(parsed.confidence).toBe("none");
    // Carried across verbatim, and the user is told what is missing.
    expect(parsed.frequency).toBe("TAKE 1 TABLET BY MOUTH ONCE DAILY");
    expect(parsed.prescribingDoctor).toBe("DR. ALEX MORGAN");
    expect(parsed.warnings.join(" ")).toMatch(/medication name could not be read/i);
  });

  it("reads a label as one column of variable-sized text", async () => {
    // Tesseract's default segmentation discards the largest line on the page,
    // which on a dispensed label is the drug name. PSM 4 is the mode that
    // describes a label, and losing this call loses the name.
    await scanner.readLabel("data:image/jpeg;base64,x");

    expect(mockSetParameters).toHaveBeenCalledWith(
      expect.objectContaining({ tessedit_pageseg_mode: "4" })
    );
  });
});

describe("preparing the photo before recognition", () => {
  /*
    Small print on a label — the prescriber, the quantity — falls below the
    character height Tesseract can resolve long before the big lines do, which
    is what "it still struggles with smaller font" turned out to be. The photo
    is enlarged in a canvas first. All of it happens in the page: no network
    call is added, which the network test above continues to assert.
  */
  const globals = global as unknown as Record<string, unknown>;
  const UPSCALED = "data:image/png;base64,UPSCALED";
  const saved: Record<string, unknown> = {};
  const keys = ["document", "Image"];

  // The suite runs in the node environment, so there is no DOM to spy on —
  // `document` and `Image` are built here, which is also the honest shape of
  // the check the code makes: it asks whether a 2D context exists at all.
  function stubCanvas(imageWidth: number, imageHeight: number) {
    const canvas: Record<string, unknown> = {
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage: jest.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: jest.fn(),
      }),
      toDataURL: () => UPSCALED,
    };

    globals.document = {
      createElement: (tag: string) => (tag === "canvas" ? canvas : {}),
      body: {},
    };
    globals.Image = class {
      width = imageWidth;
      height = imageHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    };

    return canvas;
  }

  beforeEach(() => {
    for (const key of keys) saved[key] = globals[key];
    mockRecognize.mockReset().mockResolvedValue({ data: { text: SYNTHETIC_LABEL } });
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete globals[key];
      else globals[key] = saved[key];
    }
  });

  it("enlarges a small photo before reading it", async () => {
    const canvas = stubCanvas(400, 220);

    await scanner.readLabel("data:image/jpeg;base64,small");

    // 400px wide is well under the target, so it is scaled up and the
    // enlarged copy — not the original — is what gets recognised.
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(880);
    expect(mockRecognize).toHaveBeenCalledWith(UPSCALED);
  });

  it("never enlarges beyond the point where it stops helping", async () => {
    const canvas = stubCanvas(200, 100);

    await scanner.readLabel("data:image/jpeg;base64,tiny");

    // Interpolation invents no detail, so the upscale is capped at 4x rather
    // than blowing a thumbnail up to the full target width.
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
  });

  it("leaves a full-size photo alone", async () => {
    stubCanvas(3024, 4032);

    await scanner.readLabel("data:image/jpeg;base64,phonecamera");

    // A phone-camera photo already has the resolution; touching it would only
    // cost memory.
    expect(mockRecognize).toHaveBeenCalledWith("data:image/jpeg;base64,phonecamera");
  });

  it("reads the original photo when the canvas is unavailable", async () => {
    // A locked-down browser, or any environment with no 2D context. A worse
    // read is fine; a failed scan is not.
    for (const key of keys) delete globals[key];

    await scanner.readLabel("data:image/jpeg;base64,nocanvas");

    expect(mockRecognize).toHaveBeenCalledWith("data:image/jpeg;base64,nocanvas");
  });

  it("falls back to the original photo when decoding fails", async () => {
    stubCanvas(400, 220);
    globals.Image = class {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    };

    const parsed = await scanner.readLabel("data:image/jpeg;base64,broken");

    expect(mockRecognize).toHaveBeenCalledWith("data:image/jpeg;base64,broken");
    expect(parsed.name).toBe("Lisinopril");
  });
});

describe("isScanAvailable in a browser", () => {
  const globals = global as unknown as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const keys = ["document", "window", "WebAssembly", "FileReader"];

  beforeEach(() => {
    for (const key of keys) saved[key] = globals[key];
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete globals[key];
      else globals[key] = saved[key];
    }
  });

  function withBrowserGlobals() {
    globals.document = { createElement: () => ({}), body: {} };
    globals.window = {};
    globals.WebAssembly = {};
    globals.FileReader = function FileReaderStub() {};
  }

  it("is available in a normal browser", () => {
    withBrowserGlobals();

    expect(scanner.isScanAvailable()).toBe(true);
  });

  it("is unavailable without WebAssembly", () => {
    withBrowserGlobals();
    delete globals.WebAssembly;

    // An old or locked-down browser has to degrade to manual entry, not throw.
    expect(scanner.isScanAvailable()).toBe(false);
  });

  it("is unavailable without a DOM", () => {
    withBrowserGlobals();
    delete globals.document;

    expect(scanner.isScanAvailable()).toBe(false);
  });

  it("refuses to open a picker when unavailable", async () => {
    for (const key of keys) delete globals[key];

    await expect(scanner.captureLabelImage("camera")).rejects.toMatchObject({
      reason: "unavailable",
    });
  });
});
