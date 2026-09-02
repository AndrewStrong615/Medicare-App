import { getToken, logout } from "@/services/authService";
import { IntakeError, submitIntake } from "@/services/intakeService";

jest.mock("@/services/authService", () => ({
  getToken: jest.fn(),
  logout: jest.fn(async () => undefined),
}));

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

const VALID_ASSESSED_BODY = {
  status: "assessed",
  id: "assessment-1",
  tier: "SELF_CARE",
  reasoning: "Placeholder reasoning text for a synthetic test fixture.",
  red_flag_match: false,
  escalated_by_safety_net: false,
  emergency: {
    category: "cardiac",
    headline: "Placeholder headline",
    action: "Placeholder action",
    matched_terms: ["placeholder term"],
  },
  related_topics: [
    {
      topic_id: "topic-1",
      title: "Placeholder Topic",
      summary: "Placeholder summary text.",
      url: "https://example.invalid/topic-1",
      source_name: "Placeholder Source",
      groups: ["placeholder-group"],
    },
  ],
  topics_source_note: "Placeholder source note.",
  topics_disabled: false,
  disclaimer: "Placeholder disclaimer text.",
  escalation_guidance: "Placeholder escalation guidance text.",
};

const VALID_NEEDS_DETAIL_BODY = {
  status: "needs_detail",
  intro: "Placeholder intro text.",
  questions: [
    {
      question_id: "q1",
      prompt: "Placeholder prompt with choices?",
      kind: "choice",
      choices: ["Option A", "Option B"],
      helper: "Placeholder helper text.",
    },
    {
      question_id: "q2",
      prompt: "Placeholder prompt without extras?",
    },
  ],
  disclaimer: "Placeholder disclaimer text.",
  escalation_guidance: "Placeholder escalation guidance text.",
};

function respond(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("intakeService", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockedGetToken.mockReturnValue("fake-token");
  });

  // assertSecureBaseUrl's throw path (non-dev + non-https base URL) is not
  // covered here. API_BASE_URL is captured at module load and __DEV__ is
  // true under jest-expo, so reaching that branch would need
  // jest.resetModules() plus a global __DEV__ override applied before the
  // module is imported. medicationService.test.ts has the same gap.
  describe("submitIntake", () => {
    it.each(["disclaimer", "escalation_guidance", "tier"])(
      "rejects an assessed result missing %s",
      async (field) => {
        const body = { ...VALID_ASSESSED_BODY } as Record<string, unknown>;
        delete body[field];
        respond(200, body);

        await expect(submitIntake("placeholder description", false)).rejects.toThrow(
          /couldn't load this result safely/i
        );
      }
    );

    it.each(["disclaimer", "escalation_guidance", "questions"])(
      "rejects a needs_detail result missing %s",
      async (field) => {
        const body = { ...VALID_NEEDS_DETAIL_BODY } as Record<string, unknown>;
        delete body[field];
        respond(200, body);

        await expect(submitIntake("placeholder description", false)).rejects.toThrow(
          /couldn't load this safely/i
        );
      }
    );

    it("rejects a needs_detail result when questions is not an array", async () => {
      respond(200, { ...VALID_NEEDS_DETAIL_BODY, questions: "not-an-array" });

      await expect(submitIntake("placeholder description", false)).rejects.toThrow(
        /couldn't load this safely/i
      );
    });

    it("discriminates needs_detail before checking for a tier, resolving even with no tier at all", async () => {
      const body = { ...VALID_NEEDS_DETAIL_BODY } as Record<string, unknown>;
      expect(body.tier).toBeUndefined();
      respond(200, body);

      const result = await submitIntake("placeholder description", false);

      expect(result).toEqual({
        status: "needs_detail",
        // Defaults to the first round when the server does not say.
        round: 1,
        intro: "Placeholder intro text.",
        questions: [
          {
            questionId: "q1",
            prompt: "Placeholder prompt with choices?",
            kind: "choice",
            choices: ["Option A", "Option B"],
            helper: "Placeholder helper text.",
          },
          {
            questionId: "q2",
            prompt: "Placeholder prompt without extras?",
            kind: "text",
            choices: [],
            helper: "",
          },
        ],
        disclaimer: "Placeholder disclaimer text.",
        escalationGuidance: "Placeholder escalation guidance text.",
      });
    });

    it("maps the full assessed payload from snake_case to camelCase", async () => {
      respond(200, VALID_ASSESSED_BODY);

      const result = await submitIntake("placeholder description", true);

      expect(result).toEqual({
        status: "assessed",
        id: "assessment-1",
        tier: "SELF_CARE",
        reasoning: "Placeholder reasoning text for a synthetic test fixture.",
        redFlagMatch: false,
        escalatedBySafetyNet: false,
        emergency: {
          category: "cardiac",
          headline: "Placeholder headline",
          action: "Placeholder action",
          matchedTerms: ["placeholder term"],
        },
        relatedTopics: [
          {
            topicId: "topic-1",
            title: "Placeholder Topic",
            summary: "Placeholder summary text.",
            url: "https://example.invalid/topic-1",
            sourceName: "Placeholder Source",
            groups: ["placeholder-group"],
          },
        ],
        topicsSourceNote: "Placeholder source note.",
        topicsDisabled: false,
        summary: null,
        disclaimer: "Placeholder disclaimer text.",
        escalationGuidance: "Placeholder escalation guidance text.",
      });
    });

    it("preserves a null emergency field rather than substituting a value", async () => {
      respond(200, { ...VALID_ASSESSED_BODY, emergency: null });

      const result = await submitIntake("placeholder description", true);

      expect(result).toMatchObject({ emergency: null });
    });

    it("omits follow_up_answers from the request body when not provided", async () => {
      respond(200, VALID_ASSESSED_BODY);

      await submitIntake("placeholder description", false);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const sentBody = JSON.parse(init.body);
      expect(sentBody).not.toHaveProperty("follow_up_answers");
    });

    it("includes follow_up_answers in the request body when provided", async () => {
      respond(200, VALID_ASSESSED_BODY);

      await submitIntake("placeholder description", false, { q1: "Option A" });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const sentBody = JSON.parse(init.body);
      expect(sentBody.follow_up_answers).toEqual({ q1: "Option A" });
    });

    it("reports an expired session distinctly so the app can send the user to sign in", async () => {
      respond(401, { detail: "Sign in to continue." });

      const error = await submitIntake("placeholder description", false).catch((e) => e);

      expect(error).toBeInstanceOf(IntakeError);
      expect(error.isAuthError).toBe(true);
      expect(error.message).toMatch(/session has expired/i);
      // The refused token is dropped, so a reload does not restore a dead
      // session and land the user back on a screen that cannot load.
      expect(logout).toHaveBeenCalled();
    });

    it("reports an unreachable server as a network error with the offline message", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError("Failed to fetch"));

      const error = await submitIntake("placeholder description", false).catch((e) => e);

      expect(error.isNetworkError).toBe(true);
      expect(error.message).toBe(
        "Can't reach the MedHelp server, so we couldn't assess this. If you feel unwell, contact a healthcare professional — and call 911 or your local emergency number if this may be an emergency."
      );
    });

    it("refuses to call the API when there is no token", async () => {
      mockedGetToken.mockReturnValue(null);

      const error = await submitIntake("placeholder description", false).catch((e) => e);

      expect(error).toBeInstanceOf(IntakeError);
      expect(error.isAuthError).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("strips Pydantic's 'Value error, ' prefix from a validation message", async () => {
      respond(422, {
        detail: [{ msg: "Value error, Enter a description.", loc: ["body", "description"] }],
      });

      await expect(submitIntake("", false)).rejects.toThrow("Enter a description.");
    });
  });
});
