import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { GoalCreateScreen } from "@/screens/goals/GoalCreateScreen";
import { HealthGoalsScreen } from "@/screens/goals/HealthGoalsScreen";
import {
  DAYS,
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
        days: [...DAYS],
        timeOfDay: "08:00",
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
            // A quoted row carries no schedule: a time MedHelp invented
            // would be a quantity the person never wrote.
            days: [],
            timeOfDay: null,
          },
        ],
      })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(
      screen.getByLabelText(/What would you like to work towards/i),
      "walk in the mornings"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));

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
            // A quoted row carries no schedule: a time MedHelp invented
            // would be a quantity the person never wrote.
            days: [],
            timeOfDay: null,
          },
        ],
      })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(screen.getByLabelText(/What would you like to work towards/i), "walk in the mornings");
    fireEvent.press(screen.getByText("Suggest a plan"));

    await waitFor(() =>
      expect(screen.getByText(/From your words/i)).toBeTruthy()
    );
  });

  it("offers an empty editor when there is no proposal, never a generated plan", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({ notice: "MedHelp has no suggestions right now." })
    );

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(screen.getByLabelText(/What would you like to work towards/i), "get healthier");
    fireEvent.press(screen.getByText("Suggest a plan"));

    await waitFor(() =>
      expect(screen.getByText(/no suggestions right now/i)).toBeTruthy()
    );
    // One blank row to type into, and nothing filled in on the person's behalf.
    expect(screen.getByLabelText("Activity 1").props.value).toBe("");
  });

  it("shows emergency guidance above everything, even when the model refused", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({
        notice: "MedHelp could not tell what you were going for.",
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
      screen.getByLabelText(/What would you like to work towards/i),
      "stop the chest pain when I walk"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));

    await waitFor(() => expect(screen.getByText("Call 911 now")).toBeTruthy());
  });

  it("saves only what the person confirmed", async () => {
    mockDraft.mockResolvedValue(emptyDraft({ notice: "No suggestions." }));
    mockCreate.mockResolvedValue(goal());

    render(<GoalCreateScreen navigation={navigation as never} route={{ key: "k", name: "GoalCreate" }} />);
    fireEvent.changeText(screen.getByLabelText(/What would you like to work towards/i), "swim");
    fireEvent.press(screen.getByText("Suggest a plan"));
    await waitFor(() => expect(screen.getByLabelText("Activity 1")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText(/Goal name/i), "Swimming");
    fireEvent.changeText(screen.getByLabelText("Activity 1"), "Swim on Saturdays");
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
            cadence: "times_per_week",
            timesPerWeek: 3,
            quantityText: null,
            preferredTime: "afternoon",
            generated: true,
            days: ["monday", "wednesday", "friday"],
            timeOfDay: "13:00",
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
      screen.getByLabelText(/What would you like to work towards/i),
      "I want to be healthier"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));

    // A person must be able to tell which lines are theirs.
    await waitFor(() => expect(screen.getByText(/Suggested by MedHelp/i)).toBeTruthy());

    // Editing it makes it theirs, so the label goes.
    fireEvent.changeText(screen.getByLabelText("Activity 1"), "Walk after dinner");
    await waitFor(() => expect(screen.queryByText(/Suggested by MedHelp/i)).toBeNull());
  });

  it("lands the suggested schedule in the editor, with its days ticked", async () => {
    mockDraft.mockResolvedValue(
      emptyDraft({
        title: "Feeling better",
        activities: [
          {
            text: "Walk after lunch",
            sourcePhrase: null,
            cadence: "times_per_week",
            timesPerWeek: 3,
            quantityText: null,
            preferredTime: "afternoon",
            generated: true,
            days: ["monday", "wednesday", "friday"],
            timeOfDay: "13:00",
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
      screen.getByLabelText(/What would you like to work towards/i),
      "I want to be healthier"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));

    await waitFor(() => expect(screen.getByDisplayValue("13:00")).toBeTruthy());

    // The three proposed days are ticked and the other four are not.
    expect(screen.getByLabelText(/monday for activity 1/i).props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(/wednesday for activity 1/i).props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(/tuesday for activity 1/i).props.accessibilityState.checked).toBe(false);
  });

  it("says whether a day is selected in the label, not only in the colour", async () => {
    /*
     * ⛔ Checked against the deployed site on 2026-09-12, where this failed.
     *
     * Every day chip rendered with `aria-checked` null: this version of React
     * Native Web does not map `accessibilityState` onto the DOM. The chips
     * looked right — Mon to Fri filled in the accent colour, Sat and Sun not
     * — so the only thing telling anyone which days the plan had chosen was
     * the fill. A screen reader was told nothing.
     *
     * `accessibilityState` is asserted above and is right on native. This
     * asserts the half that survives whatever RNW emits.
     */
    mockDraft.mockResolvedValue(
      emptyDraft({
        title: "Feeling better",
        activities: [
          {
            text: "Walk after lunch",
            sourcePhrase: null,
            cadence: "times_per_week",
            timesPerWeek: 2,
            quantityText: null,
            preferredTime: "afternoon",
            generated: true,
            days: ["monday", "friday"],
            timeOfDay: "13:00",
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
      screen.getByLabelText(/What would you like to work towards/i),
      "I want to be healthier"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));

    await waitFor(() => expect(screen.getByDisplayValue("13:00")).toBeTruthy());

    expect(screen.getByLabelText("monday for activity 1, selected")).toBeTruthy();
    expect(screen.getByLabelText("friday for activity 1, selected")).toBeTruthy();
    expect(screen.getByLabelText("tuesday for activity 1, not selected")).toBeTruthy();

    // And it tracks the tap, rather than being a label written once.
    fireEvent.press(screen.getByLabelText("tuesday for activity 1, not selected"));
    await waitFor(() =>
      expect(screen.getByLabelText("tuesday for activity 1, selected")).toBeTruthy()
    );
  });

  it("saves the schedule, deriving the cadence from the days ticked", async () => {
    mockDraft.mockResolvedValue(emptyDraft({ notice: "No suggestions." }));
    mockCreate.mockResolvedValue(goal());

    render(
      <GoalCreateScreen
        navigation={navigation as never}
        route={{ key: "k", name: "GoalCreate" }}
      />
    );
    fireEvent.changeText(
      screen.getByLabelText(/What would you like to work towards/i),
      "swim"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));
    await waitFor(() => expect(screen.getByLabelText("Activity 1")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText(/Goal name/i), "Swimming");
    fireEvent.changeText(screen.getByLabelText("Activity 1"), "Swim");
    fireEvent.press(screen.getByLabelText(/saturday for activity 1/i));
    fireEvent.press(screen.getByLabelText(/sunday for activity 1/i));
    fireEvent.changeText(screen.getByLabelText("At what time?"), "09:30");
    fireEvent.press(screen.getByText("Save goal"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          activities: [
            expect.objectContaining({
              text: "Swim",
              days: ["saturday", "sunday"],
              timeOfDay: "09:30",
              // Worked out from the days, so the schedule line cannot
              // contradict the ticks.
              cadence: "times_per_week",
              timesPerWeek: 2,
            }),
          ],
        })
      )
    );
  });

  it("refuses a time it cannot read rather than guessing at one", async () => {
    mockDraft.mockResolvedValue(emptyDraft({ notice: "No suggestions." }));

    render(
      <GoalCreateScreen
        navigation={navigation as never}
        route={{ key: "k", name: "GoalCreate" }}
      />
    );
    fireEvent.changeText(
      screen.getByLabelText(/What would you like to work towards/i),
      "swim"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));
    await waitFor(() => expect(screen.getByLabelText("Activity 1")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText(/Goal name/i), "Swimming");
    fireEvent.changeText(screen.getByLabelText("Activity 1"), "Swim");
    // "8" could be either end of the day — same rule as dose_schedule.py.
    fireEvent.changeText(screen.getByLabelText("At what time?"), "8am");

    // The field's own hint also mentions a 24-hour clock, so assert on the
    // half that only the error says.
    await waitFor(() => expect(screen.getByText(/Enter the time as HH:MM/i)).toBeTruthy());
    fireEvent.press(screen.getByText("Save goal"));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("says the plan was written by software and checked by nobody", async () => {
    // ⛔ Since the medical-goal refusal was removed, this footnote is the
    // only thing on the screen telling the person what they are looking at.
    mockDraft.mockResolvedValue(emptyDraft({ notice: "No suggestions." }));

    render(
      <GoalCreateScreen
        navigation={navigation as never}
        route={{ key: "k", name: "GoalCreate" }}
      />
    );
    fireEvent.changeText(
      screen.getByLabelText(/What would you like to work towards/i),
      "lose weight"
    );
    fireEvent.press(screen.getByText("Suggest a plan"));

    await waitFor(() =>
      expect(screen.getByText(/not by a doctor or nurse/i)).toBeTruthy()
    );
    expect(screen.getByText(/Nobody medically qualified has checked them/i)).toBeTruthy();
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
            days: [...DAYS],
            timeOfDay: "08:00",
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

  it("marks the activities that are due today", async () => {
    // Deliberately scheduled every day, so this does not depend on which day
    // the suite happens to run on.
    mockList.mockResolvedValue([goal()]);

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("Walk in the mornings")).toBeTruthy());

    expect(screen.getByText("Due today")).toBeTruthy();
    // ⛔ A marker, never a tally. No counts, no progress.
    expect(screen.queryByText(/\d+ of \d+/)).toBeNull();
  });

  it("does not mark an activity with no days as due today", async () => {
    mockList.mockResolvedValue([
      goal({
        activities: [
          {
            id: "unscheduled",
            text: "Swim sometime",
            cadence: "unspecified",
            timesPerWeek: null,
            quantityText: null,
            preferredTime: "unspecified",
            days: [],
            timeOfDay: null,
            completedToday: false,
          },
        ],
      }),
    ]);

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    // Still listed, and still tickable whenever they like...
    await waitFor(() => expect(screen.getByText("Swim sometime")).toBeTruthy());
    // ...but nobody chose any days, so MedHelp does not claim it is due.
    expect(screen.queryByText("Due today")).toBeNull();
    expect(screen.getByText(/Whenever you choose/i)).toBeTruthy();
  });

  it("shows the day names and time under an activity", async () => {
    mockList.mockResolvedValue([
      goal({
        activities: [
          {
            id: "activity-1",
            text: "Walk after lunch",
            cadence: "times_per_week",
            timesPerWeek: 3,
            quantityText: null,
            preferredTime: "afternoon",
            days: ["monday", "wednesday", "friday"],
            timeOfDay: "13:00",
            completedToday: false,
          },
        ],
      }),
    ]);

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("Mon, Wed, Fri · 13:00")).toBeTruthy());
  });

  it("invites a first goal rather than showing an empty page", async () => {
    mockList.mockResolvedValue([]);

    render(<HealthGoalsScreen navigation={navigation as never} route={route} />);
    await waitFor(() => expect(screen.getByText("No goals yet")).toBeTruthy());

    fireEvent.press(screen.getByText("Add a goal"));
    expect(navigation.navigate).toHaveBeenCalledWith("GoalCreate");
  });
});
