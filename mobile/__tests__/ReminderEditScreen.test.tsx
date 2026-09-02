/**
 * Tests for the screen that chooses reminder times.
 *
 * The rule under test throughout: MedHelp may propose times and may never set
 * them. A suggestion is a draft until the user saves it, the printed
 * directions stay on screen unedited beside it, and a frequency MedHelp cannot
 * read produces no guess at all.
 *
 * All fixtures synthetic.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ReminderEditScreen } from "@/screens/medication-reminders/ReminderEditScreen";

jest.mock("@/services/reminderService", () => ({
  ApiError: class ApiError extends Error {},
  listSchedules: jest.fn(),
  getSuggestion: jest.fn(),
  saveSchedule: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reminderService = require("@/services/reminderService");

const navigation = { navigate: jest.fn(), replace: jest.fn() };
const route = {
  params: { medicationId: "m1", medicationName: "Synthetic Tablet" },
};

function renderScreen() {
  return render(
    <ReminderEditScreen
      navigation={navigation as never}
      route={route as never}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  reminderService.listSchedules.mockResolvedValue([]);
  reminderService.saveSchedule.mockResolvedValue({
    medicationId: "m1",
    medicationName: "Synthetic Tablet",
    dosage: null,
    frequency: null,
    reminders: [],
  });
});

describe("a frequency MedHelp recognises", () => {
  beforeEach(() => {
    reminderService.getSuggestion.mockResolvedValue({
      recognised: true,
      times: ["08:00", "20:00"],
      dosesPerDay: 2,
      reason: null,
      frequency: "TAKE 1 TABLET BY MOUTH TWICE DAILY",
    });
  });

  it("fills the times in as a draft and says they are suggestions", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText(/These are suggestions/i)).toBeTruthy());
    expect(screen.getByText(/2 reminders a day/i)).toBeTruthy();
  });

  it("shows the printed directions verbatim beside them", async () => {
    renderScreen();

    // The check on the suggestion: the user compares it with the label's own
    // words rather than taking the app's word for it.
    await waitFor(() =>
      expect(screen.getByText("TAKE 1 TABLET BY MOUTH TWICE DAILY")).toBeTruthy()
    );
  });

  it("saves nothing until the user presses save", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText(/These are suggestions/i)).toBeTruthy());

    // Loading the screen is not consent to a schedule.
    expect(reminderService.saveSchedule).not.toHaveBeenCalled();
  });

  it("saves the confirmed times when the user presses save", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText(/These are suggestions/i)).toBeTruthy());

    fireEvent.press(screen.getByLabelText("Save reminders"));

    await waitFor(() =>
      expect(reminderService.saveSchedule).toHaveBeenCalledWith("m1", ["08:00", "20:00"])
    );
  });

  it("lets a suggested time be removed before saving", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText(/These are suggestions/i)).toBeTruthy());

    // Two suggested times, so two Remove buttons; drop the first (08:00).
    fireEvent.press(screen.getAllByLabelText(/^Remove /)[0]);
    fireEvent.press(screen.getByLabelText("Save reminders"));

    await waitFor(() =>
      expect(reminderService.saveSchedule).toHaveBeenCalledWith("m1", ["20:00"])
    );
  });
});

describe("a frequency MedHelp cannot read", () => {
  beforeEach(() => {
    reminderService.getSuggestion.mockResolvedValue({
      recognised: false,
      times: [],
      dosesPerDay: null,
      reason:
        "These directions say to take it as needed, so there is no fixed schedule to remind you about. You can still add your own times.",
      frequency: "TAKE 1 TABLET EVERY 6 HOURS AS NEEDED",
    });
  });

  it("proposes nothing and explains why", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText(/Set your own times/i)).toBeTruthy());
    // The reason, in the app's own words...
    expect(screen.getByText(/no fixed schedule to remind you about/i)).toBeTruthy();
    // ...and the label's words, unedited, still on screen beside it.
    expect(screen.getByText("TAKE 1 TABLET EVERY 6 HOURS AS NEEDED")).toBeTruthy();
    expect(screen.getByText(/No reminder times yet/i)).toBeTruthy();
  });

  it("presents that as guidance, not as a failure", async () => {
    renderScreen();

    await waitFor(() => expect(screen.getByText(/Set your own times/i)).toBeTruthy());
    // Declining to guess is an ordinary outcome; an error box here would read
    // as something having gone wrong.
    expect(screen.queryByText(/couldn't|something went wrong/i)).toBeNull();
  });

  it("still lets the user add their own time", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText(/Set your own times/i)).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Add a time"), "07:30");
    fireEvent.press(screen.getByLabelText("Add this time"));
    fireEvent.press(screen.getByLabelText("Save reminders"));

    await waitFor(() =>
      expect(reminderService.saveSchedule).toHaveBeenCalledWith("m1", ["07:30"])
    );
  });
});

describe("times the user types", () => {
  beforeEach(() => {
    reminderService.getSuggestion.mockResolvedValue({
      recognised: false,
      times: [],
      dosesPerDay: null,
      reason: "MedHelp couldn't read a daily schedule from these directions.",
      frequency: "USE AS INSTRUCTED",
    });
  });

  it.each(["8am", "0800", "25:00", "8:00"])(
    "rejects %p rather than guessing what was meant",
    async (bad) => {
      renderScreen();
      await waitFor(() => expect(screen.getByLabelText("Add a time")).toBeTruthy());

      fireEvent.changeText(screen.getByLabelText("Add a time"), bad);
      fireEvent.press(screen.getByLabelText("Add this time"));

      // "8" could be either end of the day. A guess here is a medication
      // reminder at the wrong hour.
      expect(screen.getByText(/24-hour clock/i)).toBeTruthy();
      expect(screen.getByText(/No reminder times yet/i)).toBeTruthy();
    }
  );

  it("refuses the same time twice", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText("Add a time")).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText("Add a time"), "08:00");
    fireEvent.press(screen.getByLabelText("Add this time"));
    fireEvent.changeText(screen.getByLabelText("Add a time"), "08:00");
    fireEvent.press(screen.getByLabelText("Add this time"));

    expect(screen.getByText(/already on the list/i)).toBeTruthy();
    expect(screen.getByText(/1 reminder a day/i)).toBeTruthy();
  });
});

describe("times already saved", () => {
  it("shows what is saved rather than replacing it with a suggestion", async () => {
    reminderService.listSchedules.mockResolvedValue([
      {
        medicationId: "m1",
        medicationName: "Synthetic Tablet",
        dosage: "10 mg",
        frequency: "TAKE 1 TABLET BY MOUTH TWICE DAILY",
        reminders: [
          { id: "r1", medicationId: "m1", timeOfDay: "07:00", enabled: true },
        ],
      },
    ]);
    reminderService.getSuggestion.mockResolvedValue({
      recognised: true,
      times: ["08:00", "20:00"],
      dosesPerDay: 2,
      reason: null,
      frequency: "TAKE 1 TABLET BY MOUTH TWICE DAILY",
    });

    renderScreen();

    // A user who has already chosen their times must not have them silently
    // overwritten by a fresh suggestion.
    await waitFor(() => expect(screen.getByText(/1 reminder a day/i)).toBeTruthy());
    expect(screen.queryByText(/These are suggestions/i)).toBeNull();
  });
});
