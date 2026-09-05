import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { AppointmentRequestScreen } from "@/screens/appointments/AppointmentRequestScreen";
import { requestAppointment } from "@/services/appointmentService";
import type { Provider } from "@/services/providerService";

jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  requestAppointment: jest.fn(),
}));

const mockRequest = requestAppointment as jest.MockedFunction<
  typeof requestAppointment
>;

const PROVIDER: Provider = {
  npi: "1000000001",
  name: "Synthetic Urgent Care",
  specialty: "Clinic/Center, Urgent Care",
  phone: "(212) 555-0143",
  address: "1 Synthetic Plaza, New York, NY, 10001",
  city: "New York",
  state: "NY",
  postalCode: "10001",
  sourceName: "NPPES NPI Registry, US Centers for Medicare & Medicaid Services",
  distanceMiles: 1.2,
};

function savedAppointment(overrides = {}) {
  return {
    id: "appointment-1",
    providerName: PROVIDER.name,
    providerNpi: PROVIDER.npi,
    providerSpecialty: PROVIDER.specialty,
    providerPhone: PROVIDER.phone,
    providerAddress: PROVIDER.address,
    reasonForVisit: "Sore throat and a fever since Tuesday.",
    preferredTime: null,
    urgencyTier: null,
    sourceAssessmentId: null,
    notes: null,
    status: "REQUESTED" as const,
    providerNotified: false,
    createdAt: "2026-08-29T10:00:00Z",
    ...overrides,
  };
}

function renderScreen(intake?: {
  reasonForVisit: string;
  tier: "EMERGENT" | "URGENT" | "SELF_CARE";
  assessmentId: string | null;
}) {
  const replace = jest.fn();
  const goBack = jest.fn();
  render(
    <AppointmentRequestScreen
      navigation={{ replace, goBack } as any}
      route={{ params: { provider: PROVIDER, intake } } as any}
    />
  );
  return { replace, goBack };
}

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue(savedAppointment());
});

describe("AppointmentRequestScreen", () => {
  it("says the clinic will not be contacted, before the form", () => {
    // The user is about to fill in a reason and a preferred time. If they only
    // learn afterwards that they still have to phone, they may never phone.
    renderScreen();

    expect(screen.getByText("MedHelp can't contact the clinic")).toBeTruthy();
    expect(screen.getByText(/please call \(212\) 555-0143/i)).toBeTruthy();
  });

  it("does not label the action as booking", () => {
    renderScreen();

    expect(screen.queryByText(/^book/i)).toBeNull();
    expect(screen.getByText("Save this appointment")).toBeTruthy();
  });

  it("prefills the reason from a symptom check", () => {
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    expect(
      screen.getByDisplayValue("Sore throat and a fever since Tuesday.")
    ).toBeTruthy();
  });

  it("lets the user edit the prefilled reason before anything is saved", async () => {
    // The description was written to answer a triage question, not to tell a
    // receptionist why you are coming in. The user gets the last word.
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    fireEvent.changeText(
      screen.getByDisplayValue("Sore throat and a fever since Tuesday."),
      "Fever, want it checked."
    );
    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(mockRequest.mock.calls[0][0].reasonForVisit).toBe(
      "Fever, want it checked."
    );
  });

  it("carries the urgency context through to the saved record", async () => {
    renderScreen({
      reasonForVisit: "Sore throat and a fever since Tuesday.",
      tier: "URGENT",
      assessmentId: "assessment-1",
    });

    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const payload = mockRequest.mock.calls[0][0];
    expect(payload.urgencyTier).toBe("URGENT");
    expect(payload.sourceAssessmentId).toBe("assessment-1");
    expect(payload.providerNpi).toBe("1000000001");
  });

  it("refuses to save without a reason for visit", async () => {
    renderScreen();

    fireEvent.press(screen.getByText("Save this appointment"));

    expect(
      await screen.findByText("Enter what you'd like to be seen about.")
    ).toBeTruthy();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when saving fails", async () => {
    mockRequest.mockRejectedValue(new Error("network"));
    renderScreen({
      reasonForVisit: "Sore throat.",
      tier: "URGENT",
      assessmentId: null,
    });

    fireEvent.press(screen.getByText("Save this appointment"));

    expect(
      await screen.findByText(/couldn't save this appointment/i)
    ).toBeTruthy();
  });

  it("replaces rather than pushes the confirmation, so the form cannot be resubmitted", async () => {
    const { replace } = renderScreen({
      reasonForVisit: "Sore throat.",
      tier: "URGENT",
      assessmentId: null,
    });

    fireEvent.press(screen.getByText("Save this appointment"));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "AppointmentConfirmation",
        expect.objectContaining({ appointment: expect.anything() })
      )
    );
  });
});
