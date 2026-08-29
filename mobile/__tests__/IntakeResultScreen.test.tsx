import { render, screen } from "@testing-library/react-native";

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
    id: "assessment-1",
    tier: "SELF_CARE" as Tier,
    reasoning: "Synthetic reasoning text.",
    redFlagMatch: false,
    escalatedBySafetyNet: false,
    emergency: null,
    selfCareTopics: [],
    selfCareSourceNote: null,
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
      // to act without navigating anywhere.
      renderResult({ tier });

      expect(screen.getByText("Call 911")).toBeTruthy();
    });

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
  });

  describe("URGENT", () => {
    it("points toward booking care but is honest that it does not contact anyone", () => {
      renderResult({ tier: "URGENT" });

      expect(screen.getByText(/does not contact a provider for you/i)).toBeTruthy();
      expect(screen.getByText("Find urgent care nearby")).toBeTruthy();
    });
  });

  describe("SELF_CARE", () => {
    it("shows sourced reading material with attribution", () => {
      renderResult({
        tier: "SELF_CARE",
        selfCareTopics: [
          {
            topicId: "sorethroat",
            title: "Sore Throat",
            summary: "Synthetic summary.",
            url: "https://medlineplus.gov/sorethroat.html",
            sourceName: "MedlinePlus, US National Library of Medicine",
            groups: ["Symptoms"],
          },
        ],
        selfCareSourceNote: "General information from MedlinePlus.",
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
      renderResult({ tier: "EMERGENT", escalatedBySafetyNet: true, redFlagMatch: true });

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
});
