/**
 * The browser location path (`locationService.web.ts`).
 *
 * Metro resolves that file only for web builds, so jest never picks it up on
 * its own — it is required explicitly here, the way `labelScannerWeb.test.ts`
 * reaches the browser scanner.
 *
 * A browser gives a position but has no geocoder, so the coordinate is turned
 * into a ZIP by MedHelp's own backend (`POST /providers/resolve-location`)
 * against a Census dataset — not by a third-party geocoding vendor.
 *
 * The cases below are the ones that actually happen in a browser, and the
 * reason the manual-ZIP fallback is not optional: browsers refuse location far
 * more often than phones do, and one of these refusals is not a refusal at all
 * but a prompt nobody ever answers.
 */

const mockGetCurrentPosition = jest.fn();
const mockApiRequest = jest.fn();
const mockPermissionQuery = jest.fn();

jest.mock("@/services/apiClient", () => ({
  ...jest.requireActual("@/services/apiClient"),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

type WebLocation = typeof import("@/services/locationService.web");

function load({
  geolocation = true,
  secure = true,
  permission = "prompt",
}: {
  geolocation?: boolean;
  secure?: boolean;
  /** What the Permissions API says, without anything being shown. */
  permission?: "granted" | "prompt" | "denied";
} = {}): WebLocation {
  mockPermissionQuery.mockResolvedValue({ state: permission });
  Object.defineProperty(global, "window", {
    value: {
      isSecureContext: secure,
      location: {
        protocol: secure ? "https:" : "http:",
        hostname: secure ? "medhelp.example.com" : "192.168.1.5",
      },
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global, "navigator", {
    value: {
      permissions: { query: mockPermissionQuery },
      ...(geolocation
        ? { geolocation: { getCurrentPosition: mockGetCurrentPosition } }
        : {}),
    },
    configurable: true,
    writable: true,
  });

  let module!: WebLocation;
  jest.isolateModules(() => {
    module = require("@/services/locationService.web");
  });
  return module;
}

/** The browser handing back a fix. */
const grants = (latitude: number, longitude: number) =>
  mockGetCurrentPosition.mockImplementation((onOk: Function) =>
    onOk({ coords: { latitude, longitude } })
  );

/** The browser reporting an error. 1 denied, 2 unavailable, 3 timeout. */
const fails = (code: number) =>
  mockGetCurrentPosition.mockImplementation((_ok: Function, onError: Function) =>
    onError({ code })
  );

beforeEach(() => {
  jest.useFakeTimers();
  mockGetCurrentPosition.mockReset();
  mockApiRequest.mockReset();
  mockPermissionQuery.mockReset();
  mockApiRequest.mockResolvedValue({ postal_code: "10001" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("when permission has already been granted", () => {
  // No prompt is involved: the browser has said yes before, so the ZIP fills
  // in silently on arrival.
  it("turns the coordinate into a ZIP via our own backend", async () => {
    grants(40.7484, -73.9857);
    const location = load({ permission: "granted" });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: "10001",
      status: "ok",
    });
  });

  it("sends the coordinate as a POST body, never in a URL", async () => {
    // A position in a query string lands in access logs, proxies and crash
    // reporters — the same rule the symptom description follows.
    grants(40.7484, -73.9857);
    const location = load({ permission: "granted" });
    await location.getPostalCode();

    const [path, init] = mockApiRequest.mock.calls[0];
    expect(path).toBe("/providers/resolve-location");
    expect(path).not.toContain("40.7");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      latitude: 40.7484,
      longitude: -73.9857,
    });
  });

  it("asks a coarse fix, not a doorstep one", async () => {
    // A ZIP needs a neighbourhood. High accuracy would be slower, hungrier
    // and more revealing for no gain.
    grants(40.7484, -73.9857);
    const location = load({ permission: "granted" });
    await location.getPostalCode();

    expect(mockGetCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: false,
    });
  });

  it("asks the browser once per session, however often it is called", async () => {
    grants(40.7484, -73.9857);
    const location = load({ permission: "granted" });

    await Promise.all([
      location.getPostalCode(),
      location.getPostalCode(),
      location.getPostalCode(),
    ]);
    await location.getPostalCode();

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("reports 'unavailable' when the coordinate is nowhere near a US ZIP", async () => {
    // Someone abroad. The backend returns null rather than the least-far
    // American ZIP, and the user types one instead.
    grants(51.5074, -0.1278);
    mockApiRequest.mockResolvedValue({ postal_code: null });
    const location = load({ permission: "granted" });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: null,
      status: "unavailable",
    });
  });

  it("does not throw when the backend call fails", async () => {
    // The screen renders its provider list off the back of this.
    grants(40.7484, -73.9857);
    mockApiRequest.mockRejectedValue(new Error("network down"));
    const location = load({ permission: "granted" });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: null,
      status: "unavailable",
    });
  });
});

describe("when the user has not been asked yet", () => {
  // The fix for "I never get prompted". Auto-prompting on mount is suppressed
  // by some browsers and is unrecoverable once a site is blocked, so nothing
  // is requested until the user presses "Use my location".
  it("does not prompt on arrival, and says the button is the way in", async () => {
    grants(40.7484, -73.9857);
    const location = load({ permission: "prompt" });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: null,
      status: "prompt",
    });
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it("prompts when the user asks it to", async () => {
    grants(40.7484, -73.9857);
    const location = load({ permission: "prompt" });

    await expect(location.getPostalCode({ prompt: true })).resolves.toEqual({
      postalCode: "10001",
      status: "ok",
    });
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("a declined prompt is still retryable after the user unblocks it", async () => {
    // "prompt" is the absence of an answer, so it must not be cached in a way
    // that makes the button inert.
    grants(40.7484, -73.9857);
    const location = load({ permission: "prompt" });

    await location.getPostalCode();
    await expect(location.getPostalCode({ prompt: true })).resolves.toEqual({
      postalCode: "10001",
      status: "ok",
    });
  });

  it("reports a site the browser has blocked, without asking", async () => {
    // Nothing would be shown even if we did ask, so say what to do instead.
    const location = load({ permission: "denied" });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: null,
      status: "denied",
    });
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("when the browser will not give a location", () => {
  it("reports a refusal as 'denied'", async () => {
    fails(1);
    const location = load();

    await expect(location.getPostalCode({ prompt: true })).resolves.toEqual({
      postalCode: null,
      status: "denied",
    });
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("remembers a refusal instead of re-prompting on every visit", async () => {
    // Re-asking someone who has said no is how a site gets its permission
    // blocked permanently.
    fails(1);
    const location = load();

    await location.getPostalCode({ prompt: true });
    await location.getPostalCode({ prompt: true });

    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("reports a prompt nobody ever answers as 'timeout'", async () => {
    // The case the spec does not cover: the user is shown the prompt and walks
    // away. Neither callback fires, ever. Without our own deadline the caller
    // waits forever — which is exactly how this screen once appeared to do
    // nothing at all.
    mockGetCurrentPosition.mockImplementation(() => {});
    const location = load();

    const lookup = location.getPostalCode({ prompt: true });
    await jest.advanceTimersByTimeAsync(12_000);

    await expect(lookup).resolves.toEqual({
      postalCode: null,
      status: "timeout",
    });
  });

  it("reports the browser's own timeout as 'timeout'", async () => {
    fails(3);
    const location = load();

    await expect(location.getPostalCode({ prompt: true })).resolves.toEqual({
      postalCode: null,
      status: "timeout",
    });
  });

  it("reports a position it could not determine as 'unavailable'", async () => {
    fails(2);
    const location = load();

    await expect(location.getPostalCode({ prompt: true })).resolves.toEqual({
      postalCode: null,
      status: "unavailable",
    });
  });
});

describe("when the page cannot use geolocation at all", () => {
  it("reports 'insecure' on plain http, without prompting", async () => {
    // Browsers refuse the Geolocation API outside a secure context. Serving
    // the web build to a phone at http://192.168.x.x is exactly that case, so
    // it needs its own message: it is a setup problem with a fix, not a
    // refusal by the user.
    const location = load({ secure: false });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: null,
      status: "insecure",
    });
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' when the browser has no Geolocation API", async () => {
    const location = load({ geolocation: false });

    await expect(location.getPostalCode()).resolves.toEqual({
      postalCode: null,
      status: "unsupported",
    });
  });

  it("says up front whether asking could even work", () => {
    expect(load({ secure: false }).isLocationAvailable()).toBe(false);
    expect(load({ geolocation: false }).isLocationAvailable()).toBe(false);
    expect(load().isLocationAvailable()).toBe(true);
  });
});

describe("the two platform modules stay interchangeable", () => {
  it("exposes the same surface the native module does", () => {
    // The screen imports one name and Metro decides which file answers. A
    // missing export here is a crash in the browser and nowhere else — the
    // kind of break that reaches users rather than CI.
    const web = load();
    const native = require("@/services/locationService");

    for (const exported of Object.keys(native)) {
      expect([exported, typeof (web as any)[exported]]).toEqual([
        exported,
        typeof native[exported],
      ]);
    }
  });
});
