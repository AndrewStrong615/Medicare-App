/**
 * Tests for the consolidated home screen.
 *
 * The screen was reduced to four things you can press plus the emergency
 * card. What these tests hold is that the reduction was a *move*: everything
 * that came off it is still reachable, and the one-tap promises — emergency
 * card, symptom intake — did not get further away.
 *
 * All values below are invented.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { HomeScreen } from "@/screens/HomeScreen";
import { listAppointments } from "@/services/appointmentService";

jest.mock("@/services/appointmentService", () => ({
  listAppointments: jest.fn(async () => []),
}));

// The screen reloads the inline appointment on focus. Outside a navigator
// there is no focus event, so the effect runs as a plain mount.
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
}));

const APPOINTMENT = {
  id: "appt-1",
  providerName: "Dr. Imaginary",
  providerNpi: null,
  providerSpecialty: "Family Medicine",
  providerPhone: "555-0100",
  providerAddress: null,
  reasonForVisit: "Synthetic reason",
  preferredTime: "Thursday morning",
  urgencyTier: null,
  sourceAssessmentId: null,
  notes: null,
  status: "REQUESTED" as const,
  providerNotified: false,
  createdAt: "2026-09-01T10:00:00Z",
};

/**
 * Renders and lets the appointment lookup settle.
 *
 * Awaited even by the tests that do not look at the appointment line: the
 * lookup resolves either way, and an un-awaited state update after the test
 * body has finished is what produces React's `act(...)` warning.
 */
async function renderHomeScreen() {
  const navigate = jest.fn();
  const reset = jest.fn();
  render(<HomeScreen navigation={{ navigate, reset } as any} route={{} as any} />);
  await act(async () => {});
  return { navigate, reset };
}

describe("HomeScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listAppointments as jest.Mock).mockResolvedValue([]);
  });

  describe("the primary actions", () => {
    it("renders the app name and the four things you can press", async () => {
      await renderHomeScreen();

      expect(screen.getByText("MedHelp")).toBeTruthy();
      expect(screen.getByText("Not feeling well?")).toBeTruthy();
      expect(screen.getByText("Add medication")).toBeTruthy();
      expect(screen.getByText("Upcoming appointments")).toBeTruthy();
      expect(screen.getByText("More")).toBeTruthy();
    });

    it("opens symptom intake", async () => {
      const { navigate } = await renderHomeScreen();

      fireEvent.press(screen.getByText("Not feeling well?"));

      expect(navigate).toHaveBeenCalledWith("SymptomIntake");
    });

    it("opens the medication form directly, not the list", async () => {
      // "Add medication" that opened a list you then pressed "Add" on would
      // be two taps for the thing the card names.
      const { navigate } = await renderHomeScreen();

      fireEvent.press(screen.getByText("Add medication"));

      expect(navigate).toHaveBeenCalledWith("MedicationEdit", {});
    });

    it("opens the appointment list", async () => {
      const { navigate } = await renderHomeScreen();

      fireEvent.press(screen.getByText("Upcoming appointments"));

      expect(navigate).toHaveBeenCalledWith("AppointmentList");
    });

    it("opens the More screen, where everything else lives", async () => {
      const { navigate } = await renderHomeScreen();

      fireEvent.press(screen.getByText("More"));

      expect(navigate).toHaveBeenCalledWith("More");
    });

    it("reaches the emergency card in one tap", async () => {
      // Found under stress, so it must never be more than one press from the
      // first screen the app opens on.
      const { navigate } = await renderHomeScreen();

      fireEvent.press(screen.getByText("Emergency card"));

      expect(navigate).toHaveBeenCalledWith("EmergencyCard");
    });
  });

  describe("the inline appointment", () => {
    it("shows the provider and the time exactly as recorded", async () => {
      (listAppointments as jest.Mock).mockResolvedValue([APPOINTMENT]);

      await renderHomeScreen();

      expect(
        await screen.findByText("Dr. Imaginary — Thursday morning")
      ).toBeTruthy();
    });

    it("does not claim to know which appointment is next", async () => {
      // `preferredTime` is free text and there is no scheduled datetime on the
      // record — CLAUDE.md fences adding one. Saying "next" would assert a
      // chronology MedHelp cannot compute.
      (listAppointments as jest.Mock).mockResolvedValue([APPOINTMENT]);

      await renderHomeScreen();

      expect(await screen.findByText("MOST RECENTLY RECORDED")).toBeTruthy();
      expect(screen.queryByText(/^Next:/)).toBeNull();
    });

    it("repeats that nobody was contacted", async () => {
      // The one thing a user must not misread about an appointment in this
      // app, and it is repeated wherever one is shown.
      (listAppointments as jest.Mock).mockResolvedValue([APPOINTMENT]);

      await renderHomeScreen();

      expect(await screen.findByText(/has not contacted anyone/i)).toBeTruthy();
    });

    it("says how many others are waiting", async () => {
      (listAppointments as jest.Mock).mockResolvedValue([
        APPOINTMENT,
        { ...APPOINTMENT, id: "appt-2", providerName: "Dr. Fictitious" },
      ]);

      await renderHomeScreen();

      expect(await screen.findByText(/1 other in your list/i)).toBeTruthy();
    });

    it("ignores appointments the user has finished with", async () => {
      (listAppointments as jest.Mock).mockResolvedValue([
        { ...APPOINTMENT, status: "COMPLETED" as const },
      ]);

      await renderHomeScreen();

      await waitFor(() => expect(listAppointments).toHaveBeenCalled());
      expect(screen.queryByText("MOST RECENTLY RECORDED")).toBeNull();
    });

    it("shows nothing at all when there are no appointments", async () => {
      await renderHomeScreen();

      await waitFor(() => expect(listAppointments).toHaveBeenCalled());
      expect(screen.queryByText("MOST RECENTLY RECORDED")).toBeNull();
    });

    it("stays usable when the appointment request fails", async () => {
      // The home screen's job is to be four things you can press. A red box
      // over a line of supporting detail is not worth it — the appointment
      // list reports its own failures properly when opened.
      (listAppointments as jest.Mock).mockRejectedValue(new Error("offline"));

      await renderHomeScreen();

      await waitFor(() => expect(listAppointments).toHaveBeenCalled());
      expect(screen.getByText("Not feeling well?")).toBeTruthy();
      expect(screen.queryByText("MOST RECENTLY RECORDED")).toBeNull();
    });
  });

  it("still states the app's scope on the way in", async () => {
    await renderHomeScreen();

    expect(screen.getByText(/does not diagnose conditions/i)).toBeTruthy();
  });
});
