import { fireEvent, render, screen } from "@testing-library/react-native";

import { HomeScreen } from "@/screens/HomeScreen";
import { logout } from "@/services/authService";

jest.mock("@/services/authService", () => ({
  logout: jest.fn(async () => undefined),
}));

function renderHomeScreen() {
  const navigate = jest.fn();
  const reset = jest.fn();
  const navigation = { navigate, reset } as any;
  render(<HomeScreen navigation={navigation} route={{} as any} />);
  return { navigate, reset };
}

describe("HomeScreen", () => {
  it("renders the MedHelp title and the entry points", () => {
    renderHomeScreen();

    expect(screen.getByText("MedHelp")).toBeTruthy();
    expect(screen.getByText("Check my symptoms")).toBeTruthy();
    expect(screen.getByText("My Medications")).toBeTruthy();
    expect(screen.getByText("Medication Reminders")).toBeTruthy();
  });

  it("opens symptom intake from the home screen", () => {
    const { navigate } = renderHomeScreen();

    fireEvent.press(screen.getByText("Check my symptoms"));

    expect(navigate).toHaveBeenCalledWith("SymptomIntake");
  });

  it("navigates to the medication list", () => {
    const { navigate } = renderHomeScreen();

    fireEvent.press(screen.getByText("My Medications"));

    expect(navigate).toHaveBeenCalledWith("MedicationList");
  });

  it("navigates to MedicationReminders", () => {
    const { navigate } = renderHomeScreen();

    fireEvent.press(screen.getByText("Medication Reminders"));

    expect(navigate).toHaveBeenCalledWith("MedicationReminders");
  });

  it("still states the app's scope on the way in", () => {
    renderHomeScreen();

    expect(screen.getByText(/does not diagnose conditions/i)).toBeTruthy();
  });

  it("signs the user out and leaves nothing to go back to", () => {
    // The session survives a reload now, so there has to be a way out of one —
    // and the signed-in screens must not be reachable by swiping back.
    const { reset } = renderHomeScreen();

    fireEvent.press(screen.getByText("Sign out"));

    expect(logout).toHaveBeenCalled();
    expect(reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Login" }] });
  });
});
