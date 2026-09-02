/**
 * Regression tests for the bug where "Find a provider" appeared to do nothing.
 *
 * The search itself was never broken. `searchProviders` fired, the backend
 * answered, and providers came back — and then the screen threw the result
 * away by awaiting a location permission the user had not answered. The OS
 * does not reject an unanswered permission sheet; it leaves the promise
 * pending, so `Promise.all` over the distance lookups never settled,
 * `setProviders` was never called and `setLoading(false)` never ran. The user
 * saw a spinner forever: no list, no empty state, no error.
 *
 * Every other test in this suite mocks `locationService` wholesale, which is
 * exactly why none of them caught it. These tests use the real
 * `locationService` and mock `expo-location` at the platform boundary, so the
 * pending-promise behaviour that actually happens on a device is what gets
 * exercised.
 *
 * The property being defended, in one line: **the provider list is never
 * gated on the location subsystem.** Distances are a convenience laid over
 * the result; they may be missing, they may be late, and neither is allowed
 * to cost the user their search.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ProviderSearchScreen } from "@/screens/appointments/ProviderSearchScreen";
import { ApiError, searchProviders } from "@/services/providerService";
import { resetLocationCache } from "@/services/locationService";

/** Never settles — an OS permission sheet nobody has tapped yet. */
const pending = () => new Promise<never>(() => {});

// `mock`-prefixed so jest allows the factory below to close over them.
const mockRequestPermission = jest.fn();
const mockGetPermission = jest.fn();
const mockGetPosition = jest.fn();
const mockReverseGeocode = jest.fn();
const mockGeocode = jest.fn();

jest.mock(
  "expo-location",
  () => ({
    // Called through, rather than passed directly, so each test can change the
    // behaviour after `locationService` has already required the module.
    requestForegroundPermissionsAsync: (...args: unknown[]) =>
      mockRequestPermission(...args),
    // Checked before anything is asked, so opening the screen never throws a
    // permission sheet at the user.
    getForegroundPermissionsAsync: (...args: unknown[]) =>
      mockGetPermission(...args),
    getCurrentPositionAsync: (...args: unknown[]) => mockGetPosition(...args),
    reverseGeocodeAsync: (...args: unknown[]) => mockReverseGeocode(...args),
    geocodeAsync: (...args: unknown[]) => mockGeocode(...args),
    Accuracy: { Low: 1 },
  }),
  { virtual: true }
);

jest.mock("@/services/providerService", () => ({
  ...jest.requireActual("@/services/providerService"),
  searchProviders: jest.fn(),
}));

const mockSearch = searchProviders as jest.MockedFunction<typeof searchProviders>;

function provider(overrides = {}) {
  return {
    npi: "1000000001",
    name: "Synthetic Urgent Care",
    specialty: "Clinic/Center, Urgent Care",
    phone: "(212) 555-0143",
    address: "1 Synthetic Plaza, New York, NY, 10001",
    city: "New York",
    state: "NY",
    postalCode: "10001",
    sourceName: "NPPES NPI Registry, US Centers for Medicare & Medicaid Services",
    distanceMiles: null,
    ...overrides,
  };
}

function renderScreen() {
  const navigate = jest.fn();
  render(
    <ProviderSearchScreen
      navigation={{ navigate } as any}
      route={{ params: undefined } as any}
    />
  );
  return { navigate };
}

/** Press the control that asks the browser or OS for a position. */
async function useMyLocation() {
  fireEvent.press(await screen.findByLabelText("Use my location"));
}

async function search(zip = "10001") {
  fireEvent.changeText(screen.getByLabelText("ZIP code"), zip);
  fireEvent.press(screen.getByLabelText("Search"));
  await waitFor(() => expect(mockSearch).toHaveBeenCalled());
}

beforeEach(() => {
  jest.useFakeTimers();
  resetLocationCache();
  mockSearch.mockReset();
  mockRequestPermission.mockReset();
  mockGetPermission.mockReset();
  // Default: nobody has been asked yet, so the screen offers the button.
  mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: true });
  mockGetPosition.mockReset();
  mockReverseGeocode.mockReset();
  mockGeocode.mockReset();

  mockSearch.mockResolvedValue({
    providers: [provider()],
    careSetting: "family_medicine",
    postalCode: "10001",
    onlineBookingAvailable: false,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("provider search when location never answers", () => {
  it("shows the providers even though the permission prompt is unanswered", async () => {
    // The exact shipped bug: nothing rejects, nothing resolves.
    mockRequestPermission.mockImplementation(pending);
    mockGetPosition.mockImplementation(pending);
    mockReverseGeocode.mockImplementation(pending);
    mockGeocode.mockImplementation(pending);

    renderScreen();
    await useMyLocation();
    await search();

    // Before the fix this never arrived — the result sat behind the pending
    // permission and the screen spun forever.
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(screen.queryByText(/Searching the provider directory/i)).toBeNull();
  });

  it("never claims to be checking your location forever", async () => {
    mockRequestPermission.mockImplementation(pending);
    mockGetPosition.mockImplementation(pending);
    mockReverseGeocode.mockImplementation(pending);
    mockGeocode.mockImplementation(pending);

    renderScreen();
    await useMyLocation();
    expect(screen.queryByText(/Checking your location/i)).toBeTruthy();

    // Bounded by the permission deadline rather than the mount hint timer:
    // the user pressed a button and the OS sheet may genuinely be open, so
    // waiting is right — waiting *forever* is not.
    await jest.advanceTimersByTimeAsync(20_000);
    expect(screen.queryByText(/Checking your location/i)).toBeNull();
  });

  it("does not sit on 'Checking your location' when nobody pressed anything", async () => {
    // The mount path must settle quickly, because nothing was asked for.
    mockRequestPermission.mockImplementation(pending);
    mockGetPermission.mockImplementation(pending);

    renderScreen();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(screen.queryByText(/Checking your location/i)).toBeNull();
  });

  it("asks for permission once, not once per provider", async () => {
    // Twenty rows used to mean twenty concurrent permission requests, because
    // nothing was cached until the first one resolved.
    mockRequestPermission.mockImplementation(pending);
    mockSearch.mockResolvedValue({
      providers: Array.from({ length: 20 }, (_, index) =>
        provider({ npi: `100000000${index}`, name: `Synthetic Clinic ${index}` })
      ),
      careSetting: "family_medicine",
      postalCode: "10001",
      onlineBookingAvailable: false,
    });

    renderScreen();
    await useMyLocation();
    await search();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("provider search when location is refused", () => {
  beforeEach(() => {
    mockRequestPermission.mockResolvedValue({ granted: false });
  });

  it("says so, instead of leaving the ZIP field blank with no explanation", async () => {
    renderScreen();
    await useMyLocation();

    expect(
      await screen.findByText(/location is blocked for this site/i)
    ).toBeTruthy();
  });

  it("does not ask again on arrival once the platform has a standing refusal", async () => {
    // A permission sheet on every visit to someone who already said no is how
    // an app gets permanently blocked.
    mockGetPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    renderScreen();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/location is blocked for this site/i)
    ).toBeTruthy();
  });

  it("still returns providers, without distances", async () => {
    renderScreen();
    await useMyLocation();
    await search();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(screen.queryByText(/~/)).toBeNull();
    expect(mockGetPosition).not.toHaveBeenCalled();
  });
});

describe("provider search when location works", () => {
  beforeEach(() => {
    // Already granted, so the ZIP fills in on arrival with nothing shown.
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockGetPosition.mockResolvedValue({
      coords: { latitude: 40.7506, longitude: -73.9972 },
    });
    mockReverseGeocode.mockResolvedValue([{ postalCode: "10001" }]);
    mockGeocode.mockResolvedValue([{ latitude: 40.7128, longitude: -74.006 }]);
  });

  it("prefills the ZIP and shows distances as estimates", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByLabelText("ZIP code").props.value).toBe("10001"));
    // No notice: nothing went wrong, so there is nothing to explain.
    expect(screen.queryByText(/couldn't work out a ZIP code from your location/i)).toBeNull();

    mockSearch.mockResolvedValue({
      providers: [provider({ distanceMiles: 1.24 })],
      careSetting: "family_medicine",
      postalCode: "10001",
      onlineBookingAvailable: false,
    });
    fireEvent.press(screen.getByLabelText("Search"));
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());
    await jest.advanceTimersByTimeAsync(1_000);

    // Straight-line between ZIP centroids, computed by the API — the tilde
    // says so.
    expect(await screen.findByText("~1.2 mi")).toBeTruthy();
  });
});

describe("provider search on a platform with no geocoder", () => {
  // Every browser. `expo-location` throws E_NO_GEOCODER from both geocoding
  // calls, so a ZIP can never be derived from a position there.
  //
  // This reached a user as "the app says it can't find any locations": the
  // screen raised a grey box reading "MedHelp couldn't work out where you are
  // on this device" on every single visit. Nothing was wrong — the browser
  // simply has no geocoder, and never will. A standing platform limit must
  // read as a limit, not as a failure.
  const noGeocoder = () => {
    const error = new Error("Geocoder service is not available for this device.");
    (error as Error & { code: string }).code = "E_NO_GEOCODER";
    return Promise.reject(error);
  };

  beforeEach(() => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockGetPosition.mockResolvedValue({
      coords: { latitude: 40.7506, longitude: -73.9972 },
    });
    mockReverseGeocode.mockImplementation(noGeocoder);
    mockGeocode.mockImplementation(noGeocoder);
  });

  it("does not raise an alarm about a permanent platform limit", async () => {
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    renderScreen();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(screen.queryByText(/couldn't work out a ZIP code from your location/i)).toBeNull();
  });

  it("says so once, next to the field the user has to type in", async () => {
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    renderScreen();

    expect(
      await screen.findByText(/this browser can't share your location/i)
    ).toBeTruthy();
  });

  it("still finds providers", async () => {
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    renderScreen();
    await search();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(screen.queryByText(/~/)).toBeNull();
  });
});

describe("provider search when the platform answers with nonsense", () => {
  // Not hypothetical: Expo Go, the web shim and jest all have builds where
  // `requestForegroundPermissionsAsync` resolves to `undefined` rather than a
  // verdict. Reading `.granted` off that threw out of `locationService`
  // entirely, which left the mount lookup's promise rejected and the ZIP hint
  // stuck on "Checking your location…". Found by running the real flow.
  it("treats an unreadable permission answer as 'we don't know'", async () => {
    mockRequestPermission.mockResolvedValue(undefined);

    renderScreen();
    await useMyLocation();
    await search();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(screen.queryByText(/Checking your location/i)).toBeNull();
    expect(
      screen.queryByText(/couldn't work out a ZIP code from your location/i)
    ).toBeTruthy();
  });

  it("treats a fix with no usable coordinates as 'we don't know'", async () => {
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockGetPosition.mockResolvedValue({ coords: undefined });

    renderScreen();
    await search();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(screen.queryByText(/~/)).toBeNull();
  });
});

describe("provider search when the session has gone", () => {
  // The token is held in memory only, so a browser reload loses it while the
  // app still looks signed in. The screen used to offer "Try again" for a
  // failure that retrying can never fix.
  it("offers a way back to sign-in instead of an endless retry", async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });
    mockSearch.mockRejectedValue(
      new ApiError("Your session has expired. Please sign in again.", {
        isAuthError: true,
        status: 401,
      })
    );

    const { navigate } = renderScreen();
    await search();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(await screen.findByText(/session has expired/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Sign in"));
    expect(navigate).toHaveBeenCalledWith("Login");
  });

  it("still offers a plain retry for an ordinary failure", async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });
    mockSearch.mockRejectedValue(
      new ApiError("The provider directory is unavailable right now.")
    );

    renderScreen();
    await search();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(await screen.findByLabelText("Try again")).toBeTruthy();
    expect(screen.queryByLabelText("Sign in")).toBeNull();
  });
});

describe("provider search when the distance lookup misbehaves", () => {
  it("still shows the list when the geocoder throws", async () => {
    // A distance failure must never reach the screen's catch block and be
    // reported as "we couldn't search for providers" — the search worked.
    mockGetPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockGetPosition.mockResolvedValue({
      coords: { latitude: 40.75, longitude: -73.99 },
    });
    mockReverseGeocode.mockRejectedValue(new Error("geocoder exploded"));
    mockGeocode.mockRejectedValue(new Error("geocoder exploded"));

    renderScreen();
    await search();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(screen.queryByText(/couldn't search for providers/i)).toBeNull();
  });
});
