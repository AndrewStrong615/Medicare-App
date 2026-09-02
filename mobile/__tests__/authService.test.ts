import {
  AuthError,
  getToken,
  login,
  logout,
  restoreSession,
  signup,
} from "@/services/authService";

/**
 * The real store is platform-split (keystore / sessionStorage). What matters
 * to this module is only that a token written on one run is readable on the
 * next, so the store is faked and the platform behaviour is tested where it
 * lives — see `tokenStorageWeb.test.ts`.
 */
let mockStoredToken: string | null = null;

jest.mock("@/services/tokenStorage", () => ({
  saveToken: jest.fn(async (token: string) => {
    mockStoredToken = token;
  }),
  loadToken: jest.fn(async () => mockStoredToken),
  clearToken: jest.fn(async () => {
    mockStoredToken = null;
  }),
}));

/**
 * A token shaped like the backend's: three dot-separated parts, with a real
 * base64url payload carrying `exp` in seconds. The signature is never checked
 * here — the client cannot verify one, and does not try.
 */
function fakeToken(expiresInSeconds: number): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "00000000-0000-0000-0000-00000000fake",
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })
  ).toString("base64url");

  return `fake-header.${payload}.fake-signature`;
}

function mockFetchOnce(ok: boolean, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    json: async () => body,
  });
}

function mockFetchNetworkFailure() {
  // What fetch actually does when the server is unreachable or the request is
  // blocked (e.g. by CORS): it rejects rather than returning a response.
  (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));
}

describe("authService", () => {
  beforeEach(async () => {
    global.fetch = jest.fn();
    await logout(); // reset the in-memory token and the store between tests
  });

  describe("login", () => {
    it("resolves with the access token and stores it in memory on success", async () => {
      mockFetchOnce(true, { access_token: "fake-jwt-token", token_type: "bearer" });

      const result = await login("synthetic.user@example.com", "fake-password-1");

      expect(result).toEqual({ accessToken: "fake-jwt-token" });
      expect(getToken()).toBe("fake-jwt-token");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/login"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "synthetic.user@example.com",
            password: "fake-password-1",
          }),
        })
      );
    });

    it("surfaces the server's own explanation rather than a generic message", async () => {
      mockFetchOnce(false, { detail: "Invalid email or password" });

      await expect(login("synthetic.user@example.com", "wrong-password")).rejects.toThrow(
        "Invalid email or password"
      );
      expect(getToken()).toBeNull();
    });

    it("reports an unreachable server as a network error, not a bad password", async () => {
      mockFetchNetworkFailure();

      // This is the case that previously read "Login failed. Check your
      // credentials" even when the backend was simply not running.
      const error = await login("synthetic.user@example.com", "fake-password-1").catch((e) => e);

      expect(error).toBeInstanceOf(AuthError);
      expect(error.isNetworkError).toBe(true);
      expect(error.message).toMatch(/check your internet connection/i);
    });

    it("rejects a success response that carries no usable token", async () => {
      mockFetchOnce(true, { token_type: "bearer" });

      await expect(login("synthetic.user@example.com", "fake-password-1")).rejects.toBeInstanceOf(
        AuthError
      );
      expect(getToken()).toBeNull();
    });

    it("falls back to a plain-language message when the body has no detail", async () => {
      mockFetchOnce(false, {});

      await expect(login("synthetic.user@example.com", "fake-password-1")).rejects.toThrow(
        /didn't match/i
      );
    });
  });

  describe("signup", () => {
    it("resolves without throwing on success", async () => {
      mockFetchOnce(true, { id: "fake-id-1", email: "new.synthetic@example.com" });

      await expect(signup("new.synthetic@example.com", "fake-password-2")).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/signup"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("surfaces a duplicate-email rejection", async () => {
      mockFetchOnce(false, { detail: "Email already registered" });

      await expect(signup("dupe.synthetic@example.com", "fake-password-3")).rejects.toThrow(
        "Email already registered"
      );
    });

    it("flattens FastAPI's 422 validation array into a readable sentence", async () => {
      // FastAPI returns `detail` as a list of field errors for 422s; reading it
      // naively would render "[object Object]" to the user.
      mockFetchOnce(false, {
        detail: [
          {
            type: "value_error",
            loc: ["body", "password"],
            msg: "Value error, Password must be at least 8 characters.",
          },
        ],
      });

      await expect(signup("new.synthetic@example.com", "short")).rejects.toThrow(
        "Password must be at least 8 characters."
      );
    });
  });

  describe("session persistence", () => {
    it("keeps the token where a later launch can find it", async () => {
      mockFetchOnce(true, { access_token: fakeToken(3600), token_type: "bearer" });
      const { accessToken } = await login("synthetic.user@example.com", "fake-password-1");

      // Simulate the page being reloaded: the module's memory is gone, and
      // only what was written to storage is left.
      await logoutInMemoryOnly(accessToken);

      await expect(restoreSession()).resolves.toBe(true);
      expect(getToken()).toBe(accessToken);
    });

    it("reports no session when nothing was ever stored", async () => {
      await expect(restoreSession()).resolves.toBe(false);
      expect(getToken()).toBeNull();
    });

    it("throws away a token that has already expired rather than restoring it", async () => {
      // Restoring this would put someone on a signed-in screen and then tell
      // them their session had expired the moment they touched anything.
      mockStoredToken = fakeToken(-60);

      await expect(restoreSession()).resolves.toBe(false);
      expect(getToken()).toBeNull();
      expect(mockStoredToken).toBeNull();
    });

    it("restores a token it cannot read, and lets the server be the judge", async () => {
      // Only the server verifies a token. Being unable to parse one is not
      // evidence that it is bad, so it is sent and allowed to fail as a 401.
      mockStoredToken = "not-a-jwt";

      await expect(restoreSession()).resolves.toBe(true);
      expect(getToken()).toBe("not-a-jwt");
    });

    it("empties the store on sign out, so a reload does not bring it back", async () => {
      mockFetchOnce(true, { access_token: fakeToken(3600), token_type: "bearer" });
      await login("synthetic.user@example.com", "fake-password-1");

      await logout();

      expect(getToken()).toBeNull();
      expect(mockStoredToken).toBeNull();
      await expect(restoreSession()).resolves.toBe(false);
    });
  });
});

/**
 * Drops the in-memory token while leaving the store alone, which is what a
 * page reload does. `logout()` cannot be used for this: it clears both.
 */
async function logoutInMemoryOnly(token: string): Promise<void> {
  await logout();
  mockStoredToken = token;
}
