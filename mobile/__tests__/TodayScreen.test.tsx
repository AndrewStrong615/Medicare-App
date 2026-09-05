import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { TodayScreen } from "@/screens/TodayScreen";
import { logout } from "@/services/authService";
import { listAppointments, type Appointment } from "@/services/appointmentService";
import { listMedications, type Medication } from "@/services/medicationService";
import { listSchedules, type MedicationSchedule } from "@/services/reminderService";

jest.mock("@/services/authService", () => ({
  logout: jest.fn(async () => undefined),
}));
jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"),
  listMedications: jest.fn(),
}));
jest.mock("@/services/reminderService", () => ({
  ...jest.requireActual("@/services/reminderService"),
  listSchedules: jest.fn(),
}));
jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  listAppointments: jest.fn(),
}));

// Same stand-in as the appointment list suite: this screen is rendered without
// a navigation container, so focus is just the first mount.
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

const mockMedications = listMedications as jest.MockedFunction<typeof listMedications>;
const mockSchedules = listSchedules as jest.MockedFunction<typeof listSchedules>;
const mockAppointments = listAppointments as jest.MockedFunction<typeof listAppointments>;

function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "medication-1",
    name: "Lisinopril",
    dosage: "10 mg tablet",
    frequency: "Take 1 tablet once daily",
    prescribingDoctor: null,
    refillDate: null,
    notes: null,
    refillDueSoon: false,
    refillOverdue: false,
    daysUntilRefill: null,
    ...overrides,
  };
}

function schedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    medicationId: "medication-1",
    medicationName: "Lisinopril",
    dosage: "10 mg tablet",
    frequency: "Take 1 tablet once daily",
    reminders: [
      { id: "reminder-1", medicationId: "medication-1", timeOfDay: "08:00", enabled: true },
      { id: "reminder-2", medicationId: "medication-1", timeOfDay: "20:00", enabled: true },
    ],
    ...overrides,
  };
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appointment-1",
    providerName: "Synthetic Family Clinic",
    providerNpi: "1000000001",
    providerSpecialty: "Family Medicine",
    providerPhone: "(702) 555-0134",
    providerAddress: "1 Synthetic Plaza, Las Vegas, NV, 89109",
    reasonForVisit: "Sore throat since Thursday.",
    preferredTime: null,
    urgencyTier: "URGENT",
    sourceAssessmentId: null,
    notes: null,
    status: "REQUESTED",
    providerNotified: false,
    createdAt: "2026-09-04T10:00:00Z",
    ...overrides,
  };
}

function renderToday() {
  const navigate = jest.fn();
  const reset = jest.fn();
  render(<TodayScreen navigation={{ navigate, reset } as any} route={{} as any} />);
  return { navigate, reset };
}

beforeEach(() => {
  // Two in the afternoon, so "08:00" has gone by and "20:00" has not. Fixing
  // the clock is what makes the two states below assertable at all.
  jest.useFakeTimers({ now: new Date(2026, 8, 5, 14, 0, 0) });
  mockMedications.mockResolvedValue([medication()]);
  mockSchedules.mockResolvedValue([schedule()]);
  mockAppointments.mockResolvedValue([appointment()]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("TodayScreen", () => {
  it("puts all four destinations on screen instead of a menu of cards", async () => {
    renderToday();

    // The point of the new layout: navigation is present everywhere rather
    // than being a hub you have to come back to. "Today" appears twice on
    // purpose — the page title and the tab that is currently selected.
    await waitFor(() => expect(screen.getAllByText("Today")).toHaveLength(2));
    expect(screen.getByText("Symptoms")).toBeTruthy();
    expect(screen.getByText("Medications")).toBeTruthy();
    expect(screen.getByText("Care")).toBeTruthy();
  });

  it("makes a tab press a root, not another push onto the stack", async () => {
    const { reset } = renderToday();
    await waitFor(() => expect(screen.getByText("Medications")).toBeTruthy());

    fireEvent.press(screen.getByText("Medications"));

    // `reset`, not `navigate`: tabs are roots. Back from a tab returns to
    // Today rather than walking through whichever tabs were visited.
    expect(reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: "Home" }, { name: "MedicationList" }],
    });
  });

  it("shows the medication times the user set", async () => {
    renderToday();

    await waitFor(() => expect(screen.getByText("YOUR MEDICATION TIMES")).toBeTruthy());
    expect(screen.getAllByText("Lisinopril").length).toBeGreaterThan(0);
  });

  it("says a time has gone by without claiming the dose was missed", async () => {
    // ⛔ MedHelp does not know whether anything was taken. "Earlier today" is
    // the whole of what it may say; "missed" would invent a clinical fact
    // about the user, and nothing here tracks adherence.
    renderToday();

    await waitFor(() => expect(screen.getByText("Earlier today")).toBeTruthy());
    expect(screen.getByText("Later today")).toBeTruthy();
    expect(screen.queryByText(/missed/i)).toBeNull();
    expect(screen.queryByText(/overdue/i)).toBeNull();
    expect(screen.queryByText(/on track|adherence|streak/i)).toBeNull();
    // And it says so in as many words, rather than leaving the absence of a
    // claim to be inferred from the wording of the rows.
    expect(
      screen.getByText(/doesn't know whether a dose\s+was taken/i)
    ).toBeTruthy();
  });

  it("repeats that an unarranged appointment means nobody has been contacted", async () => {
    renderToday();

    await waitFor(() =>
      expect(screen.getByText(/Not arranged yet — call \(702\) 555-0134/)).toBeTruthy()
    );
  });

  it("counts refills the user's own dates make due, and nothing about their health", async () => {
    mockMedications.mockResolvedValue([
      medication({ refillOverdue: true, daysUntilRefill: -2 }),
      medication({ id: "medication-2", name: "Metformin ER" }),
    ]);
    renderToday();

    await waitFor(() =>
      expect(screen.getByText("1 medication needs a refill soon.")).toBeTruthy()
    );
  });

  it("still states the app's scope on the way in", async () => {
    renderToday();

    await waitFor(() =>
      expect(screen.getByText(/does not diagnose conditions/i)).toBeTruthy()
    );
  });

  it("does not route to emergency services from this screen", async () => {
    // ⛔ CLAUDE.md fences which screens carry escalation copy. Surfacing
    // `EmergencyCallBar` here is proposed and NOT approved; adding it needs
    // human sign-off obtained outside the agent pipeline, and this test is
    // what stops an agent quietly adding it later.
    renderToday();

    await waitFor(() => expect(screen.getAllByText("Today")).toHaveLength(2));
    expect(screen.queryByText(/Call 911/i)).toBeNull();
    expect(screen.queryByText(/emergency/i)).toBeNull();
  });

  it("signs the user out and leaves nothing to go back to", async () => {
    const { reset } = renderToday();
    await waitFor(() => expect(screen.getByText("Sign out")).toBeTruthy());

    fireEvent.press(screen.getByText("Sign out"));

    expect(logout).toHaveBeenCalled();
    expect(reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Login" }] });
  });

  it("keeps the rest of the day when one of the three lists fails", async () => {
    // One service failing must not blank the other two — someone's medication
    // times should not disappear because their appointment list timed out.
    mockAppointments.mockRejectedValue(new Error("offline"));
    renderToday();

    await waitFor(() => expect(screen.getByText(/Some of today couldn't be loaded/)).toBeTruthy());
    expect(screen.getByText("YOUR MEDICATION TIMES")).toBeTruthy();
  });
});
