import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AppointmentConfirmationScreen } from "@/screens/appointments/AppointmentConfirmationScreen";
import { getBookingCapability } from "@/services/appointmentService";
import type { Appointment } from "@/services/appointmentService";

jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  getBookingCapability: jest.fn(),
}));

const mockCapability = getBookingCapability as jest.MockedFunction<
  typeof getBookingCapability
>;

beforeEach(() => {
  mockCapability.mockReset();
  // The standing state: no BAA-covered channel, so no booking.
  mockCapability.mockResolvedValue(false);
});

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appointment-1",
    providerName: "Synthetic Urgent Care",
    providerNpi: "1000000001",
    providerSpecialty: "Clinic/Center, Urgent Care",
    providerPhone: "(212) 555-0143",
    providerAddress: "1 Synthetic Plaza, New York, NY, 10001",
    reasonForVisit: "Sore throat and a fever since Tuesday.",
    preferredTime: "Thursday morning",
    urgencyTier: "URGENT",
    sourceAssessmentId: "assessment-1",
    notes: null,
    status: "REQUESTED",
    providerNotified: false,
    createdAt: "2026-08-29T10:00:00Z",
    ...overrides,
  };
}

function renderScreen(overrides: Partial<Appointment> = {}) {
  const replace = jest.fn();
  const navigate = jest.fn();
  render(
    <AppointmentConfirmationScreen
      navigation={{ replace, navigate } as any}
      route={{ params: { appointment: appointment(overrides) } } as any}
    />
  );
  return { replace, navigate };
}

describe("AppointmentConfirmationScreen", () => {
  it("does not tell the user anything was booked or confirmed", () => {
    // This is the screen most likely to be misread. Nothing has been
    // confirmed: a row exists in MedHelp and the clinic has never heard of it.
    renderScreen();

    expect(screen.queryByText(/confirmed/i)).toBeNull();
    expect(screen.queryByText(/booked/i)).toBeNull();
    expect(screen.getByText("Saved to your appointments")).toBeTruthy();
  });

  it("says in as many words that the provider has not been contacted", () => {
    renderScreen();

    expect(screen.getByText(/has not been contacted/i)).toBeTruthy();
  });

  it("gives calling the clinic as the next step", () => {
    renderScreen();

    expect(screen.getByText("Next step")).toBeTruthy();
    expect(screen.getByText("Call (212) 555-0143")).toBeTruthy();
  });

  it("shows what was saved, including the reason carried from intake", () => {
    renderScreen();

    expect(
      screen.getByText("Sore throat and a fever since Tuesday.")
    ).toBeTruthy();
    expect(screen.getByText("Thursday morning")).toBeTruthy();
    expect(
      screen.getByText("Requested — not yet arranged with the provider")
    ).toBeTruthy();
  });

  it("changes its story only if the provider really was notified", () => {
    // Guards the day a BAA-covered booking channel exists: the screen should
    // then stop under-promising, and until then this branch is unreachable
    // because the server never returns providerNotified true.
    renderScreen({ providerNotified: true });

    expect(screen.getByText("Appointment booked")).toBeTruthy();
    expect(screen.queryByText("Next step")).toBeNull();
  });

  describe("the booking path is gated on the server's answer", () => {
    it("does not offer to send anything while booking is unavailable", async () => {
      // The screen behind this button asks for a legal name, date of birth and
      // home address. While there is nowhere to send them, it must be
      // unreachable — collecting them for no purpose is the failure mode.
      renderScreen();

      await waitFor(() => expect(mockCapability).toHaveBeenCalled());
      expect(screen.queryByText("Send request to provider")).toBeNull();
      expect(screen.getByText("Call (212) 555-0143")).toBeTruthy();
    });

    it("offers to send once a channel exists", async () => {
      mockCapability.mockResolvedValue(true);
      renderScreen();

      expect(await screen.findByText("Send request to provider")).toBeTruthy();
    });

    it("passes only an id to the identity form, never a person", async () => {
      mockCapability.mockResolvedValue(true);
      const { navigate } = renderScreen();

      fireEvent.press(await screen.findByText("Send request to provider"));

      expect(navigate).toHaveBeenCalledWith("BookingIdentity", {
        appointmentId: "appointment-1",
        providerName: "Synthetic Urgent Care",
      });
    });

    it("falls back to calling when the capability check fails", async () => {
      mockCapability.mockRejectedValue(new Error("offline"));
      renderScreen();

      await waitFor(() => expect(mockCapability).toHaveBeenCalled());
      expect(screen.queryByText("Send request to provider")).toBeNull();
      expect(screen.getByText("Call (212) 555-0143")).toBeTruthy();
    });
  });
});
