import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { ProviderDetailScreen } from "@/screens/appointments/ProviderDetailScreen";
import type { Provider } from "@/services/providerService";

const PROVIDER: Provider = {
  npi: "1000000001",
  name: "Synthetic Urgent Care",
  specialty: "Clinic/Center, Urgent Care",
  phone: "(212) 555-0143",
  address: "1 Synthetic Plaza, New York, NY, 10001",
  city: "New York",
  state: "NY",
  postalCode: "10001",
  sourceName: "NPPES NPI Registry, US Centers for Medicare & Medicaid Services",
  distanceMiles: 1.24,
};

function renderScreen(provider: Provider = PROVIDER, intake?: object) {
  const navigate = jest.fn();
  render(
    <ProviderDetailScreen
      navigation={{ navigate } as any}
      route={{ params: { provider, intake } } as any}
    />
  );
  return { navigate };
}

describe("ProviderDetailScreen", () => {
  it("explains that it cannot show appointment times, rather than showing none silently", () => {
    renderScreen();

    expect(screen.getByText("Available times")).toBeTruthy();
    expect(screen.getByText(/can't see this provider's calendar/i)).toBeTruthy();
  });

  it("shows no invented slots", () => {
    renderScreen();

    expect(screen.queryByText(/next available/i)).toBeNull();
    expect(screen.queryByText(/\d{1,2}:\d{2}\s*(am|pm)/i)).toBeNull();
  });

  it("keeps the request flow inside the app", () => {
    const intake = {
      reasonForVisit: "Sore throat.",
      tier: "URGENT" as const,
      assessmentId: "assessment-1",
    };
    const { navigate } = renderScreen(PROVIDER, intake);

    fireEvent.press(screen.getByText("Request this appointment"));

    expect(navigate).toHaveBeenCalledWith("AppointmentRequest", {
      provider: PROVIDER,
      intake,
    });
  });

  it("dials the provider rather than opening a maps or booking page", () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    renderScreen();

    fireEvent.press(screen.getByText("Call (212) 555-0143"));

    expect(openURL).toHaveBeenCalledWith("tel:2125550143");
    openURL.mockRestore();
  });

  it("carries the directory attribution", () => {
    renderScreen();

    expect(screen.getByText(/NPPES NPI Registry/)).toBeTruthy();
  });

  it("renders a provider with no phone number without offering to call", () => {
    renderScreen({ ...PROVIDER, phone: null });

    expect(screen.getByText("Request this appointment")).toBeTruthy();
    expect(screen.queryByText(/^Call /)).toBeNull();
  });
});
