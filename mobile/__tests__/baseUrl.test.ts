/**
 * Where the backend is, and whether we may talk to it in the clear.
 *
 * Both of these shipped broken, and together they are why "Find a provider"
 * did nothing for a user running the web build on a phone:
 *
 * 1. `expo export` bakes in `__DEV__ = false`. The old guard refused every
 *    request that was not https whenever `__DEV__` was false — so the exported
 *    build you serve to a phone on your own LAN (the way to run this without
 *    an Apple developer account) rejected every provider search outright,
 *    while sign-in, which had no guard at all, worked fine. The app therefore
 *    looked healthy right up to the moment you searched.
 * 2. With no `EXPO_PUBLIC_API_BASE_URL` set, the app called
 *    `http://localhost:8000` — which on a phone is the phone.
 *
 * These exercise the pure functions rather than the module's own constant, on
 * purpose: `process.env.EXPO_PUBLIC_*` is inlined by babel-preset-expo at
 * build time, so it is a literal in the bundle and a test cannot set it. An
 * earlier version of this file tried, and every assertion silently ran against
 * the fallback instead.
 */

import {
  API_BASE_URL,
  isTransportSafe,
  resolveBaseUrl,
} from "@/services/baseUrl";

describe("finding the backend", () => {
  it("uses the configured URL when there is one", () => {
    expect(
      resolveBaseUrl("https://api.example.com", { hostname: "phone.local" })
    ).toBe("https://api.example.com");
  });

  it("takes the host the page was served from, not 'localhost'", () => {
    // The whole point: opened at http://192.168.1.5:8081 on a phone, the API
    // is on the dev machine at .5, not on the handset.
    expect(resolveBaseUrl(null, { hostname: "192.168.1.5", protocol: "http:" })).toBe(
      "http://192.168.1.5:8000"
    );
  });

  it("still resolves to localhost on a desktop dev server", () => {
    expect(resolveBaseUrl(null, { hostname: "localhost", protocol: "http:" })).toBe(
      "http://localhost:8000"
    );
  });

  it("keeps https when the page itself was served over https", () => {
    expect(
      resolveBaseUrl(null, { hostname: "medhelp.example.com", protocol: "https:" })
    ).toBe("https://medhelp.example.com:8000");
  });

  it("falls back to localhost off-web, where there is no page host", () => {
    expect(resolveBaseUrl(null, null)).toBe("http://localhost:8000");
    expect(resolveBaseUrl(undefined, {})).toBe("http://localhost:8000");
  });

  it("ignores a blank configured value rather than building '//:8000'", () => {
    expect(resolveBaseUrl("   ", { hostname: "192.168.1.5" })).toBe(
      "http://192.168.1.5:8000"
    );
  });

  it("tolerates a trailing slash in the configured URL", () => {
    // Otherwise every request path doubles the slash.
    expect(resolveBaseUrl("https://api.example.com/", null)).toBe(
      "https://api.example.com"
    );
  });

  it("exports a usable URL for the real build", () => {
    expect(API_BASE_URL).toMatch(/^https?:\/\/.+/);
  });
});

describe("whether the transport is safe", () => {
  it("allows https anywhere", () => {
    expect(isTransportSafe("https://api.example.com")).toBe(true);
    expect(isTransportSafe("https://10.0.0.5:8000")).toBe(true);
  });

  it("allows plain http to loopback and the LAN", () => {
    // This is the case the old __DEV__ guard wrongly refused, and the reason
    // provider search failed on a phone.
    for (const url of [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "http://192.168.1.5:8000",
      "http://10.0.0.5:8000",
      "http://172.16.0.9:8000",
      "http://172.31.255.1:8000",
      "http://169.254.10.1:8000",
      "http://my-mac.local:8000",
      "http://[::1]:8000",
    ]) {
      expect([url, isTransportSafe(url)]).toEqual([url, true]);
    }
  });

  it("refuses plain http to anywhere public", () => {
    // The case the rule actually exists for — and now refused in development
    // too, where the old guard waved it through.
    for (const url of [
      "http://api.example.com",
      "http://203.0.113.10:8000",
      "http://8.8.8.8",
      "http://172.32.0.1:8000", // just outside the private 172.16/12 range
      "http://172.15.255.1:8000",
      "http://11.0.0.1:8000",
      "http://192.169.1.1:8000",
    ]) {
      expect([url, isTransportSafe(url)]).toEqual([url, false]);
    }
  });

  it("is not fooled by a public host smuggled in as credentials", () => {
    expect(isTransportSafe("http://localhost@evil.example.com/")).toBe(false);
  });

  it("refuses something that is not a URL at all", () => {
    expect(isTransportSafe("localhost:8000")).toBe(false);
    expect(isTransportSafe("")).toBe(false);
  });
});


describe("using the app from another network", () => {
  /*
    A LAN address only works while the phone is on that LAN. A WireGuard mesh
    address (Tailscale hands out 100.64.0.0/10) works from any network, which
    is what makes the app usable away from the server's Wi-Fi without exposing
    it publicly. Plain http is accepted there for the same reason as loopback:
    WireGuard has already encrypted it.
  */
  it("accepts a mesh address over plain http", () => {
    expect(isTransportSafe("http://100.85.208.96:8000")).toBe(true);
  });

  it("accepts the whole 100.64.0.0/10 range and nothing either side of it", () => {
    expect(isTransportSafe("http://100.64.0.1:8000")).toBe(true);
    expect(isTransportSafe("http://100.127.255.254:8000")).toBe(true);
    // 100.63.x and 100.128.x are ordinary public addresses.
    expect(isTransportSafe("http://100.63.255.254:8000")).toBe(false);
    expect(isTransportSafe("http://100.128.0.1:8000")).toBe(false);
  });

  it("still refuses plain http to a genuinely public host", () => {
    expect(isTransportSafe("http://example.com")).toBe(false);
    expect(isTransportSafe("http://93.184.216.34")).toBe(false);
  });

  it("derives the API host from wherever the page was served", () => {
    // With no override configured this is what makes one build work on the
    // LAN and over the mesh: the API is looked for beside the page.
    expect(resolveBaseUrl(null, { hostname: "100.85.208.96", protocol: "http:" })).toBe(
      "http://100.85.208.96:8000"
    );
    expect(resolveBaseUrl(null, { hostname: "192.168.50.19", protocol: "http:" })).toBe(
      "http://192.168.50.19:8000"
    );
  });
});
