/**
 * Tests for where a browser keeps the session token
 * (`tokenStorage.web.ts`). Metro resolves this file only for web builds, so
 * it is required explicitly.
 *
 * The properties that matter: a token written before a reload is readable
 * after it, it is never written to `localStorage`, and a browser that refuses
 * site data degrades to a session that ends on refresh rather than to a crash.
 */

const browserGlobals = global as unknown as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const storage = require("@/services/tokenStorage.web");

const FAKE_TOKEN = "fake-header.fake-payload.fake-signature";

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

function stubWindow(sessionStorage: unknown, localStorage: unknown) {
  browserGlobals.window = { sessionStorage, localStorage };
}

describe("tokenStorage.web", () => {
  const originalWindow = browserGlobals.window;

  afterEach(() => {
    browserGlobals.window = originalWindow;
    jest.clearAllMocks();
  });

  it("hands back the token a previous page load wrote", async () => {
    stubWindow(makeStore(), makeStore());

    await storage.saveToken(FAKE_TOKEN);

    // A reload runs this module again with the same sessionStorage behind it.
    await expect(storage.loadToken()).resolves.toBe(FAKE_TOKEN);
  });

  it("reports no token before anything has been signed in", async () => {
    stubWindow(makeStore(), makeStore());

    await expect(storage.loadToken()).resolves.toBeNull();
  });

  it("forgets the token when asked", async () => {
    stubWindow(makeStore(), makeStore());
    await storage.saveToken(FAKE_TOKEN);

    await storage.clearToken();

    await expect(storage.loadToken()).resolves.toBeNull();
  });

  it("never writes the token to localStorage", async () => {
    // sessionStorage ends when the tab does. A credential for someone's
    // health records must not outlive that on a shared computer.
    const session = makeStore();
    const local = makeStore();
    stubWindow(session, local);

    await storage.saveToken(FAKE_TOKEN);

    expect(session.setItem).toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.values.size).toBe(0);
  });

  it("survives a browser that refuses site data", async () => {
    // Safari in private browsing, and any browser configured to block storage,
    // throw on access rather than returning empty. The user should get a
    // session that ends on refresh, not an app that fails to sign them in.
    stubWindow(
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("SecurityError");
        },
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
      makeStore()
    );

    await expect(storage.saveToken(FAKE_TOKEN)).resolves.toBeUndefined();
    await expect(storage.loadToken()).resolves.toBeNull();
    await expect(storage.clearToken()).resolves.toBeUndefined();
  });

  it("survives a build with no window at all", async () => {
    browserGlobals.window = undefined;

    await expect(storage.saveToken(FAKE_TOKEN)).resolves.toBeUndefined();
    await expect(storage.loadToken()).resolves.toBeNull();
  });
});
