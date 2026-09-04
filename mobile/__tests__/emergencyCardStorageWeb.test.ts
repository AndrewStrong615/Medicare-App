/**
 * Tests for where a browser keeps the emergency card
 * (`emergencyCardStorage.web.ts`). Metro resolves this file only for web
 * builds, so it is required explicitly.
 *
 * The property worth protecting is the one that looks like a mistake next to
 * `tokenStorage.web.ts`: this store is `localStorage`, deliberately, while
 * the session token's is `sessionStorage`, equally deliberately. A card that
 * vanished when the tab closed would not be there in an emergency, and unlike
 * the token it grants nobody access to anything.
 *
 * A future reader "fixing the inconsistency" in either direction breaks
 * something real, so both halves are asserted in their own suites.
 */

const browserGlobals = global as unknown as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const storage = require("@/services/emergencyCardStorage.web");

const KEY = "medhelp_emergency_card";

function makeStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      values.delete(key);
    }),
  };
}

function stubWindow(localStorage: unknown, sessionStorage: unknown) {
  browserGlobals.window = { localStorage, sessionStorage };
}

describe("emergencyCardStorage.web", () => {
  const originalWindow = browserGlobals.window;

  afterEach(() => {
    browserGlobals.window = originalWindow;
    jest.clearAllMocks();
  });

  it("writes to localStorage and never to sessionStorage", async () => {
    // The card has to survive the tab closing. sessionStorage does not.
    const local = makeStore();
    const session = makeStore();
    stubWindow(local, session);

    await storage.writeRaw(KEY, '{"bloodType":"O positive"}');

    expect(local.setItem).toHaveBeenCalledWith(KEY, '{"bloodType":"O positive"}');
    expect(session.setItem).not.toHaveBeenCalled();
  });

  it("hands back what an earlier visit wrote", async () => {
    const local = makeStore();
    stubWindow(local, makeStore());

    await storage.writeRaw(KEY, "synthetic");

    await expect(storage.readRaw(KEY)).resolves.toBe("synthetic");
  });

  it("reads nothing rather than throwing when the browser blocks site data", async () => {
    // Safari private browsing and a browser configured to block site data
    // both throw on access. An empty card is the right answer; a crash is not.
    stubWindow(
      {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      makeStore()
    );

    await expect(storage.readRaw(KEY)).resolves.toBeNull();
  });

  it("reports a refused write, so the editor can say the save failed", async () => {
    stubWindow(
      {
        setItem: () => {
          throw new Error("quota");
        },
      },
      makeStore()
    );

    await expect(storage.writeRaw(KEY, "synthetic")).rejects.toThrow();
  });

  it("reports a write when there is no storage at all", async () => {
    browserGlobals.window = {};

    await expect(storage.writeRaw(KEY, "synthetic")).rejects.toThrow();
  });

  it("removes without complaining when there is nothing to remove", async () => {
    browserGlobals.window = {};

    await expect(storage.removeRaw(KEY)).resolves.toBeUndefined();
  });
});

// Makes this file a module, so its helpers do not collide with the identically
// shaped ones in `tokenStorageWeb.test.ts` under `tsc --noEmit`.
export {};
