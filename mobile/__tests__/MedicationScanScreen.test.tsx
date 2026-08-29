/**
 * Tests for the label-scanning screen.
 *
 * The property this screen exists to guarantee: a scan never becomes a saved
 * medication on its own. Every route out of here goes through the ordinary
 * medication form, where a person reads the fields and presses save.
 *
 * The second property: no failure is a dead end. Manual entry is reachable
 * whether the scan worked, failed, was refused permission, or is not supported
 * on the device at all.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { MedicationScanScreen } from "@/screens/medications/MedicationScanScreen";
import {
  ScanError,
  captureLabelImage,
  isScanAvailable,
  readLabel,
} from "@/services/labelScanner";
import { createMedication } from "@/services/medicationService";
import type { ParsedLabel } from "@/services/labelParser";

jest.mock("@/services/labelScanner", () => ({
  ...jest.requireActual("@/services/labelScanner"),
  isScanAvailable: jest.fn(),
  captureLabelImage: jest.fn(),
  readLabel: jest.fn(),
}));

jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"),
  createMedication: jest.fn(),
}));

const isScanAvailableMock = isScanAvailable as jest.MockedFunction<typeof isScanAvailable>;
const captureLabelImageMock = captureLabelImage as jest.MockedFunction<
  typeof captureLabelImage
>;
const readLabelMock = readLabel as jest.MockedFunction<typeof readLabel>;
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

function renderScreen() {
  const replace = jest.fn();
  render(
    <MedicationScanScreen
      navigation={{ replace } as any}
      route={{ params: undefined } as any}
    />
  );
  return { replace };
}

describe("MedicationScanScreen", () => {
  beforeEach(() => {
    isScanAvailableMock.mockReset().mockReturnValue(true);
    captureLabelImageMock.mockReset();
    readLabelMock.mockReset();
    createMedicationMock.mockReset();
  });

  it("says the photo stays on the device", () => {
    renderScreen();

    // "Photograph your prescription" is a reasonable thing to hesitate over.
    // The answer is on the screen before the camera opens.
    expect(screen.getByText(/stays on this device/i)).toBeTruthy();
    expect(screen.getByText(/not uploaded/i)).toBeTruthy();
  });

  it("warns that a read from a photo can be wrong", () => {
    renderScreen();

    expect(screen.getByText(/can get things wrong/i)).toBeTruthy();
  });

  it("hands a successful read to the form instead of saving it", async () => {
    captureLabelImageMock.mockResolvedValue("file:///synthetic.jpg");
    readLabelMock.mockResolvedValue(SCANNED);
    const { replace } = renderScreen();

    fireEvent.press(screen.getByText("Take a photo"));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("MedicationEdit", { scanned: SCANNED })
    );
    // The whole point. Nothing is written from this screen.
    expect(createMedicationMock).not.toHaveBeenCalled();
  });

  it("never saves a medication, even on a clean high-confidence read", async () => {
    captureLabelImageMock.mockResolvedValue("file:///synthetic.jpg");
    readLabelMock.mockResolvedValue(SCANNED);
    renderScreen();

    fireEvent.press(screen.getByText("Take a photo"));

    await waitFor(() => expect(readLabelMock).toHaveBeenCalled());
    expect(createMedicationMock).not.toHaveBeenCalled();
  });

  it("offers manual entry before anything is scanned", () => {
    renderScreen();

    expect(screen.getByText("Type it in myself")).toBeTruthy();
  });

  it("opens a blank form when the user chooses to type it in", () => {
    const { replace } = renderScreen();

    fireEvent.press(screen.getByText("Type it in myself"));

    expect(replace).toHaveBeenCalledWith("MedicationEdit", {});
  });

  it("shows the failure and keeps manual entry available", async () => {
    captureLabelImageMock.mockResolvedValue("file:///synthetic.jpg");
    readLabelMock.mockRejectedValue(
      new ScanError("unreadable", "No medication name could be read from that photo.")
    );
    renderScreen();

    fireEvent.press(screen.getByText("Take a photo"));

    await waitFor(() =>
      expect(screen.getByText(/No medication name could be read/i)).toBeTruthy()
    );
    expect(screen.getByText("Type it in myself")).toBeTruthy();
  });

  it("explains a refused camera permission rather than failing silently", async () => {
    captureLabelImageMock.mockRejectedValue(
      new ScanError(
        "permission-denied",
        "MedHelp needs permission to use the camera to read a label."
      )
    );
    renderScreen();

    fireEvent.press(screen.getByText("Take a photo"));

    await waitFor(() =>
      expect(screen.getByText(/needs permission to use the camera/i)).toBeTruthy()
    );
  });

  it("says nothing when the user simply backs out of the camera", async () => {
    captureLabelImageMock.mockResolvedValue(null);
    const { replace } = renderScreen();

    fireEvent.press(screen.getByText("Take a photo"));

    await waitFor(() => expect(captureLabelImageMock).toHaveBeenCalled());
    // Cancelling is a choice, not an error. No scary message, no navigation.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn't be read/i)).toBeNull();
  });

  it("falls back to manual entry on a device that cannot scan", () => {
    isScanAvailableMock.mockReturnValue(false);
    renderScreen();

    expect(screen.getByText(/Scanning isn't available/i)).toBeTruthy();
    expect(screen.getByText("Type it in myself")).toBeTruthy();
  });

  it("does not offer a camera button it cannot honour", () => {
    isScanAvailableMock.mockReturnValue(false);
    renderScreen();

    // An option that always fails is worse than no option.
    expect(screen.queryByText("Take a photo")).toBeNull();
  });

  it("can read a label from an existing photo", async () => {
    captureLabelImageMock.mockResolvedValue("file:///synthetic.jpg");
    readLabelMock.mockResolvedValue(SCANNED);
    const { replace } = renderScreen();

    fireEvent.press(screen.getByText("Choose an existing photo"));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(captureLabelImageMock).toHaveBeenCalledWith("library");
  });
});
