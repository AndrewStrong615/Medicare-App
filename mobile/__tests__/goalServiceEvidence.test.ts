/**
 * How a citation crosses the wire, and when it is refused.
 *
 * ⛔ The one rule worth a file of its own: a citation is only rendered with the
 * sentence that stops it reading as an endorsement. A publisher's name under a
 * MedHelp-written row says that publisher approves of the row, and nothing in
 * this feature has been approved by anybody. So a response that carries a
 * quotation without its caveat is mapped to NO citation rather than to a bare
 * one — an older server is a reason to show nothing, never a reason to show
 * half of it.
 */

import { listGoals } from "@/services/goalService";
import { apiRequest } from "@/services/apiClient";

jest.mock("@/services/apiClient", () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

const mockRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const CAVEAT =
  "General guidance about this kind of activity. It is not advice about you, " +
  "your goal, or this plan, and nobody medically qualified checked that it fits.";

function apiGoal(evidence: unknown) {
  return [
    {
      id: "goal-1",
      title: "Walks after lunch",
      description: "I want to walk more",
      created_at: "2026-09-13T00:00:00Z",
      activities: [
        {
          id: "activity-1",
          text: "Walk after lunch",
          cadence: "daily",
          times_per_week: null,
          quantity_text: null,
          preferred_time: "afternoon",
          days: ["monday"],
          time_of_day: "13:00",
          completed_today: false,
          detail: "Put your shoes by the door after breakfast.",
          evidence,
        },
      ],
    },
  ];
}

async function firstActivity(evidence: unknown) {
  mockRequest.mockResolvedValue(apiGoal(evidence) as never);
  const goals = await listGoals("2026-09-13");
  return goals[0].activities[0];
}

beforeEach(() => jest.clearAllMocks());

it("carries a complete citation through", async () => {
  const activity = await firstActivity({
    publisher: "Centers for Disease Control and Prevention",
    document: "Adult Activity: An Overview",
    url: "https://www.cdc.gov/physical-activity-basics/guidelines/adults.html",
    quote: "Adults need 150 minutes of moderate-intensity physical activity a week.",
    caveat: CAVEAT,
  });

  expect(activity.evidence?.publisher).toBe(
    "Centers for Disease Control and Prevention"
  );
  expect(activity.evidence?.quote).toContain("150 minutes");
  expect(activity.evidence?.caveat).toBe(CAVEAT);
  expect(activity.detail).toBe("Put your shoes by the door after breakfast.");
});

it("⛔ refuses a citation that arrived without its caveat", async () => {
  const activity = await firstActivity({
    publisher: "Centers for Disease Control and Prevention",
    document: "Adult Activity: An Overview",
    url: "https://www.cdc.gov/physical-activity-basics/guidelines/adults.html",
    quote: "Adults need 150 minutes of moderate-intensity physical activity a week.",
    caveat: "",
  });

  expect(activity.evidence).toBeNull();
  // The row itself is untouched. Losing an attribution must never lose a plan.
  expect(activity.text).toBe("Walk after lunch");
});

it("⛔ refuses a citation with no link, because nobody could check it", async () => {
  const activity = await firstActivity({
    publisher: "Centers for Disease Control and Prevention",
    document: "Adult Activity: An Overview",
    url: "",
    quote: "Adults need 150 minutes of moderate-intensity physical activity a week.",
    caveat: CAVEAT,
  });

  expect(activity.evidence).toBeNull();
});

it("treats an absent citation as an ordinary row", async () => {
  const activity = await firstActivity(null);

  expect(activity.evidence).toBeNull();
  expect(activity.text).toBe("Walk after lunch");
});
