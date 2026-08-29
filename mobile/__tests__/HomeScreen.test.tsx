import { fireEvent, render, screen } from "@testing-library/react-native";

import { HomeScreen } from "@/screens/HomeScreen";

function renderHomeScreen() {
  const navigate = jest.fn();
  const navigation = { navigate } as any;
  render(<HomeScreen navigation={navigation} route={{} as any} />);
  return { navigate };
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
});
