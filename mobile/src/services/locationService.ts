/**
 * The device's rough location, used only to fill in a ZIP code and to work out
 * how far away a provider is.
 *
 * ## What leaves the phone
 *
 * Nothing, from here. This module makes no network call. Coordinates are
 * turned into a postal code by the operating system's own geocoder (Apple on
 * iOS, Google Play services on Android) — the same one the Maps app uses — and
 * only the resulting **5-digit ZIP** is ever handed to the caller.
 *
 * That matters because the ZIP is what the provider search sends onward to
 * CMS. Precise coordinates would be a far more identifying thing to put in a
 * third party's query log, and they are never sent: `getPostalCode` returns a
 * ZIP, and there is no exported function that returns a latitude.
 *
 * Distances are **not** computed here any more. They arrive on each provider
 * row from the search API, which is already told the searched ZIP and already
 * returns every provider's ZIP — so it can measure between them without
 * learning anything new, and the web build gets distances too, which it never
 * could from a browser. See `backend/app/services/zip_geography.py`.
 *
 * ## It is optional, everywhere — and it is never allowed to hang
 *
 * `expo-location` is a native module: it is absent in Expo Go, on the web
 * build and under jest. Permission can also be refused, and refusing is a
 * perfectly reasonable thing for someone to do with a health app.
 *
 * Refusal was always handled. What was not — and what silently broke the
 * provider search — is the case where the platform never answers at all: the
 * OS permission sheet is on screen and the user has not tapped it yet, the
 * browser's geolocation callback never fires because there is no fix, location
 * services are switched off at the OS level. None of those reject. They leave
 * a promise pending forever, and an `await` on one never returns.
 *
 * So every call into `expo-location` below is bounded by a deadline, and every
 * function here returns a value rather than throwing or hanging. "We don't
 * know where you are" is a first-class outcome with a reason attached, not an
 * exception and never an unresolved promise.
 */

/** Why a location lookup did or didn't produce coordinates. */
export type LocationStatus =
  /** A fix was obtained. */
  | "ok"
  /** `expo-location` isn't present — Expo Go, the web build, jest. */
  | "unsupported"
  /** The user said no. */
  | "denied"
  /**
   * Nobody has been asked yet, and this call was not allowed to ask.
   *
   * The screen turns this into a "Use my location" button. Prompting without
   * a user gesture is suppressed outright by some browsers, and once a site is
   * blocked there is no way back from inside the app — so asking is always
   * something the user starts.
   */
  | "prompt"
  /** Asked, and the platform never came back inside the deadline. */
  | "timeout"
  /**
   * Web only: the page is served over plain http from something other than
   * localhost, so the browser refuses to run the Geolocation API at all. A
   * setup problem with a clear fix, not a user choice — see
   * `locationService.web.ts`.
   */
  | "insecure"
  /** Asked and answered, but nothing usable came back. */
  | "unavailable";

export interface LocationLookup {
  /** The device's 5-digit ZIP, or null when it could not be determined. */
  postalCode: string | null;
  /** Why, so a screen can say something instead of showing a blank field. */
  status: LocationStatus;
}

interface LocationModule {
  requestForegroundPermissionsAsync: () => Promise<{ granted: boolean }>;
  getForegroundPermissionsAsync?: () => Promise<{
    granted: boolean;
    canAskAgain?: boolean;
  }>;
  getCurrentPositionAsync: (options: object) => Promise<{
    coords: { latitude: number; longitude: number };
  }>;
  reverseGeocodeAsync: (coords: {
    latitude: number;
    longitude: number;
  }) => Promise<Array<{ postalCode?: string | null }>>;
  geocodeAsync: (
    address: string
  ) => Promise<Array<{ latitude: number; longitude: number }>>;
  Accuracy?: { Low?: number; Balanced?: number };
}

/*
  Deadlines.

  The permission one is the most generous by a distance, because a person
  reading an OS permission sheet legitimately takes several seconds, and
  cutting them off would throw away a grant they were about to give. The fix
  and the geocode are machine-speed operations, so a long wait on either means
  it is not coming.

  These bound *this* module, which runs once on mount to prefill the ZIP field.
  Nothing the user asked for waits on it: the search runs off whatever is in
  that field, and the provider list has never been allowed to depend on it.
*/
const PERMISSION_TIMEOUT_MS = 15_000;
const POSITION_TIMEOUT_MS = 10_000;
const GEOCODE_TIMEOUT_MS = 8_000;

type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error"; error?: unknown };

/**
 * `E_NO_GEOCODER` means this platform has no geocoder at all — not that a
 * lookup failed. Expo raises it on web and on Android devices without the
 * Play services geocoder.
 *
 * The difference is the whole message the user sees. "Unavailable" invites a
 * retry that will never work; "unsupported" is a standing fact, and the screen
 * states it quietly beside the ZIP field instead of raising an alarm.
 */
function isMissingGeocoder(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "E_NO_GEOCODER";
}

/**
 * Await `work`, but give up after `ms`.
 *
 * Never rejects, and never stays pending past the deadline. Handlers are
 * attached to `work` immediately, so a rejection arriving *after* we have
 * given up is consumed here rather than surfacing as an unhandled rejection.
 *
 * The losing promise is not cancelled — it cannot be. That is deliberate: a
 * permission the user grants late still resolves, still fills the cache below,
 * and so the next search has distances even though this one did not.
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error) => {
        clearTimeout(timer);
        // The error is carried so callers can tell a platform that has no
        // geocoder from one whose geocoder failed. It is never logged: an
        // expo-location rejection can carry the coordinates it was given.
        resolve({ ok: false, reason: "error", error });
      }
    );
  });
}

/**
 * Load `expo-location` without letting its absence crash the screen.
 *
 * The module name is a literal for the same reason as in `labelScanner`:
 * Metro resolves requires statically at bundle time, so a variable here fails
 * to resolve on a real device even when the package is installed.
 */
function loadLocation(): LocationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require("expo-location") as LocationModule;
    return typeof module?.getCurrentPositionAsync === "function" ? module : null;
  } catch {
    return null;
  }
}

export function isLocationAvailable(): boolean {
  return loadLocation() !== null;
}

interface Coords {
  latitude: number;
  longitude: number;
}

interface CoordsResult {
  coords: Coords | null;
  status: LocationStatus;
}

let cachedCoords: Coords | null = null;
/** A settled, non-`ok` verdict worth remembering for the session — see below. */
let cachedStatus: LocationStatus | null = null;
/**
 * The permission request itself, memoised for the session.
 *
 * Without this, a list of twenty providers fires twenty concurrent permission
 * requests: `Promise.all` starts them all before the first has resolved and
 * filled the cache. Every caller now awaits the same one request.
 */
let permissionRequest: Promise<Settled<{ granted: boolean }>> | null = null;
/** The in-flight fix, so concurrent callers share a single attempt. */
let coordsRequest: Promise<CoordsResult> | null = null;

async function requestCoords(mayPrompt: boolean): Promise<CoordsResult> {
  const location = loadLocation();
  if (!location) return { coords: null, status: "unsupported" };

  // Look before asking. A permission already granted needs no prompt, and one
  // already refused must not produce a second sheet the user never asked for.
  if (!mayPrompt) {
    const existing = await withDeadline(
      Promise.resolve().then(() => location.getForegroundPermissionsAsync?.()),
      PERMISSION_TIMEOUT_MS
    );
    if (!existing.ok || typeof existing.value?.granted !== "boolean") {
      return { coords: null, status: "prompt" };
    }
    if (!existing.value.granted) {
      return {
        coords: null,
        status: existing.value.canAskAgain === false ? "denied" : "prompt",
      };
    }
  }

  if (!permissionRequest) {
    permissionRequest = withDeadline(
      // Wrapped rather than called directly so a synchronous throw inside the
      // native module lands as a rejected promise, not an exception here.
      Promise.resolve().then(() => location.requestForegroundPermissionsAsync()),
      PERMISSION_TIMEOUT_MS
    );
  }
  const permission = await permissionRequest;

  if (!permission.ok) {
    // A permission request that never came back is retryable — the user may
    // still be looking at the sheet. Forget it so a later search can ask
    // again, rather than caching a verdict we never actually received.
    permissionRequest = null;
    return {
      coords: null,
      status: permission.reason === "timeout" ? "timeout" : "unavailable",
    };
  }
  // Not every platform honours the contract. Expo Go, the web shim and jest
  // all have builds that return `undefined` here rather than a verdict object,
  // and reading `.granted` off that used to throw straight out of this module.
  // An answer we cannot read is "we don't know", never "granted".
  if (typeof permission.value?.granted !== "boolean") {
    return { coords: null, status: "unavailable" };
  }
  if (!permission.value.granted) {
    return { coords: null, status: "denied" };
  }

  const position = await withDeadline(
    Promise.resolve().then(() =>
      location.getCurrentPositionAsync({
        // Low accuracy on purpose. A ZIP code needs a neighbourhood, not a
        // doorstep, and the coarser fix is faster and less revealing.
        accuracy: location.Accuracy?.Low ?? 1,
      })
    ),
    POSITION_TIMEOUT_MS
  );

  if (!position.ok) {
    return {
      coords: null,
      status: position.reason === "timeout" ? "timeout" : "unavailable",
    };
  }

  const fix = position.value?.coords;
  if (!Number.isFinite(fix?.latitude) || !Number.isFinite(fix?.longitude)) {
    return { coords: null, status: "unavailable" };
  }

  cachedCoords = { latitude: fix.latitude, longitude: fix.longitude };
  return { coords: cachedCoords, status: "ok" };
}

async function getCoords(mayPrompt: boolean): Promise<CoordsResult> {
  if (cachedCoords) return { coords: cachedCoords, status: "ok" };

  // A refusal, and a missing module, are settled facts for this session.
  // Re-asking on every provider row would re-prompt someone who has already
  // said no. A timeout is not cached, because it is not an answer.
  if (cachedStatus === "denied" || cachedStatus === "unsupported") {
    return { coords: null, status: cachedStatus };
  }

  if (!coordsRequest) {
    coordsRequest = requestCoords(mayPrompt)
      .then((result) => {
        if (result.status === "denied" || result.status === "unsupported") {
          cachedStatus = result.status;
        }
        return result;
      })
      // The contract this module advertises is that it returns a value rather
      // than throwing, because a screen renders its provider list off the back
      // of it. Anything unforeseen becomes "we don't know where you are".
      .catch((): CoordsResult => ({ coords: null, status: "unavailable" }))
      .finally(() => {
        coordsRequest = null;
      });
  }
  return coordsRequest;
}

/**
 * The device's 5-digit ZIP, with the reason when there isn't one.
 *
 * Pass `{ prompt: true }` to actually ask for permission. Without it this only
 * uses a permission that has already been granted, and reports `"prompt"`
 * otherwise — so the screen can offer a button rather than throwing a
 * permission sheet at someone who has just opened it.
 *
 * A null postal code is an ordinary outcome, not an error — no module, no
 * permission, no fix, no geocoder result. The caller asks the user to type a
 * ZIP instead, and uses `status` to say why it could not fill one in, rather
 * than leaving a field mysteriously blank or a hint spinning forever.
 */
export async function getPostalCode(
  options: { prompt?: boolean } = {}
): Promise<LocationLookup> {
  const location = loadLocation();
  if (!location) return { postalCode: null, status: "unsupported" };

  const { coords, status } = await getCoords(options.prompt === true);
  if (!coords) return { postalCode: null, status };

  const places = await withDeadline(
    Promise.resolve().then(() => location.reverseGeocodeAsync(coords)),
    GEOCODE_TIMEOUT_MS
  );
  if (!places.ok) {
    if (isMissingGeocoder(places.error)) {
      return { postalCode: null, status: "unsupported" };
    }
    return {
      postalCode: null,
      status: places.reason === "timeout" ? "timeout" : "unavailable",
    };
  }

  if (!Array.isArray(places.value)) {
    return { postalCode: null, status: "unavailable" };
  }

  const postal = places.value.find((place) => place?.postalCode)?.postalCode;
  if (typeof postal !== "string" || !postal) {
    return { postalCode: null, status: "unavailable" };
  }

  const digits = postal.replace(/\D/g, "").slice(0, 5);
  return digits.length === 5
    ? { postalCode: digits, status: "ok" }
    : { postalCode: null, status: "unavailable" };
}

/** Test seam: clears the cached fix and permission verdict. */
export function resetLocationCache(): void {
  cachedCoords = null;
  cachedStatus = null;
  permissionRequest = null;
  coordsRequest = null;
}
