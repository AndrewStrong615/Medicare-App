/**
 * Tests for the More screen.
 *
 * This screen exists so consolidating the home screen was a move rather than
 * a removal, so what is tested is coverage: every destination that came off
 * the home screen is reachable from here, in one tap, by name.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";

import { MoreScreen } from "@/screens/MoreScreen";
import { logout } from "@/services/authService";

jest.mock("@/services/authService", () => ({
  logout: jest.fn(async () => undefined),
}));

function renderMoreScreen() {
  const navigate = jest.fn();
  const reset = jest.fn();
  render(<MoreScreen navigation={{ navigate, reset } as any} route={{} as any} />);
  return { navigate, reset };
}

describe("MoreScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("everything the home screen no longer shows", () => {
    it.each([
      ["My medications", "MedicationList"],
      ["Medication reminders", "MedicationReminders"],
      ["All appointments", "AppointmentList"],
      ["Find a provider", "ProviderSearch"],
    ])("reaches %s in one tap", (label, route) => {
      const { navigate } = renderMoreScreen();

      fireEvent.press(screen.getByText(label));

      expect(navigate).toHaveBeenCalledWith(route);
    });
  });

  describe("the emergency card", () => {
    it("is repeated here rather than moved off the home screen", () => {
      // Someone on this screen looking for it should not have to go back.
      const { navigate } = renderMoreScreen();

      fireEvent.press(screen.getByText("Emergency card"));

      expect(navigate).toHaveBeenCalledWith("EmergencyCard");
    });

    it("can be edited from here", () => {
      const { navigate } = renderMoreScreen();

      fireEvent.press(screen.getByText("Edit my emergency card"));

      expect(navigate).toHaveBeenCalledWith("EmergencyCardEdit");
    });
  });

  describe("signing out", () => {
    it("ends the session and leaves nothing to go back to", () => {
      // The signed-in screens must not be reachable by swiping back — they
      // would fail one request at a time instead of saying what happened.
      const { reset } = renderMoreScreen();

      fireEvent.press(screen.getByText("Sign out"));

      expect(logout).toHaveBeenCalled();
      expect(reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Login" }] });
    });

    it("says the emergency card is not cleared with the session", () => {
      // It is stored separately and deliberately outlives a session, which is
      // a surprise worth naming on a shared computer.
      renderMoreScreen();

      expect(screen.getByText(/emergency card stays on it/i)).toBeTruthy();
    });
  });

  it("carries the scope statements that came off the home screen", () => {
    renderMoreScreen();

    expect(screen.getByText("HOW MEDHELP WORKS")).toBeTruthy();
    expect(screen.getByText("WHERE YOUR INFORMATION GOES")).toBeTruthy();
    expect(screen.getByText(/not been reviewed by a clinician/i)).toBeTruthy();
  });
});
