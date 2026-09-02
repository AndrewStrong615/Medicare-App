import { fireEvent, render, screen } from "@testing-library/react-native";

import { IntakeResultScreen } from "@/screens/intake/IntakeResultScreen";
import type { IntakeAssessment, Tier } from "@/services/intakeService";

jest.mock("@/services/intakeService", () => ({
  ...jest.requireActual("@/services/intakeService"),
  reportAssessmentWrong: jest.fn(),
}));

const DISCLAIMER =
  "This is an estimate of how soon you may need care. It is not a diagnosis and not medical advice. It is a suggestion, not a determination.";
const ESCALATION =
  "If your symptoms change, get worse, or you become worried at any point, do not wait for this app. Call 911.";

function assessment(overrides: Partial<IntakeAssessment> = {}): IntakeAssessment {
  return {
    status: "assessed",
    id: "assessment-1",
    tier: "SELF_CARE" as Tier,
    reasoning: "Synthetic reasoning text.",
    redFlagMatch: false,
    escalatedBySafetyNet: false,
    emergency: null,
    relatedTopics: [],
    topicsSourceNote: null,
    topicsDisabled: false,
    summary: null,
    disclaimer: DISCLAIMER,
    escalationGuidance: ESCALATION,
    ...overrides,
  };
}

function renderResult(overrides: Partial<IntakeAssessment> = {}) {
  const navigate = jest.fn();
  render(
    <IntakeResultScreen
      navigation={{ navigate } as any}
      route={{ params: { assessment: assessment(overrides) } } as any}
    />
  );
  return { navigate };
}

describe("IntakeResultScreen", () => {
  describe.each<Tier>(["EMERGENT", "URGENT", "SELF_CARE"])("on every tier (%s)", (tier) => {
    it("offers a way to call emergency services", () => {
      // The classification is a suggestion; a user who disagrees must be able
      // to act without navigating anywhere. This one holds on EMERGENT too —
      // it is the whole point of that screen.
      renderResult({ tier });

      expect(screen.getByText("Call 911")).toBeTruthy();
    });
  });

  // Everything below the call path is prose, and on EMERGENT prose competes
  // with the dial button. These hold on the tiers whose reader has time.
  describe.each<Tier>(["URGENT", "SELF_CARE"])("on unhurried tiers (%s)", (tier) => {
    it("states that this is not a diagnosis", () => {
      renderResult({ tier });

      expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    });

    it("shows the escalation path", () => {
      renderResult({ tier });

      expect(screen.getByText("If this changes or gets worse")).toBeTruthy();
      expect(screen.getByText(ESCALATION)).toBeTruthy();
    });

    it("shows the reasoning", () => {
      renderResult({ tier });

      expect(screen.getByText("Synthetic reasoning text.")).toBeTruthy();
    });
  });

  describe("EMERGENT", () => {
    it("shows the alert and a way to find an emergency room without further navigation", () => {
      renderResult({
        tier: "EMERGENT",
        emergency: {
          category: "cardiac",
          headline: "If you have chest pain, call 911 now.",
          action: "Call 911 or your local emergency number right away.",
          matchedTerms: ["chest pain"],
        },
      });

      expect(screen.getByText("If you have chest pain, call 911 now.")).toBeTruthy();
      expect(screen.getByText("Find the nearest emergency room")).toBeTruthy();
    });

    it("falls back to generic emergency copy when no red-flag guidance came back", () => {
      // Model-assigned EMERGENT with no keyword match still needs a full alert.
      renderResult({ tier: "EMERGENT", emergency: null });

      expect(screen.getByText("Get emergency care now.")).toBeTruthy();
      expect(screen.getByText("Find the nearest emergency room")).toBeTruthy();
    });

    it("leads with the alert and nothing else to read", () => {
      // In an emergency every extra paragraph sits between the user and the
      // dial button, so the explanatory copy starts collapsed.
      renderResult({ tier: "EMERGENT" });

      expect(screen.queryByText("Synthetic reasoning text.")).toBeNull();
      expect(screen.queryByText(DISCLAIMER)).toBeNull();
      expect(screen.queryByText("If this changes or gets worse")).toBeNull();
      expect(screen.queryByText("Urgent — be seen soon")).toBeNull();
    });

    it("keeps the explanation and the disclaimer one tap away", () => {
      // Demoted, not deleted.
      renderResult({ tier: "EMERGENT" });

      fireEvent.press(screen.getByText("Why am I seeing this?"));

      expect(screen.getByText("Synthetic reasoning text.")).toBeTruthy();
      expect(screen.getByText(DISCLAIMER)).toBeTruthy();
      expect(screen.getByText("This doesn't seem right")).toBeTruthy();
    });

    it("does not bury health topics behind the alert", () => {
      // Reading material is not fetched on this tier at all.
      renderResult({ tier: "EMERGENT" });

      expect(screen.queryByText("General information")).toBeNull();
    });
  });

  describe("URGENT", () => {
    it("points toward booking care but is honest that it does not contact anyone", () => {
      renderResult({ tier: "URGENT" });

      expect(screen.getByText(/cannot make the appointment for you/i)).toBeTruthy();
      expect(screen.getByText(/does not send anything to a clinic/i)).toBeTruthy();
      expect(screen.getByText("Find a provider")).toBeTruthy();
    });

    it("keeps the provider search inside the app", () => {
      // The old behaviour handed the user to their maps app. Leaving MedHelp
      // at the point someone has been told to be seen soon drops them into a
      // search page of ads and unrelated listings.
      const { navigate } = renderResult({ tier: "URGENT" });

      fireEvent.press(screen.getByText("Find a provider"));

      expect(navigate).toHaveBeenCalledWith("ProviderSearch", expect.anything());
    });

    it("carries the description forward so it is not typed twice", () => {
      const navigate = jest.fn();
      render(
        <IntakeResultScreen
          navigation={{ navigate } as any}
          route={
            {
              params: {
                assessment: assessment({ tier: "URGENT" }),
                description: "Sore throat and a fever since Tuesday.",
              },
            } as any
          }
        />
      );

      fireEvent.press(screen.getByText("Find a provider"));

      expect(navigate).toHaveBeenCalledWith("ProviderSearch", {
        intake: {
          reasonForVisit: "Sore throat and a fever since Tuesday.",
          tier: "URGENT",
          assessmentId: "assessment-1",
        },
      });
    });

    it("also gives the user something to read, not just an instruction to go", () => {
      renderResult({
        tier: "URGENT",
        relatedTopics: [
          {
            topicId: "ankleinjuries",
            title: "Ankle Injuries and Disorders",
            summary: "Synthetic summary.",
            url: "https://medlineplus.gov/ankleinjuriesanddisorders.html",
            sourceName: "MedlinePlus, US National Library of Medicine",
            groups: ["Bones, Joints and Muscles"],
          },
        ],
        topicsSourceNote: "General information from MedlinePlus.",
      });

      expect(screen.getByText("Ankle Injuries and Disorders")).toBeTruthy();
      // The source's own categories, framed as association rather than as a
      // claim about this user.
      expect(screen.getByText(/May be associated with/i)).toBeTruthy();
    });

    it("says why the section is empty rather than filling it in", () => {
      renderResult({ tier: "URGENT", relatedTopics: [] });

      expect(screen.getByText(/won't write its own/i)).toBeTruthy();
    });

    it("hides the section entirely while the feature is gated off", () => {
      // Not the same as finding nothing. Saying "we couldn't find a topic
      // matching what you described" would be a lie when no lookup was made.
      renderResult({ tier: "URGENT", relatedTopics: [], topicsDisabled: true });

      expect(screen.queryByText("General information")).toBeNull();
      expect(screen.queryByText(/won't write its own/i)).toBeNull();
    });
  });

  describe("SELF_CARE", () => {
    it("shows sourced reading material with attribution", () => {
      renderResult({
        tier: "SELF_CARE",
        relatedTopics: [
          {
            topicId: "sorethroat",
            title: "Sore Throat",
            summary: "Synthetic summary.",
            url: "https://medlineplus.gov/sorethroat.html",
            sourceName: "MedlinePlus, US National Library of Medicine",
            groups: ["Symptoms"],
          },
        ],
        topicsSourceNote: "General information from MedlinePlus.",
      });

      expect(screen.getByText("Sore Throat")).toBeTruthy();
      expect(screen.getByText("General information from MedlinePlus.")).toBeTruthy();
    });

    it("still shows emergency access, because the user may disagree", () => {
      renderResult({ tier: "SELF_CARE" });

      expect(screen.getByText("Call 911")).toBeTruthy();
    });
  });

  describe("safety-net escalation", () => {
    it("tells the user when the estimate was raised", () => {
      renderResult({ tier: "URGENT", escalatedBySafetyNet: true, redFlagMatch: true });

      expect(screen.getByText(/raised this to a more urgent level/i)).toBeTruthy();
    });

    it("says nothing about escalation when none happened", () => {
      renderResult({ tier: "SELF_CARE", escalatedBySafetyNet: false });

      expect(screen.queryByText(/raised this to a more urgent level/i)).toBeNull();
    });
  });

  it("lets the user report the estimate as wrong", () => {
    renderResult();

    expect(screen.getByText("This doesn't seem right")).toBeTruthy();
  });

  describe("the recap of what the answers said", () => {
    const SUMMARY = {
      understood: [
        { label: "Where", value: "my lower back" },
        { label: "How long", value: "A few days" },
      ],
      unclear: ["How bad, out of 10"],
    };

    it("repeats the user's own words back, verbatim", () => {
      renderResult({ tier: "URGENT", summary: SUMMARY });

      expect(screen.getByText("What you told us")).toBeTruthy();
      expect(screen.getByText("my lower back")).toBeTruthy();
      expect(screen.getByText("A few days")).toBeTruthy();
    });

    it("says what it still does not know, which is why the estimate is cautious", () => {
      renderResult({ tier: "URGENT", summary: SUMMARY });

      expect(screen.getByText(/still unknown: how bad, out of 10/i)).toBeTruthy();
    });

    it("shows nothing when no questions were answered", () => {
      renderResult({ tier: "URGENT", summary: null });

      expect(screen.queryByText("What you told us")).toBeNull();
    });

    it("stays off the emergency screen", () => {
      // That tier has one job. Every extra block is another thing between the
      // reader and the dial button.
      renderResult({ tier: "EMERGENT", summary: SUMMARY });

      expect(screen.queryByText("What you told us")).toBeNull();
    });
  });
});
