import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { BookingIdentityScreen } from "@/screens/appointments/BookingIdentityScreen";
import { submitBooking } from "@/services/appointmentService";

jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  submitBooking: jest.fn(),
}));

const mockSubmit = submitBooking as jest.MockedFunction<typeof submitBooking>;

function renderScreen() {
  const replace = jest.fn();
  const goBack = jest.fn();
  render(
    <BookingIdentityScreen
      navigation={{ replace, goBack } as any}
      route={
        {
          params: {
            appointmentId: "appointment-1",
            providerName: "Synthetic Urgent Care",
          },
        } as any
      }
    />
  );
  return { replace, goBack };
}

function fillForm() {
  fireEvent.changeText(screen.getByLabelText("First name"), "Synthetic");
  fireEvent.changeText(screen.getByLabelText("Last name"), "Testperson");
  fireEvent.changeText(screen.getByLabelText("Date of birth"), "1985-04-12");
  fireEvent.changeText(screen.getByLabelText("Phone"), "212-555-0143");
  fireEvent.changeText(
    screen.getByLabelText("Email"),
    "synthetic.testperson@example.com"
  );
  fireEvent.changeText(screen.getByLabelText("Street address"), "1 Synthetic Plaza");
  fireEvent.changeText(screen.getByLabelText("City"), "New York");
  fireEvent.changeText(screen.getByLabelText("State"), "ny");
  fireEvent.changeText(screen.getByLabelText("ZIP code"), "10001");
}

beforeEach(() => {
  mockSubmit.mockReset();
});

describe("BookingIdentityScreen", () => {
  it("tells the user their details are not kept", () => {
    renderScreen();

    expect(screen.getByText(/not saved by MedHelp/i)).toBeTruthy();
    expect(screen.getByText(/asked again next time/i)).toBeTruthy();
  });

  it("sends the identity straight through on submit", async () => {
    mockSubmit.mockRejectedValue(new Error("503"));
    renderScreen();
    fillForm();

    fireEvent.press(screen.getByText("Send request to provider"));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    const [appointmentId, identity] = mockSubmit.mock.calls[0];
    expect(appointmentId).toBe("appointment-1");
    expect(identity.lastName).toBe("Testperson");
    expect(identity.dateOfBirth).toBe("1985-04-12");
    // Normalised before it leaves.
    expect(identity.state).toBe("NY");
  });

  it("never puts the identity into navigation params", async () => {
    // Navigation state is serialisable and dev tooling persists it, so a date
    // of birth in a route param is a date of birth written to disk. Only the
    // resulting appointment travels onward.
    mockSubmit.mockResolvedValue({
      id: "appointment-1",
      providerName: "Synthetic Urgent Care",
      providerNpi: null,
      providerSpecialty: null,
      providerPhone: null,
      providerAddress: null,
      reasonForVisit: null,
      preferredTime: null,
      urgencyTier: null,
      sourceAssessmentId: null,
      notes: null,
      status: "REQUESTED",
      providerNotified: true,
      createdAt: "2026-08-29T10:00:00Z",
    });
    const { replace } = renderScreen();
    fillForm();

    fireEvent.press(screen.getByText("Send request to provider"));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const params = JSON.stringify(replace.mock.calls[0][1]);
    expect(params).not.toContain("Testperson");
    expect(params).not.toContain("1985-04-12");
    expect(params).not.toContain("Synthetic Plaza");
  });

  it("does not submit an incomplete form", async () => {
    renderScreen();

    fireEvent.press(screen.getByText("Send request to provider"));

    expect(await screen.findByText("Enter your first name.")).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rejects a malformed date of birth before sending it", async () => {
    renderScreen();
    fillForm();
    fireEvent.changeText(screen.getByLabelText("Date of birth"), "12/04/1985");

    fireEvent.press(screen.getByText("Send request to provider"));

    expect(await screen.findByText("Use the format YYYY-MM-DD.")).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("tells the user to call when the server refuses to send", async () => {
    // The standing state: the backend returns 503 because no BAA-covered
    // channel exists. The user must be left with a way forward.
    mockSubmit.mockRejectedValue(new Error("503"));
    renderScreen();
    fillForm();

    fireEvent.press(screen.getByText("Send request to provider"));

    expect(await screen.findByText(/call the provider/i)).toBeTruthy();
  });
});
