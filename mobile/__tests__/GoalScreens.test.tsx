import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { GoalCreateScreen } from "@/screens/goals/GoalCreateScreen";
import { HealthGoalsScreen } from "@/screens/goals/HealthGoalsScreen";
import {
  createGoal,
  deleteGoal,
  draftGoal,
  listGoals,
  setCompletion,
  type GoalDraft,
  type HealthGoal,
} from "@/services/goalService";

jest.mock("@/services/goalService", () => ({
  ...jest.requireActual("@/services/goalService"),
  draftGoal: jest.fn(),
  createGoal: jest.fn(),
  listGoals: jest.fn(),
  setCompletion: jest.fn(),
  deleteGoal: jest.fn(),
}));

// Same stand-in as the appointment list test — see the note there.
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

const mockDraft = draftGoal as jest.MockedFunction<typeof draftGoal>;
const mockCreate = createGoal as jest.MockedFunction<typeof createGoal>;
const mockList = listGoals as jest.MockedFunction<typeof listGoals>;
const mockComplete = setCompletion as jest.MockedFunction<typeof setCompletion>;
const mockDelete = deleteGoal as jest.MockedFunction<typeof deleteGoal>;

const navigation = {
  navigate: jest.fn(),
  reset: jest.fn(),
  goBack: jest.fn(),
};

function emptyDraft(overrides: Partial<GoalDraft> = {}): GoalDraft {
  return { title: null, activities: [], notice: null, emergency: null, ...overrides };
}

function goal(overrides: Partial<HealthGoal> = {}): HealthGoal {
  return {
    id: "goal-1",
    title: "Getting outdoors",
    description: "walk in the mornings",
    createdAt: "2026-09-07T00:00:00Z",
    activities: [
      {
        id: "activity-1",
        text: "Walk in the mornings",
        cadence: "daily",
        timesPerWeek: null,
        quantityText: null,
        preferredTime: "morning",
        completedToday: false,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GoalCreateScreen", () => {
  it("proposes without saving", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({
        title: "Getting outdoors",
        activities: [
          {
            text: "Walk in the mornings",
            sourcePhrase: "walk in the mornings",
            cadence: "daily",
            timesPerWeek: null,
            quantityText: null,
            preferredTime: "morning",
            generated: false,
          },
        ],
      })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(
      screen.getByLabelText(/What do you plan to do/i),
      "walk in the mornings"
    );
    fireEvent.press(screen.getByText("Suggest activities"));

    await waitFor(() => expect(mockDraft).toHaveBeenCalledWith("walk in the mornings"));
    // The proposal is on screen, and nothing has been written.
    expect(screen.getByDisplayValue("Walk in the mornings")).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows which of the person's words each row came from", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({
        title: "Getting outdoors",
        activities: [
          {
            text: "Walk in the mornings",
            sourcePhrase: "walk in the mornings",
            cadence: "daily",
            timesPerWeek: null,
            quantityText: null,
            preferredTime: "morning",
            generated: false,
          },
        ],
      })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(screen.getByLabelText(/What do you plan to do/i), "walk in the mornings");
    fireEvent.press(screen.getByText("Suggest activities"));

    await waitFor(() =>
      expect(screen.getByText(/From your words/i)).toBeTruthy()
    );
  });

  it("offers an empty editor when there is no proposal, never a generated plan", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({ notice: "MedHelp has no suggestions right now." })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(screen.getByLabelText(/What do you plan to do/i), "get healthier");
    fireEvent.press(screen.getByText("Suggest activities"));

    await waitFor(() =>
      expect(screen.getByText(/no suggestions right now/i)).toBeTruthy()
    );
    // One blank row to type into, and nothing filled in on the person's behalf.
    expect(screen.getByLabelText(/Activity 1/i).props.value).toBe("");
  });

  it("shows emergency guidance above everything, even when the model refused", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({
        notice: "MedHelp can only track activities you plan to do.",
        emergency: {
          category: "cardiac",
          headline: "Call 911 now",
          action: "Call 911 or your local emergency number now.",
          matchedTerms: ["chest pain"],
        },
      })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(
      screen.getByLabelText(/What do you plan to do/i),
      "stop the chest pain when I walk"
    );
    fireEvent.press(screen.getByText("Suggest activities"));

    await waitFor(() => expect(screen.getByText("Call 911 now")).toBeTruthy());
  });

  it("saves only what the person confirmed", async () => {
    mockDraft.mockResolvedValue(emptyDraft({ notice: "No suggestions." }));
    mockCreate.mockResolvedValue(goal());

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(screen.getByLabelText(/What do you plan to do/i), "swim");
    fireEvent.press(screen.getByText("Suggest activities"));
    await waitFor(() => expect(screen.getByLabelText(/Activity 1/i)).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText(/Goal name/i), "Swimming");
    fireEvent.changeText(screen.getByLabelText(/Activity 1/i), "Swim on Saturdays");
    fireEvent.press(screen.getByText("Save goal"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Swimming",
          activities: [expect.objectContaining({ text: "Swim on Saturdays" })],
        })
      )
    );
  });

  it("labels a suggested row, and drops the label once it is edited", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({
        title: "Feeling better",
        activities: [
          {
            text: "Walk after lunch",
            sourcePhrase: null,
            cadence: "daily",
            timesPerWeek: null,
            quantityText: null,
            preferredTime: "unspecified",
            generated: true,
          },
        ],
      })
    );

    render(
      <GoalCreateScreen
        navigation={navigation as never}
        route={{ key: "k", name: "GoalCreate" }}
      />
    );
    fireEvent.changeText(
      screen.getByLabelText(/What do you plan to do/i),
      "I want to be healthier"
    );
    fireEvent.press(screen.getByText("Suggest activities"));

    // A person must be able to tell which lines are theirs.
    await waitFor(() => expect(screen.getByText(/Suggested by MedHelp/i)).toBeTruthy());

    // Editing it makes it theirs, so the label goes.
    fireEvent.changeText(screen.getByLabelText(/Activity 1/i), "Walk after dinner");
    await waitFor(() => expect(screen.queryByText(/Suggested by MedHelp/i)).toBeNull());
  });
});

describe("HealthGoalsScreen", () => {
  const route = { key: "k", name: "HealthGoals", params: undefined } as never;

  it("ticks an activity off for today", async () => {
    mockList.mockResolvedValue([goal()]);
    mockComplete.mockResolvedValue(
      goal({
        activities: [
          {
            id: "activity-1",
            text: "Walk in the mornings",
            cadence: "daily",
            timesPerWeek: null,
            quantityText: null,
            preferredTime: "morning",
            completedToday: true,
          },
        ],
      })
    );

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("Walk in the mornings")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Walk in the mornings"));
    await waitFor(() =>
      expect(mockComplete).toHaveBeenCalledWith(
        "goal-1",
        "activity-1",
        true,
        expect.any(String)
      )
    );
  });

  it("never describes an unticked activity as missed", async () => {
    mockList.mockResolvedValue([goal()]);

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("Walk in the mornings")).toBeTruthy());

    // MedHelp has no idea whether anything was done. Adherence language here
    // would invent a clinical fact about the person.
    expect(screen.queryByText(/missed/i)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/streak/i)).toBeNull();
  });

  it("deletes a goal", async () => {
    mockList.mockResolvedValue([goal()]);
    mockDelete.mockResolvedValue();

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("Getting outdoors")).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Delete Getting outdoors"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("goal-1"));
  });

  it("invites a first goal rather than showing an empty page", async () => {
    mockList.mockResolvedValue([]);

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("No goals yet")).toBeTruthy());

    fireEvent.press(screen.getByText("Add a goal"));
    expect(navigation.navigate).toHaveBeenCalledWith("GoalCreate");
  });
});
