import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ProviderSearchScreen } from "@/screens/appointments/ProviderSearchScreen";
import { searchProviders } from "@/services/providerService";
import { getPostalCode } from "@/services/locationService";

jest.mock("@/services/providerService", () => ({
  ...jest.requireActual("@/services/providerService"),
  searchProviders: jest.fn(),
}));

jest.mock("@/services/locationService", () => ({
  getPostalCode: jest.fn(),
}));

const mockSearch = searchProviders as jest.MockedFunction<typeof searchProviders>;
const mockPostalCode = getPostalCode as jest.MockedFunction<typeof getPostalCode>;

/**
 * `getPostalCode` reports why it has no ZIP, not just that it hasn't got one —
 * the screen needs the reason to tell the user something instead of leaving a
 * blank field. See `locationService`.
 */
function located(postalCode: string) {
  return { postalCode, status: "ok" as const };
}

function noLocation(status: "denied" | "timeout" | "unsupported" | "unavailable") {
  return { postalCode: null, status };
}

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

function result(providers = [provider()]) {
  return {
    providers,
    careSetting: "urgent_care",
    postalCode: "10001",
    onlineBookingAvailable: false,
  };
}

function renderScreen(params?: object) {
  const navigate = jest.fn();
  render(
    <ProviderSearchScreen
      navigation={{ navigate } as any}
      route={{ params } as any}
    />
  );
  return { navigate };
}

beforeEach(() => {
  mockSearch.mockReset();
  mockPostalCode.mockReset();
  mockSearch.mockResolvedValue(result());
  mockPostalCode.mockResolvedValue(noLocation("denied"));
});

describe("ProviderSearchScreen", () => {
  it("prefills the ZIP from the device when it can", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    renderScreen();

    expect(await screen.findByDisplayValue("10001")).toBeTruthy();
  });

  it("still works when location is refused", async () => {
    // Refusing a health app your location is a reasonable thing to do. The
    // whole feature has to remain reachable by typing.
    mockPostalCode.mockResolvedValue(noLocation("denied"));
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText(/Only the ZIP is sent/i)).toBeTruthy()
    );

    fireEvent.changeText(screen.getByDisplayValue(""), "10001");
    fireEvent.press(screen.getByText("Search"));

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("10001", expect.any(String)));
  });

  it("rejects a ZIP that is not five digits, without calling the API", async () => {
    renderScreen();
    await waitFor(() => expect(mockPostalCode).toHaveBeenCalled());

    fireEvent.changeText(screen.getByDisplayValue(""), "123");
    fireEvent.press(screen.getByText("Search"));

    expect(await screen.findByText("Enter a 5-digit ZIP code.")).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("never shows an appointment time", async () => {
    // There is no source for one. A time here would be invented, and someone
    // would turn up to an appointment that does not exist.
    mockPostalCode.mockResolvedValue(located("10001"));
    renderScreen();

    fireEvent.press(await screen.findByText("Search"));

    await screen.findByText("Synthetic Urgent Care");
    expect(screen.queryByText(/next available/i)).toBeNull();
    expect(screen.queryByText(/book now/i)).toBeNull();
  });

  it("marks distances as estimates", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    mockSearch.mockResolvedValue(result([provider({ distanceMiles: 1.24 })]));
    renderScreen();

    fireEvent.press(await screen.findByText("Search"));

    // The tilde matters: this is a straight-line estimate between ZIP
    // centroids, not a driving distance.
    expect(await screen.findByText("~1.2 mi")).toBeTruthy();
  });

  it("shows providers with no known distance rather than dropping them", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    mockSearch.mockResolvedValue(
      result([
        provider({ npi: "1000000001", name: "Near Clinic", distanceMiles: 2.5 }),
        provider({
          npi: "1000000002",
          name: "Unknown Distance Clinic",
          distanceMiles: null,
        }),
      ])
    );
    renderScreen();

    fireEvent.press(await screen.findByText("Search"));

    expect(await screen.findByText("Near Clinic")).toBeTruthy();
    expect(screen.getByText("Unknown Distance Clinic")).toBeTruthy();
  });

  it("says it does not rank or recommend providers", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    renderScreen();

    fireEvent.press(await screen.findByText("Search"));

    expect(
      await screen.findByText(/does not rank or recommend providers/i)
    ).toBeTruthy();
  });

  it("distinguishes an empty result from a failure", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    mockSearch.mockResolvedValue(result([]));
    renderScreen();

    fireEvent.press(await screen.findByText("Search"));

    expect(await screen.findByText("No providers found")).toBeTruthy();
  });

  it("reports a directory outage as an error, not as an empty list", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    mockSearch.mockRejectedValue(new Error("503"));
    renderScreen();

    fireEvent.press(await screen.findByText("Search"));

    expect(await screen.findByText(/couldn't search for providers/i)).toBeTruthy();
    expect(screen.queryByText("No providers found")).toBeNull();
  });

  it("tells a user arriving from intake that their description carries over", async () => {
    renderScreen({
      intake: {
        reasonForVisit: "Sore throat and a fever since Tuesday.",
        tier: "URGENT",
        assessmentId: "assessment-1",
      },
    });

    expect(
      await screen.findByText("Following up on your symptom check")
    ).toBeTruthy();
  });

  it("passes the intake context on to the provider detail screen", async () => {
    mockPostalCode.mockResolvedValue(located("10001"));
    const intake = {
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT" as const,
      assessmentId: "assessment-1",
    };
    const { navigate } = renderScreen({ intake });

    fireEvent.press(await screen.findByText("Search"));
    fireEvent.press(await screen.findByText("Synthetic Urgent Care"));

    expect(navigate).toHaveBeenCalledWith(
      "ProviderDetail",
      expect.objectContaining({ intake })
    );
  });
});
