import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SymptomIntakeScreen } from "@/screens/intake/SymptomIntakeScreen";
import { IntakeError, submitIntake } from "@/services/intakeService";

jest.mock("@/services/intakeService", () => {
  const actual = jest.requireActual("@/services/intakeService");
  return { ...actual, submitIntake: jest.fn() };
});

const mockedSubmit = submitIntake as jest.MockedFunction<typeof submitIntake>;

const ASSESSMENT = {
  id: null,
  tier: "SELF_CARE" as const,
  reasoning: "Synthetic reasoning.",
  redFlagMatch: false,
  escalatedBySafetyNet: false,
  emergency: null,
  selfCareTopics: [],
  selfCareSourceNote: null,
  disclaimer: "Not a diagnosis.",
  escalationGuidance: "Call 911 if this may be an emergency.",
};

function renderScreen() {
  const navigate = jest.fn();
  render(<SymptomIntakeScreen navigation={{ navigate } as any} route={{} as any} />);
  return { navigate };
}

async function describeSymptoms(text = "sore throat for two days") {
  fireEvent.changeText(screen.getByLabelText("Describe your symptoms"), text);
  await act(async () => {
    fireEvent.press(screen.getByText("Get an urgency estimate"));
  });
}

describe("SymptomIntakeScreen", () => {
  beforeEach(() => {
    mockedSubmit.mockReset();
  });

  it("shows the disclaimer before anything is submitted", () => {
    renderScreen();

    // Must be visible up front, not revealed after a result.
    expect(screen.getByText("This estimates urgency. It does not diagnose.")).toBeTruthy();
    expect(screen.getByText(/not a substitute for a clinician/i)).toBeTruthy();
  });

  it("offers emergency services before any assessment has run", () => {
    renderScreen();

    expect(screen.getByText("Call 911")).toBeTruthy();
  });

  it("requires a description before calling the API", () => {
    renderScreen();

    fireEvent.press(screen.getByText("Get an urgency estimate"));

    expect(screen.getByText(/describe what's going on/i)).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it("navigates to the result on success", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    const { navigate } = renderScreen();

    await describeSymptoms();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("IntakeResult", { assessment: ASSESSMENT })
    );
  });

  it("does not store the description unless the user opts in", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    renderScreen();

    await describeSymptoms();

    expect(mockedSubmit).toHaveBeenCalledWith("sore throat for two days", false);
  });

  it("passes consent through when the user opts in", async () => {
    mockedSubmit.mockResolvedValueOnce(ASSESSMENT);
    renderScreen();

    fireEvent.press(
      screen.getByLabelText("Save this description so it can be reviewed for accuracy")
    );
    await describeSymptoms();

    expect(mockedSubmit).toHaveBeenCalledWith("sore throat for two days", true);
  });

  it("shows a failure as a failure, never as reassurance", async () => {
    mockedSubmit.mockRejectedValueOnce(
      new IntakeError(
        "We couldn't assess this right now. Contact a healthcare professional, and call 911 if this may be an emergency."
      )
    );
    const { navigate } = renderScreen();

    await describeSymptoms();

    await waitFor(() => expect(screen.getByText(/couldn't assess this/i)).toBeTruthy());
    // Critically: no result screen, so no tier is implied.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not submit twice when the button is pressed twice", () => {
    mockedSubmit.mockReturnValueOnce(new Promise(() => {}));
    renderScreen();

    fireEvent.changeText(screen.getByLabelText("Describe your symptoms"), "headache");
    const button = screen.getByText("Get an urgency estimate");
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockedSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps typing available when dictation is unsupported", () => {
    renderScreen();

    // jsdom has no SpeechRecognition, so this exercises the unsupported path.
    expect(screen.getByText(/dictation isn't available/i)).toBeTruthy();
    expect(screen.getByLabelText("Describe your symptoms")).toBeTruthy();
  });
});
