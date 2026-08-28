import { fireEvent, render, screen } from "@testing-library/react-native";

import { HomeScreen } from "@/screens/HomeScreen";

function renderHomeScreen() {
  const navigate = jest.fn();
  const navigation = { navigate } as any;
  render(<HomeScreen navigation={navigation} route={{} as any} />);
  return { navigate };
}

describe("HomeScreen", () => {
  it("renders the MedHelp title and both action buttons", () => {
    renderHomeScreen();

    expect(screen.getByText("MedHelp")).toBeTruthy();
    expect(screen.getByText("Symptom Lookup")).toBeTruthy();
    expect(screen.getByText("Medication Reminders")).toBeTruthy();
  });

  it("navigates to SymptomLookup when the Symptom Lookup button is pressed", () => {
    const { navigate } = renderHomeScreen();

    fireEvent.press(screen.getByText("Symptom Lookup"));

    expect(navigate).toHaveBeenCalledWith("SymptomLookup");
  });

  it("navigates to MedicationReminders when the Medication Reminders button is pressed", () => {
    const { navigate } = renderHomeScreen();

    fireEvent.press(screen.getByText("Medication Reminders"));

    expect(navigate).toHaveBeenCalledWith("MedicationReminders");
  });
});
