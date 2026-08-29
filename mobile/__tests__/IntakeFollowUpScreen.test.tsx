import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { IntakeFollowUpScreen } from "@/screens/intake/IntakeFollowUpScreen";
import { submitIntake } from "@/services/intakeService";
import type { FollowUpRequest } from "@/services/intakeService";

jest.mock("@/services/intakeService", () => ({
  ...jest.requireActual("@/services/intakeService"),
  submitIntake: jest.fn(),
}));

const submitIntakeMock = submitIntake as jest.MockedFunction<typeof submitIntake>;

const DISCLAIMER = "This is an estimate of how soon you may need care. Not a diagnosis.";

const FOLLOW_UP: FollowUpRequest = {
  status: "needs_detail",
  intro: "MedHelp couldn't tell what you're describing. You can call 911 at any point.",
  questions: [
    {
      questionId: "location",
      prompt: "Where in your body do you feel it?",
      kind: "text",
      choices: [],
      helper: "Even roughly.",
    },
    {
      questionId: "duration",
      prompt: "How long has this been going on?",
      kind: "choice",
      choices: ["Started today", "A few days"],
      helper: "",
    },
  ],
  disclaimer: DISCLAIMER,
  escalationGuidance: "Call 911 if this may be an emergency.",
};

const ASSESSMENT = {
  status: "assessed" as const,
  id: null,
  tier: "URGENT" as const,
  reasoning: "Synthetic reasoning.",
  redFlagMatch: false,
  escalatedBySafetyNet: false,
  emergency: null,
  relatedTopics: [],
  topicsSourceNote: null,
  topicsDisabled: false,
  disclaimer: DISCLAIMER,
  escalationGuidance: "Call 911 if this may be an emergency.",
};

function renderScreen(followUp: FollowUpRequest = FOLLOW_UP) {
  const replace = jest.fn();
  render(
    <IntakeFollowUpScreen
      navigation={{ replace } as any}
      route={
        {
          params: { followUp, description: "I have been feeling off", consent: false },
        } as any
      }
    />
  );
  return { replace };
}

function answerEverything() {
  fireEvent.changeText(
    screen.getByLabelText(/Where in your body/i),
    "my lower back"
  );
  fireEvent.press(screen.getByText("Started today"));
}

describe("IntakeFollowUpScreen", () => {
  beforeEach(() => {
    submitIntakeMock.mockReset();
  });

  it("keeps emergency services one tap away while it asks", () => {
    // Answering is required for a tier. Nothing is required to call for help.
    renderScreen();

    expect(screen.getByText("Call 911")).toBeTruthy();
  });

  it("renders every question the server sent", () => {
    renderScreen();

    expect(screen.getByText("Where in your body do you feel it?")).toBeTruthy();
    expect(screen.getByText("How long has this been going on?")).toBeTruthy();
    expect(screen.getByText("Started today")).toBeTruthy();
  });

  it("says why it is asking", () => {
    renderScreen();

    expect(screen.getByText(FOLLOW_UP.intro)).toBeTruthy();
  });

  it("carries the disclaimer, because this screen is part of the flow", () => {
    renderScreen();

    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it("will not continue until every question is answered", async () => {
    renderScreen();

    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(screen.getAllByText("Please answer this to continue.").length).toBe(2);
    });
    expect(submitIntakeMock).not.toHaveBeenCalled();
  });

  it("submits the answers alongside the original description", async () => {
    submitIntakeMock.mockResolvedValue(ASSESSMENT);
    const { replace } = renderScreen();

    answerEverything();
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(submitIntakeMock).toHaveBeenCalledWith("I have been feeling off", false, {
        location: "my lower back",
        duration: "Started today",
      });
    });
    expect(replace).toHaveBeenCalledWith("IntakeResult", { assessment: ASSESSMENT });
  });

  it("does not loop the user through the same questions again", async () => {
    // The server does not ask twice; if it somehow does, that is a failure
    // with a route to real care, not another round of the form.
    submitIntakeMock.mockResolvedValue(FOLLOW_UP);
    const { replace } = renderScreen();

    answerEverything();
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(screen.getByText(/still couldn't make sense of this/i)).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
