import {
  SymptomLookupError,
  searchSymptoms,
} from "@/services/symptomService";

function okResponse(body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => body });
}

function errorResponse(body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => body });
}

const VALID_PAYLOAD = {
  query: "sore throat",
  emergency: null,
  results: [
    {
      topic_id: "sorethroat",
      title: "Sore Throat",
      summary: "Synthetic summary text.",
      url: "https://medlineplus.gov/sorethroat.html",
      source_name: "MedlinePlus, US National Library of Medicine",
      groups: ["Symptoms"],
    },
  ],
  care_guidance: "Contact a healthcare professional. Call 911 in an emergency.",
  disclaimer: "General information, not medical advice, not a diagnosis.",
};

describe("searchSymptoms", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("maps the API response into camelCase results", async () => {
    okResponse(VALID_PAYLOAD);

    const result = await searchSymptoms("sore throat");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      topicId: "sorethroat",
      title: "Sore Throat",
      summary: "Synthetic summary text.",
      url: "https://medlineplus.gov/sorethroat.html",
      sourceName: "MedlinePlus, US National Library of Medicine",
      groups: ["Symptoms"],
    });
    expect(result.emergency).toBeNull();
  });

  it("url-encodes the query", async () => {
    okResponse(VALID_PAYLOAD);

    await searchSymptoms("sore throat & fever");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=sore%20throat%20%26%20fever")
    );
  });

  it("carries emergency guidance through when present", async () => {
    okResponse({
      ...VALID_PAYLOAD,
      emergency: {
        category: "cardiac",
        headline: "If you have chest pain, call 911 now.",
        action: "Call 911 right away.",
        matched_terms: ["chest pain"],
      },
    });

    const result = await searchSymptoms("chest pain");

    expect(result.emergency).toEqual({
      category: "cardiac",
      headline: "If you have chest pain, call 911 now.",
      action: "Call 911 right away.",
      matchedTerms: ["chest pain"],
    });
  });

  it("refuses a response missing the disclaimer", async () => {
    // Rendering sourced medical content without its disclaimer would breach
    // the rule in CLAUDE.md, so an incomplete payload is treated as a failure.
    const { disclaimer, ...withoutDisclaimer } = VALID_PAYLOAD;
    okResponse(withoutDisclaimer);

    await expect(searchSymptoms("sore throat")).rejects.toBeInstanceOf(SymptomLookupError);
  });

  it("refuses a response missing care guidance", async () => {
    const { care_guidance, ...withoutGuidance } = VALID_PAYLOAD;
    okResponse(withoutGuidance);

    await expect(searchSymptoms("sore throat")).rejects.toBeInstanceOf(SymptomLookupError);
  });

  it("reports an unreachable server as a network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = await searchSymptoms("sore throat").catch((e) => e);

    expect(error).toBeInstanceOf(SymptomLookupError);
    expect(error.isNetworkError).toBe(true);
  });

  it("surfaces the server's explanation when the source is unavailable", async () => {
    errorResponse({ detail: "We couldn't reach the health information library just now." });

    await expect(searchSymptoms("sore throat")).rejects.toThrow(
      /couldn't reach the health information library/i
    );
  });

  it("handles an empty result list", async () => {
    okResponse({ ...VALID_PAYLOAD, results: [] });

    const result = await searchSymptoms("zzzz");

    expect(result.results).toEqual([]);
    expect(result.disclaimer).toBeTruthy();
  });
});
