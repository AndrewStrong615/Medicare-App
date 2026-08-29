import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SymptomLookupScreen } from "@/screens/symptom-lookup/SymptomLookupScreen";
import { SymptomLookupError, searchSymptoms } from "@/services/symptomService";

jest.mock("@/services/symptomService", () => {
  const actual = jest.requireActual("@/services/symptomService");
  return { ...actual, searchSymptoms: jest.fn() };
});

const mockedSearch = searchSymptoms as jest.MockedFunction<typeof searchSymptoms>;

const DISCLAIMER = "General information, not medical advice, not a diagnosis.";
const CARE_GUIDANCE = "Contact a healthcare professional. Call 911 in an emergency.";

const RESULT = {
  query: "sore throat",
  emergency: null,
  results: [
    {
      topicId: "sorethroat",
      title: "Sore Throat",
      summary: "Synthetic summary text.",
      url: "https://medlineplus.gov/sorethroat.html",
      sourceName: "MedlinePlus, US National Library of Medicine",
      groups: ["Symptoms"],
    },
  ],
  careGuidance: CARE_GUIDANCE,
  disclaimer: DISCLAIMER,
};

function renderScreen() {
  const navigate = jest.fn();
  const navigation = { navigate } as any;
  render(<SymptomLookupScreen navigation={navigation} route={{} as any} />);
  return { navigate };
}

async function search(term = "sore throat") {
  fireEvent.changeText(screen.getByLabelText("Search symptoms or conditions"), term);
  // The press starts an async request; letting it settle inside act keeps the
  // resulting state updates from escaping React's test scheduler.
  await act(async () => {
    fireEvent.press(screen.getByText("Search"));
  });
}

describe("SymptomLookupScreen", () => {
  beforeEach(() => {
    mockedSearch.mockReset();
  });

  it("always shows the disclaimer, even before any search", () => {
    renderScreen();

    expect(screen.getByText(/consult a qualified healthcare professional/i)).toBeTruthy();
  });

  it("requires a search term before calling the API", () => {
    renderScreen();

    fireEvent.press(screen.getByText("Search"));

    expect(screen.getByText(/enter a symptom or condition/i)).toBeTruthy();
    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it("shows results with source attribution", async () => {
    mockedSearch.mockResolvedValueOnce(RESULT);
    renderScreen();

    await search();

    await waitFor(() => expect(screen.getByText("Sore Throat")).toBeTruthy());
    expect(screen.getByText(/Health information from MedlinePlus/)).toBeTruthy();
  });

  it("frames topic categories as 'may be associated with', not as a diagnosis", async () => {
    mockedSearch.mockResolvedValueOnce(RESULT);
    renderScreen();

    await search();

    await waitFor(() =>
      expect(screen.getByText(/May be associated with: Symptoms/)).toBeTruthy()
    );
  });

  it("shows the 'when to see a doctor' guidance with results", async () => {
    mockedSearch.mockResolvedValueOnce(RESULT);
    renderScreen();

    await search();

    await waitFor(() => expect(screen.getByText("If you're worried about your symptoms")).toBeTruthy());
    expect(screen.getByText(CARE_GUIDANCE)).toBeTruthy();
  });

  it("shows emergency guidance and a call button for an emergency query", async () => {
    mockedSearch.mockResolvedValueOnce({
      ...RESULT,
      query: "chest pain",
      emergency: {
        category: "cardiac",
        headline: "If you have chest pain, call 911 now.",
        action: "Call 911 or your local emergency number right away.",
        matchedTerms: ["chest pain"],
      },
    });
    renderScreen();

    await search("chest pain");

    await waitFor(() =>
      expect(screen.getByText("If you have chest pain, call 911 now.")).toBeTruthy()
    );
    expect(screen.getByText("Call 911")).toBeTruthy();
  });

  it("offers the 988 crisis line rather than 911 for self-harm searches", async () => {
    mockedSearch.mockResolvedValueOnce({
      ...RESULT,
      query: "suicidal",
      emergency: {
        category: "self_harm",
        headline: "If you are thinking about harming yourself, help is available right now.",
        action: "Call or text 988 in the US, 24 hours a day.",
        matchedTerms: ["suicidal"],
      },
    });
    renderScreen();

    await search("suicidal");

    await waitFor(() => expect(screen.getByText("Call 988")).toBeTruthy());
  });

  it("explains an empty result set and suggests what to do next", async () => {
    mockedSearch.mockResolvedValueOnce({ ...RESULT, query: "zzzz", results: [] });
    renderScreen();

    await search("zzzz");

    await waitFor(() => expect(screen.getByText(/No health topics found/)).toBeTruthy());
    // Still carries safety guidance when there is nothing to show.
    expect(screen.getByText("If you're worried about your symptoms")).toBeTruthy();
  });

  it("offers a retry when the server cannot be reached", async () => {
    mockedSearch.mockRejectedValueOnce(
      new SymptomLookupError("Can't reach the MedHelp server.", { isNetworkError: true })
    );
    renderScreen();

    await search();

    await waitFor(() => expect(screen.getByText("Can't reach the MedHelp server.")).toBeTruthy());
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("does not run a second search while one is in flight", async () => {
    mockedSearch.mockReturnValueOnce(new Promise(() => {}));
    renderScreen();

    fireEvent.changeText(screen.getByLabelText("Search symptoms or conditions"), "sore throat");
    const button = screen.getByText("Search");
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Searching…")).toBeTruthy();
  });

  it("opens the detail screen with the disclaimer and guidance attached", async () => {
    mockedSearch.mockResolvedValueOnce(RESULT);
    const { navigate } = renderScreen();

    await search();
    await waitFor(() => expect(screen.getByText("Sore Throat")).toBeTruthy());
    fireEvent.press(screen.getByText("Sore Throat"));

    expect(navigate).toHaveBeenCalledWith("SymptomDetail", {
      topic: RESULT.results[0],
      careGuidance: CARE_GUIDANCE,
      disclaimer: DISCLAIMER,
      emergency: null,
    });
  });

  it("carries emergency guidance through to the detail screen", async () => {
    // Without this, someone who searched "chest pain" would lose the call-911
    // instruction the moment they opened an article.
    const emergency = {
      category: "cardiac",
      headline: "If you have chest pain, call 911 now.",
      action: "Call 911 right away.",
      matchedTerms: ["chest pain"],
    };
    mockedSearch.mockResolvedValueOnce({ ...RESULT, query: "chest pain", emergency });
    const { navigate } = renderScreen();

    await search("chest pain");
    await waitFor(() => expect(screen.getByText("Sore Throat")).toBeTruthy());
    fireEvent.press(screen.getByText("Sore Throat"));

    expect(navigate).toHaveBeenCalledWith(
      "SymptomDetail",
      expect.objectContaining({ emergency })
    );
  });

  it("tells the user their search is sent to an outside library", () => {
    renderScreen();

    expect(screen.getByText(/searches are sent to the medlineplus/i)).toBeTruthy();
  });
});
