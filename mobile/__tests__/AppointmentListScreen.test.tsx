import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AppointmentListScreen } from "@/screens/appointments/AppointmentListScreen";
import {
  deleteAppointment,
  listAppointments,
  updateAppointment,
  type Appointment,
} from "@/services/appointmentService";

jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  listAppointments: jest.fn(),
  updateAppointment: jest.fn(),
  deleteAppointment: jest.fn(),
}));

// `useFocusEffect` needs a navigation container in a real app. This screen is
// rendered without one, so it stands in as a plain mount effect — which is
// what focus amounts to on first render anyway.
//
// The factory requires React itself rather than spreading
// `requireActual("@react-navigation/native")`: pulling the real package in
// drags its container and linking machinery into a test that has neither, and
// the suite then hangs when run on its own.
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

const mockList = listAppointments as jest.MockedFunction<typeof listAppointments>;
const mockUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockDelete = deleteAppointment as jest.MockedFunction<typeof deleteAppointment>;

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appointment-1",
    providerName: "Synthetic Urgent Care",
    providerNpi: "1000000001",
    providerSpecialty: "Clinic/Center, Urgent Care",
    providerPhone: "(212) 555-0143",
    providerAddress: "1 Synthetic Plaza, New York, NY, 10001",
    reasonForVisit: "Sore throat and a fever since Tuesday.",
    preferredTime: "Thursday morning",
    urgencyTier: "URGENT",
    sourceAssessmentId: "assessment-1",
    notes: null,
    status: "REQUESTED",
    providerNotified: false,
    createdAt: "2026-08-29T10:00:00Z",
    ...overrides,
  };
}

function renderScreen() {
  const navigate = jest.fn();
  render(<AppointmentListScreen navigation={{ navigate } as any} route={{} as any} />);
  return { navigate };
}

beforeEach(() => {
  mockList.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockList.mockResolvedValue([appointment()]);
});

describe("AppointmentListScreen", () => {
  it("shows an appointment saved by the booking flow", async () => {
    renderScreen();

    expect(await screen.findByText("Synthetic Urgent Care")).toBeTruthy();
    expect(
      screen.getByText("Sore throat and a fever since Tuesday.")
    ).toBeTruthy();
  });

  it("warns on every unarranged row that the clinic has not been told", async () => {
    // A list is skimmed. The one thing a user must not misread here is
    // whether the provider knows about the visit.
    renderScreen();

    expect(
      await screen.findByText(/Not arranged yet — call \(212\) 555-0143/)
    ).toBeTruthy();
    expect(screen.getByText("Not yet arranged")).toBeTruthy();
  });

  it("drops the warning once the user says they have arranged it", async () => {
    mockList.mockResolvedValue([appointment({ status: "SCHEDULED" })]);
    renderScreen();

    expect(await screen.findByText("Scheduled")).toBeTruthy();
    expect(screen.queryByText(/Not arranged yet/)).toBeNull();
  });

  it("lets the user mark a request as scheduled", async () => {
    mockUpdate.mockResolvedValue(appointment({ status: "SCHEDULED" }));
    renderScreen();

    fireEvent.press(await screen.findByText("Mark as scheduled"));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        "appointment-1",
        expect.objectContaining({ status: "SCHEDULED" })
      )
    );
  });

  it("removes an appointment", async () => {
    mockDelete.mockResolvedValue(undefined);
    renderScreen();

    fireEvent.press(await screen.findByText("Remove"));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("appointment-1"));
  });

  it("explains an empty list rather than showing a blank screen", async () => {
    mockList.mockResolvedValue([]);
    renderScreen();

    expect(await screen.findByText("No appointments yet")).toBeTruthy();
  });

  it("reports a load failure with a way to retry", async () => {
    mockList.mockRejectedValue(new Error("offline"));
    renderScreen();

    expect(
      await screen.findByText(/couldn't load your appointments/i)
    ).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("offers a route into provider search", async () => {
    const { navigate } = renderScreen();

    fireEvent.press(await screen.findByText("Find a provider"));

    expect(navigate).toHaveBeenCalledWith("ProviderSearch");
  });
});
