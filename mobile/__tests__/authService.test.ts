import { getToken, login, logout, signup } from "@/services/authService";

function mockFetchOnce(ok: boolean, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    json: async () => body,
  });
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

    it("throws when the response is not ok", async () => {
      mockFetchOnce(false, { detail: "Invalid email or password" });

      await expect(login("synthetic.user@example.com", "wrong-password")).rejects.toThrow(
        "Login failed"
      );
      expect(getToken()).toBeNull();
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

    it("throws when the response is not ok (e.g. duplicate email)", async () => {
      mockFetchOnce(false, { detail: "Email already registered" });

      await expect(signup("dupe.synthetic@example.com", "fake-password-3")).rejects.toThrow(
        "Signup failed"
      );
    });
  });
});
