/**
 * Tests for the medication form, focused on the confirmation step that a
 * scanned label has to pass through.
 *
 * A misread dose is not like a misread anything else in this app: it changes
 * when and how much of a medication someone takes. So the form is the gate.
 * Scanning prefills it and nothing more — the save is still a person reading
 * the fields and pressing the button.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MedicationEditScreen } from "@/screens/medications/MedicationEditScreen";
import { createMedication } from "@/services/medicationService";
import type { ParsedLabel } from "@/services/labelParser";

jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"),
  createMedication: jest.fn(),
}));

const createMedicationMock = createMedication as jest.MockedFunction<
  typeof createMedication
>;

const SCANNED: ParsedLabel = {
  name: "Lisinopril",
  dosage: "10 mg",
  frequency: "TAKE 1 TABLET BY MOUTH ONCE DAILY",
  prescribingDoctor: "RIVERA",
  confidence: "high",
  warnings: [],
};

const PARTIAL: ParsedLabel = {
  name: "Ibuprofen",
  dosage: null,
  frequency: null,
  prescribingDoctor: null,
  confidence: "partial",
  warnings: [
    "The dosage could not be read.",
    "The directions could not be read.",
  ],
};

function renderScreen(params: object = {}) {
  const goBack = jest.fn();
  render(
    <MedicationEditScreen
      navigation={{ goBack } as any}
      route={{ params } as any}
    />
  );
  return { goBack };
}

describe("MedicationEditScreen — a scanned label must be confirmed", () => {
  beforeEach(() => {
    createMedicationMock.mockReset().mockResolvedValue({} as never);
  });

  it("does not save anything on its own when opened from a scan", () => {
    renderScreen({ scanned: SCANNED });

    // Prefilling is not saving. Nothing has been written just by arriving.
    expect(createMedicationMock).not.toHaveBeenCalled();
  });

  it("tells the user to check the read against the label", () => {
    renderScreen({ scanned: SCANNED });

    expect(screen.getByText(/Check this against the label/i)).toBeTruthy();
    expect(screen.getByText(/can be wrong/i)).toBeTruthy();
  });

  it("prefills the fields it read", () => {
    renderScreen({ scanned: SCANNED });

    expect(screen.getByLabelText("Medication name").props.value).toBe("Lisinopril");
    expect(screen.getByLabelText("Dosage").props.value).toBe("10 mg");
    expect(screen.getByLabelText("How often").props.value).toBe(
      "TAKE 1 TABLET BY MOUTH ONCE DAILY"
    );
    expect(screen.getByLabelText("Prescribing doctor").props.value).toBe("RIVERA");
  });

  it("saves only what the user confirms, and only when they press save", async () => {
    renderScreen({ scanned: SCANNED });

    fireEvent.press(screen.getByText("Add medication"));

    await waitFor(() => expect(createMedicationMock).toHaveBeenCalledTimes(1));
    expect(createMedicationMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Lisinopril", dosage: "10 mg" })
    );
  });

  it("saves the correction, not the misread, when the user fixes a field", async () => {
    renderScreen({ scanned: SCANNED });

    // The exact case the confirmation step exists for: OCR read 70 as 10.
    fireEvent.changeText(screen.getByLabelText("Dosage"), "70 mg");
    fireEvent.press(screen.getByText("Add medication"));

    await waitFor(() => expect(createMedicationMock).toHaveBeenCalled());
    expect(createMedicationMock).toHaveBeenCalledWith(
      expect.objectContaining({ dosage: "70 mg" })
    );
  });

  it("says which fields could not be read on a partial scan", () => {
    renderScreen({ scanned: PARTIAL });

    expect(screen.getByText(/dosage could not be read/i)).toBeTruthy();
    expect(screen.getByText(/directions could not be read/i)).toBeTruthy();
  });

  it("leaves unread fields blank rather than filling them with a guess", () => {
    renderScreen({ scanned: PARTIAL });

    expect(screen.getByLabelText("Medication name").props.value).toBe("Ibuprofen");
    expect(screen.getByLabelText("Dosage").props.value).toBe("");
    expect(screen.getByLabelText("How often").props.value).toBe("");
  });

  it("still refuses to save a scan with no medication name", async () => {
    renderScreen({
      scanned: { ...PARTIAL, name: null, confidence: "none" as const },
    });

    fireEvent.press(screen.getByText("Add medication"));

    await waitFor(() =>
      expect(screen.getByText("Enter the medication name.")).toBeTruthy()
    );
    expect(createMedicationMock).not.toHaveBeenCalled();
  });
});

describe("MedicationEditScreen — manual entry is unchanged", () => {
  beforeEach(() => {
    createMedicationMock.mockReset().mockResolvedValue({} as never);
  });

  it("shows no scan notice when the form was opened by hand", () => {
    renderScreen({});

    expect(screen.queryByText(/Check this against the label/i)).toBeNull();
  });

  it("starts blank", () => {
    renderScreen({});

    expect(screen.getByLabelText("Medication name").props.value).toBe("");
  });

  it("still saves a typed-in medication", async () => {
    renderScreen({});

    fireEvent.changeText(screen.getByLabelText("Medication name"), "Placebofen");
    fireEvent.press(screen.getByText("Add medication"));

    await waitFor(() =>
      expect(createMedicationMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Placebofen" })
      )
    );
  });
});
