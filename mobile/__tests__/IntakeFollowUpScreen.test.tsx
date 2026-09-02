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
  round: 1,
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
  summary: null,
  disclaimer: DISCLAIMER,
  escalationGuidance: "Call 911 if this may be an emergency.",
};

function renderScreen(
  followUp: FollowUpRequest = FOLLOW_UP,
  priorAnswers?: Record<string, string>
) {
  const replace = jest.fn();
  render(
    <IntakeFollowUpScreen
      navigation={{ replace } as any}
      route={
        {
          params: {
            followUp,
            description: "I have been feeling off",
            consent: false,
            priorAnswers,
          },
        } as any
      }
    />
  );
  return { replace };
}

/** A second, different set of questions, as the server would send it. */
const SECOND_ROUND: FollowUpRequest = {
  ...FOLLOW_UP,
  round: 2,
  intro: "Thanks — that helps. A couple more questions.",
  questions: [
    {
      questionId: "onset",
      prompt: "How did it start?",
      kind: "choice",
      choices: ["Suddenly", "Gradually", "I'm not sure"],
      helper: "",
    },
  ],
};

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
    expect(replace).toHaveBeenCalledWith("IntakeResult", {
      assessment: ASSESSMENT,
      // As above: what the user wrote travels with the result.
      description: "I have been feeling off",
    });
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

  it("moves on to a second, different set rather than giving up", async () => {
    // The complaint this answers: answering the first four and still being
    // told "we could not tell what you are describing" is a dead end.
    submitIntakeMock.mockResolvedValue(SECOND_ROUND);
    const { replace } = renderScreen();

    answerEverything();
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("IntakeFollowUp", {
        followUp: SECOND_ROUND,
        description: "I have been feeling off",
        consent: false,
        // Round one's answers travel with it, so the server sees the whole
        // picture and can tell which round this is.
        priorAnswers: { location: "my lower back", duration: "Started today" },
      });
    });
  });

  it("sends every earlier answer up with the new ones", async () => {
    submitIntakeMock.mockResolvedValue(ASSESSMENT);
    renderScreen(SECOND_ROUND, { location: "my lower back", duration: "Started today" });

    fireEvent.press(screen.getByText("Gradually"));
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(submitIntakeMock).toHaveBeenCalledWith("I have been feeling off", false, {
        location: "my lower back",
        duration: "Started today",
        onset: "Gradually",
      });
    });
  });

  it("refuses to loop when the round does not advance", async () => {
    // Defensive: the server decides when to stop, but a round number that did
    // not move would mean the same questions again, which is the one thing
    // this screen must never do.
    submitIntakeMock.mockResolvedValue({ ...FOLLOW_UP, round: 1 });
    const { replace } = renderScreen();

    answerEverything();
    fireEvent.press(screen.getByText("Continue"));

    await waitFor(() => {
      expect(screen.getByText(/still couldn't make sense of this/i)).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("names the round so a second set does not read as a repeat", () => {
    renderScreen(SECOND_ROUND, { location: "my lower back" });

    expect(screen.getByText("STEP 2 OF 2")).toBeTruthy();
    expect(screen.getByText("Just a couple more")).toBeTruthy();
  });
});
