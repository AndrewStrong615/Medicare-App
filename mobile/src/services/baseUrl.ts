/**
 * Where the backend is, and whether it is safe to talk to it in the clear.
 *
 * Both answers used to be worked out separately in four service files, and the
 * inconsistency between them was a bug users actually hit — see below. There
 * is one copy now.
 *
 * ## Finding the backend
 *
 * `EXPO_PUBLIC_API_BASE_URL` wins whenever it is set. When it is not, the old
 * default was the literal string `http://localhost:8000`, which is right on a
 * desktop and wrong on every phone: `localhost` on a phone is the *phone*, so
 * the app quietly tried to call a server running on the handset.
 *
 * In a browser we can do much better than a guess — the page knows what host it
 * was served from. Open the web build at `http://192.168.1.5:8081` on a phone
 * and the API is looked for at `http://192.168.1.5:8000`, which is where it
 * actually is. On a desktop at `localhost:8081` the answer is unchanged.
 *
 * ## Talking to it in the clear
 *
 * The rule that matters is "don't send health data over a network someone can
 * snoop". The old check approximated that with `__DEV__`, which is not the same
 * question and got it wrong in both directions:
 *
 * - `expo export` bakes in `__DEV__ = false`. That is the build you serve to a
 *   phone on your own LAN to avoid needing an Apple developer account — and it
 *   refused every request with "MedHelp is not configured securely", even
 *   though the traffic never left the house. **This is what stopped provider
 *   search from working.**
 * - `authService` had no check at all, so sign-in shipped an email and password
 *   in plaintext to anywhere, in any build, without complaint. The one call
 *   carrying a password was the one call nothing guarded.
 *
 * So the test here is the transport, not the build flavour: **https is always
 * fine; plain http is fine only to loopback or a private/LAN address.** A
 * production build pointed at a public `http://` host is still refused — that
 * is the case the rule exists for — and it is now refused in development too,
 * where it would previously have passed silently.
 */

/** Just enough of `window.location` to work out where the API probably is. */
export interface PageLocation {
  hostname?: string;
  protocol?: string;
}

/**
 * Work out the API base URL from the build-time setting and the page.
 *
 * Pure, and exported, because `process.env.EXPO_PUBLIC_*` is **inlined by
 * babel-preset-expo at build time** — it is a literal in the bundle, not
 * something a test can set. Taking the inputs as arguments is what makes the
 * rule testable at all.
 */
export function resolveBaseUrl(
  configured: string | null | undefined,
  location: PageLocation | null
): string {
  if (typeof configured === "string" && configured.trim()) {
    // A trailing slash here doubles the slash in every request path.
    return configured.trim().replace(/\/+$/, "");
  }

  if (location?.hostname) {
    const protocol = location.protocol === "https:" ? "https:" : "http:";
    return `${protocol}//${location.hostname}:8000`;
  }

  return "http://localhost:8000";
}

/** `window.location` on web and in jsdom, and absent everywhere else. */
function pageLocation(): PageLocation | null {
  return typeof window !== "undefined" ? window.location ?? null : null;
}

export const API_BASE_URL = resolveBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  pageLocation()
);

/** The host portion of a URL, without port, brackets or credentials. */
function hostOf(url: string): string | null {
  // Parsed by hand rather than with `URL`, whose React Native polyfill is
  // partial and throws on inputs a browser accepts.
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url);
  if (!match) return null;

  let authority = match[1];
  const at = authority.lastIndexOf("@");
  if (at !== -1) authority = authority.slice(at + 1);

  // IPv6 literals are bracketed: [::1]:8000
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]");
    return end === -1 ? null : authority.slice(1, end).toLowerCase();
  }

  const colon = authority.indexOf(":");
  const host = colon === -1 ? authority : authority.slice(0, colon);
  return host ? host.toLowerCase() : null;
}

function isLoopbackOrPrivate(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // mDNS names your own machine advertises on the LAN, e.g. "my-mac.local".
  if (host.endsWith(".local")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  // Unique local addresses, the IPv6 equivalent of 10.x/192.168.x.
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;

  const [a, b] = ipv4.slice(1).map(Number);
  if (ipv4.slice(1).some((part) => Number(part) > 255)) return false;

  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  // 100.64.0.0/10 — the range Tailscale and other WireGuard meshes hand out.
  //
  // This is what lets the app be used from a network other than the one the
  // server is on. A LAN address only works while the phone is on that LAN; a
  // mesh address works from anywhere, without publishing a health app that
  // has no enforced auth to the open internet.
  //
  // Plain http is acceptable here for the same reason it is to loopback: the
  // traffic is already encrypted, by WireGuard, before it reaches the wire.
  // The address is also not publicly routable, so it cannot be reached by
  // anyone outside the mesh.
  //
  // CAVEAT, stated because the range is not exclusively Tailscale's: this is
  // carrier-grade NAT space generally. Trusting it means trusting that a
  // 100.x host is on your own mesh rather than somewhere inside a carrier's
  // network. That is true for the way this app is used and is a weaker
  // guarantee than loopback.
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / WireGuard mesh
  return false;
}

/**
 * Whether the configured backend can be reached without exposing user data to
 * anyone in between.
 *
 * Callers throw their own error with their own wording when this is false —
 * the message a user sees while looking up a medication is not the one they
 * should see mid-symptom-check.
 */
export function isTransportSafe(url: string): boolean {
  if (/^https:\/\//i.test(url)) return true;

  const host = hostOf(url);
  return host !== null && isLoopbackOrPrivate(host);
}

export function baseUrlIsTransportSafe(): boolean {
  return isTransportSafe(API_BASE_URL);
}
