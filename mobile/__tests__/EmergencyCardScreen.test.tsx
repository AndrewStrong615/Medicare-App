/**
 * Tests for the emergency card screen.
 *
 * The two properties that carry safety weight:
 *
 * 1. **An empty field renders as "Not provided", never as a missing row.**
 *    A responder reading a card with no allergies row would reasonably take
 *    that as "no allergies". The gap has to be visible.
 * 2. **The screen makes no request.** It is read when a request is most
 *    likely to fail.
 *
 * All values below are invented.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import { EmergencyCardScreen } from "@/screens/emergency/EmergencyCardScreen";
import { EMPTY_CARD, loadCard, loadMirroredMedications } from "@/services/emergencyCard";

jest.mock("@/services/emergencyCard", () => {
  const actual = jest.requireActual("@/services/emergencyCard");
  return {
    ...actual,
    loadCard: jest.fn(),
    loadMirroredMedications: jest.fn(),
  };
});

// The screen reloads on focus so an edit shows immediately. Outside a
// navigator there is no focus event, so the effect is run as a plain mount.
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
}));

const SYNTHETIC_CARD = {
  ...EMPTY_CARD,
  bloodType: "O positive",
  allergies: "Placebillin",
  conditions: "Synthetic condition",
  contactName: "Sam Imaginary",
  contactRelationship: "sister",
  contactPhone: "(555) 010-0100",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function renderScreen() {
  const navigate = jest.fn();
  const goBack = jest.fn();
  render(
    <EmergencyCardScreen
      navigation={{ navigate, goBack } as any}
      route={{} as any}
    />
  );
  return { navigate, goBack };
}

describe("EmergencyCardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadCard as jest.Mock).mockResolvedValue(EMPTY_CARD);
    (loadMirroredMedications as jest.Mock).mockResolvedValue([]);
  });

  it("shows every field the user filled in, verbatim", async () => {
    (loadCard as jest.Mock).mockResolvedValue(SYNTHETIC_CARD);

    renderScreen();

    expect(await screen.findByText("O positive")).toBeTruthy();
    expect(screen.getByText("Placebillin")).toBeTruthy();
    expect(screen.getByText("Synthetic condition")).toBeTruthy();
    expect(screen.getByText("Sam Imaginary")).toBeTruthy();
    // The number is displayed exactly as typed, punctuation and all.
    expect(screen.getByText("(555) 010-0100")).toBeTruthy();
  });

  it("marks an unfilled field as not provided rather than hiding the row", async () => {
    // The single most important rule on this screen: an absent allergies row
    // would read as "no allergies" to whoever is holding the phone.
    (loadCard as jest.Mock).mockResolvedValue({ ...EMPTY_CARD, bloodType: "A negative" });

    renderScreen();

    expect(await screen.findByText("A negative")).toBeTruthy();
    expect(screen.getByText("Allergies")).toBeTruthy();
    expect(screen.getByText("Known conditions")).toBeTruthy();
    // Allergies, conditions, contact name, relationship, phone, medications.
    expect(screen.getAllByText("Not provided").length).toBeGreaterThanOrEqual(5);
  });

  it("labels every row even when the card has never been filled in", async () => {
    renderScreen();

    expect(await screen.findByText("Blood type")).toBeTruthy();
    expect(screen.getByText("Allergies")).toBeTruthy();
    expect(screen.getByText("Known conditions")).toBeTruthy();
    expect(screen.getByText("Emergency contact")).toBeTruthy();
    expect(screen.getByText("Current medications")).toBeTruthy();
  });

  it("makes no network request", async () => {
    // The card is read exactly when a request is least likely to succeed.
    const fetchSpy = jest.spyOn(global, "fetch" as never);
    (loadCard as jest.Mock).mockResolvedValue(SYNTHETIC_CARD);

    renderScreen();
    await screen.findByText("O positive");

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("dials the emergency contact on the digits, not the punctuation", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    (loadCard as jest.Mock).mockResolvedValue(SYNTHETIC_CARD);

    renderScreen();

    fireEvent.press(await screen.findByText("Call Sam Imaginary"));

    await waitFor(() => expect(openURL).toHaveBeenCalled());
    expect(openURL.mock.calls[0][0]).toMatch(/^tel(prompt)?:5550100100$/);
    openURL.mockRestore();
  });

  it("offers no call button when there is no number to ring", async () => {
    // A button that cannot work is worse than no button.
    (loadCard as jest.Mock).mockResolvedValue({
      ...SYNTHETIC_CARD,
      contactPhone: "ask my sister",
    });

    renderScreen();

    expect(await screen.findByText(/nothing to dial/i)).toBeTruthy();
    expect(screen.queryByText(/^Call Sam Imaginary$/)).toBeNull();
  });

  it("lists the medications copied to this device, and says they may be stale", async () => {
    (loadMirroredMedications as jest.Mock).mockResolvedValue([
      { name: "Placebofen", dosage: "10 mg" },
      { name: "Fictitine", dosage: null },
    ]);

    renderScreen();

    expect(await screen.findByText("Placebofen — 10 mg")).toBeTruthy();
    expect(screen.getByText("Fictitine")).toBeTruthy();
    expect(screen.getByText(/may be out of date/i)).toBeTruthy();
  });

  it("says MedHelp did not check any of this", async () => {
    // A red header carries an authority the content has not earned, so the
    // screen has to disown it in as many words.
    renderScreen();

    expect(await screen.findByText(/did not check them/i)).toBeTruthy();
  });

  it("still routes to emergency services from the card", async () => {
    renderScreen();

    expect(await screen.findByText("Call 911")).toBeTruthy();
  });

  it("says the card is empty and offers to fill it in", async () => {
    renderScreen();

    expect(await screen.findByText("This card is empty")).toBeTruthy();
    expect(screen.getByText("Fill in my emergency card")).toBeTruthy();
  });

  it("opens the editor", async () => {
    const { navigate } = renderScreen();

    fireEvent.press(await screen.findByText("Fill in my emergency card"));

    expect(navigate).toHaveBeenCalledWith("EmergencyCardEdit");
  });

  it("offers its own way back", async () => {
    // This screen draws its own header, so the navigator's is switched off —
    // which takes the back button with it, and a browser has no back gesture.
    // Without this control the screen is a dead end: everything else on it
    // goes deeper.
    const { goBack } = renderScreen();

    fireEvent.press(await screen.findByLabelText("Back"));

    expect(goBack).toHaveBeenCalled();
  });
});
