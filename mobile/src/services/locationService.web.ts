/**
 * Location in the browser, via the Geolocation API.
 *
 * Metro resolves this variant for web builds, the same way `labelScanner.web.ts`
 * replaces the native scanner. It exports the identical surface, so
 * `ProviderSearchScreen` needs no platform knowledge and the whole data layer
 * above it - `providerService`, `apiClient`, every screen - is shared.
 *
 * ## What is platform-specific, and why only this
 *
 * Exactly one thing differs between web and native: **how a postal code is
 * obtained.**
 *
 *   native  coordinates from `expo-location`  ->  ZIP from the OS geocoder
 *   web     coordinates from `navigator.geolocation`  ->  ZIP from our backend
 *
 * The split exists because a browser has no geocoder. `expo-location` throws
 * `E_NO_GEOCODER` from `geocodeAsync` and `reverseGeocodeAsync` on web, and
 * there is no browser equivalent - a position is all you get. Since the
 * provider directory is searched by ZIP, a coordinate on its own is useless,
 * which is why this file used to give up and prompt for nothing.
 *
 * It now resolves the coordinate through `POST /providers/resolve-location`,
 * against a Census dataset held on our own backend. Not a third-party geocoder:
 * handing a health app's user coordinates to Google or Mapbox would make them a
 * processor of location data with no agreement in place, and CLAUDE.md names
 * serving a redistributable dataset locally as the answer to this exact shape
 * of problem.
 *
 * **State the privacy property precisely, because it differs from native.** On
 * iOS and Android the coordinates never leave the phone. Here they reach
 * MedHelp's own backend - as a POST body, so they stay out of access logs and
 * URLs - and are resolved and discarded, never stored and never forwarded. They
 * reach no third party on either platform. Do not copy the native module's
 * "coordinates never leave the phone" onto this file.
 *
 * ## Distances are not computed here
 *
 * They come back on each provider row from the search API, which knows both
 * ZIPs already. That is shared by both platforms and is why this file has no
 * geocoding of its own to do.
 */

import type { LocationLookup, LocationStatus } from "@/services/locationService";
import { ApiError, apiRequest } from "@/services/apiClient";

export type { LocationLookup, LocationStatus };

/*
  How long to wait for a position.

  This is the deadline the browser itself enforces, and it is doing real work:
  when a user is shown the permission prompt and simply walks away without
  choosing, no callback ever fires. Chrome and Safari both leave the request
  outstanding indefinitely. Without a timeout the caller waits forever, which
  is precisely the failure that once made this screen appear to do nothing.
*/
const POSITION_TIMEOUT_MS = 10_000;

/*
  A cached fix is fine for choosing a ZIP - a neighbourhood does not move - and
  avoids a second permission round trip within a session.
*/
const MAX_POSITION_AGE_MS = 5 * 60_000;

/** The permission prompt only ever appears in a secure context. */
function isSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  // `isSecureContext` covers https and the localhost exemption in one, and is
  // supported everywhere the Geolocation API is.
  if (typeof window.isSecureContext === "boolean") return window.isSecureContext;

  const { protocol, hostname } = window.location ?? {};
  if (protocol === "https:") return true;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function geolocation(): Geolocation | null {
  if (typeof navigator === "undefined") return null;
  return typeof navigator.geolocation?.getCurrentPosition === "function"
    ? navigator.geolocation
    : null;
}

/**
 * Whether asking for a position could possibly succeed.
 *
 * False on an old browser and on a page served over plain http from anything
 * but localhost - the caller uses this to say *which* of those it is, rather
 * than reporting a generic failure.
 */
export function isLocationAvailable(): boolean {
  return geolocation() !== null && isSecureContext();
}

type PositionResult =
  | { status: "ok"; latitude: number; longitude: number }
  | { status: Exclude<LocationStatus, "ok"> };

/**
 * Ask the browser where it is.
 *
 * Never rejects and never outlives `POSITION_TIMEOUT_MS`. Every outcome the
 * Geolocation API can produce is mapped to a status the screen can explain,
 * including the one the spec does not cover: a prompt the user never answers,
 * which produces no callback at all.
 */
function currentPosition(): Promise<PositionResult> {
  const api = geolocation();
  if (!api) return Promise.resolve({ status: "unsupported" });
  if (!isSecureContext()) return Promise.resolve({ status: "insecure" });

  return new Promise<PositionResult>((resolve) => {
    let settled = false;
    const finish = (result: PositionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Belt and braces around the browser's own `timeout` option: Safari has
    // shipped versions where a dismissed prompt fires neither callback.
    const timer = setTimeout(
      () => finish({ status: "timeout" }),
      POSITION_TIMEOUT_MS + 1_000
    );

    try {
      api.getCurrentPosition(
        (position) =>
          finish({
            status: "ok",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        (error) => {
          // 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
          if (error?.code === 1) return finish({ status: "denied" });
          if (error?.code === 3) return finish({ status: "timeout" });
          return finish({ status: "unavailable" });
        },
        {
          // Low accuracy on purpose. A ZIP needs a neighbourhood, not a
          // doorstep, and the coarse fix is faster, cheaper on battery and
          // less revealing.
          enableHighAccuracy: false,
          timeout: POSITION_TIMEOUT_MS,
          maximumAge: MAX_POSITION_AGE_MS,
        }
      );
    } catch {
      // Some browsers throw synchronously inside a sandboxed iframe.
      finish({ status: "unavailable" });
    }
  });
}

/**
 * What the browser will do if we ask, without asking.
 *
 * The Permissions API answers this without showing anything. It matters
 * because a prompt that is not tied to a user gesture is suppressed outright
 * by some browsers, and a site the user has blocked will never prompt again —
 * so the app must be able to tell "not asked yet" from "refused" and offer the
 * right thing for each.
 *
 * Firefox has historically not supported querying geolocation here; an
 * unanswerable query is treated as "not asked yet", which degrades to showing
 * the button. That is the safe direction.
 */
async function permissionState(): Promise<"granted" | "prompt" | "denied"> {
  try {
    const status = await navigator.permissions?.query({
      name: "geolocation" as PermissionName,
    });
    if (status?.state === "granted") return "granted";
    if (status?.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/** Remembered for the session, so one visit asks the browser at most once. */
let cached: LocationLookup | null = null;
let inFlight: Promise<LocationLookup> | null = null;

async function lookUp(mayPrompt: boolean): Promise<LocationLookup> {
  if (!geolocation()) return { postalCode: null, status: "unsupported" };
  if (!isSecureContext()) return { postalCode: null, status: "insecure" };

  if (!mayPrompt) {
    const state = await permissionState();
    // Already granted: use it, silently, with no prompt of any kind.
    // Otherwise hand back a status the screen turns into a button.
    if (state !== "granted") {
      return { postalCode: null, status: state === "denied" ? "denied" : "prompt" };
    }
  }

  const position = await currentPosition();
  if (position.status !== "ok") {
    return { postalCode: null, status: position.status };
  }

  try {
    const body = (await apiRequest("/providers/resolve-location", {
      method: "POST",
      body: JSON.stringify({
        latitude: position.latitude,
        longitude: position.longitude,
      }),
      fallbackMessage: "We couldn't work out your ZIP code.",
    })) as { postal_code?: string | null } | null;

    const postalCode = body?.postal_code ?? null;
    // A null here means the coordinate is nowhere near a US ZIP. That is a
    // real answer, not a failure, and the user types a ZIP instead.
    return postalCode
      ? { postalCode, status: "ok" }
      : { postalCode: null, status: "unavailable" };
  } catch (caught) {
    // A signed-out session is the caller's problem to surface, not something
    // to disguise as a location failure - but it must not throw out of here,
    // because the screen renders its provider list off the back of this.
    if (caught instanceof ApiError && caught.isAuthError) {
      return { postalCode: null, status: "unavailable" };
    }
    return { postalCode: null, status: "unavailable" };
  }
}

/**
 * The device's 5-digit ZIP, with the reason when there isn't one.
 *
 * Pass `{ prompt: true }` to actually ask the browser. Without it this uses a
 * permission that has already been granted and otherwise reports `"prompt"`,
 * so the screen can offer a button instead of firing a permission request at
 * page load - which browsers suppress, and which leaves a blocked site with no
 * way back.
 *
 * Always settles, never throws. A null postal code is ordinary - permission
 * refused, prompt ignored, old browser, page served over plain http, or a
 * coordinate outside the US - and the caller asks the user to type a ZIP,
 * using `status` to say why it could not fill one in.
 */
export async function getPostalCode(
  options: { prompt?: boolean } = {}
): Promise<LocationLookup> {
  const mayPrompt = options.prompt === true;
  // A cached "prompt" is not an answer — it is the absence of one, and the
  // whole point of the button is to go and get it.
  if (cached && !(mayPrompt && cached.status === "prompt")) return cached;
  if (inFlight) return inFlight;

  inFlight = lookUp(mayPrompt)
    .then((result) => {
      // Remember a refusal too. Re-prompting someone who has said no, every
      // time they open the screen, is how an app gets its permission blocked
      // permanently.
      cached = result;
      return result;
    })
    .catch((): LocationLookup => ({ postalCode: null, status: "unavailable" }))
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Test seam: forgets the cached fix and any refusal. */
export function resetLocationCache(): void {
  cached = null;
  inFlight = null;
}
