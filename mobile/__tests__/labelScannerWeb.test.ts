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
const mockCreateWorker = jest.fn(async () => ({
  recognize: mockRecognize,
  terminate: mockTerminate,
}));

jest.mock("tesseract.js", () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...(args as [])),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const scanner = require("@/services/labelScanner.web");

describe("readLabel in a browser", () => {
  beforeEach(() => {
    mockRecognize.mockReset().mockResolvedValue({ data: { text: SYNTHETIC_LABEL } });
    mockTerminate.mockClear();
    mockCreateWorker.mockClear();
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
