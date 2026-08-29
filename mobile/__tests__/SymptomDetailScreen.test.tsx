import { render, screen } from "@testing-library/react-native";

import { SymptomDetailScreen } from "@/screens/symptom-lookup/SymptomDetailScreen";

const DISCLAIMER = "General information, not medical advice, not a diagnosis.";
const CARE_GUIDANCE = "Contact a healthcare professional. Call 911 in an emergency.";

const TOPIC = {
  topicId: "sorethroat",
  title: "Sore Throat",
  summary: "Synthetic summary text from the source, rendered verbatim.",
  url: "https://medlineplus.gov/sorethroat.html",
  sourceName: "MedlinePlus, US National Library of Medicine",
  groups: ["Symptoms", "Ear, Nose and Throat"],
};

const EMERGENCY = {
  category: "cardiac",
  headline: "If you have chest pain, call 911 now.",
  action: "Call 911 or your local emergency number right away.",
  matchedTerms: ["chest pain"],
};

function renderDetail(
  overrides: Partial<typeof TOPIC> = {},
  emergency: typeof EMERGENCY | null = null
) {
  render(
    <SymptomDetailScreen
      navigation={{} as any}
      route={
        {
          params: {
            topic: { ...TOPIC, ...overrides },
            careGuidance: CARE_GUIDANCE,
            disclaimer: DISCLAIMER,
            emergency,
          },
        } as any
      }
    />
  );
}

describe("SymptomDetailScreen", () => {
  it("shows the topic title and the source's summary verbatim", () => {
    renderDetail();

    expect(screen.getByText("Sore Throat")).toBeTruthy();
    expect(screen.getByText(TOPIC.summary)).toBeTruthy();
  });

  it("shows the standing disclaimer banner", () => {
    renderDetail();

    expect(screen.getByText(/consult a qualified healthcare professional/i)).toBeTruthy();
  });

  it("shows the per-result disclaimer text passed from the search", () => {
    renderDetail();

    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it("shows the care guidance section", () => {
    renderDetail();

    expect(screen.getByText("If you're worried about your symptoms")).toBeTruthy();
    expect(screen.getByText(CARE_GUIDANCE)).toBeTruthy();
  });

  it("keeps emergency guidance visible after navigating in from a search", () => {
    // Someone who searched "chest pain" and tapped a topic must not lose the
    // instruction to call for help.
    renderDetail({}, EMERGENCY);

    expect(screen.getByText(EMERGENCY.headline)).toBeTruthy();
    expect(screen.getByText("Call 911")).toBeTruthy();
  });

  it("shows no emergency banner for an ordinary topic", () => {
    renderDetail({}, null);

    expect(screen.queryByText(/call 911 now/i)).toBeNull();
  });

  it("frames categories as 'may be associated with'", () => {
    renderDetail();

    expect(
      screen.getByText("May be associated with: Symptoms, Ear, Nose and Throat")
    ).toBeTruthy();
  });

  it("credits the source and links to the full article", () => {
    renderDetail();

    expect(screen.getByText(/Source: MedlinePlus/)).toBeTruthy();
    expect(screen.getByText(TOPIC.url)).toBeTruthy();
  });

  it("omits the association line when the topic has no categories", () => {
    renderDetail({ groups: [] });

    expect(screen.queryByText(/May be associated with/)).toBeNull();
  });
});
