import { AuthError, getToken, login, logout, signup } from "@/services/authService";

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
  beforeEach(() => {
    global.fetch = jest.fn();
    logout(); // reset in-memory token between tests
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
});
