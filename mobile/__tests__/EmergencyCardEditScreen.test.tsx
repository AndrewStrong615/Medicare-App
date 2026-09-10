/**
 * Tests for the emergency card editor.
 *
 * The property that matters most is the failure one: a save that quietly did
 * nothing would leave someone believing they had recorded an allergy when
 * they had not. Everything else on this screen is ordinary form handling.
 *
 * All values below are invented.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { EmergencyCardEditScreen } from "@/screens/emergency/EmergencyCardEditScreen";
import { EMPTY_CARD, loadCard, saveCard } from "@/services/emergencyCard";

jest.mock("@/services/emergencyCard", () => {
  const actual = jest.requireActual("@/services/emergencyCard");
  return {
    ...actual,
    loadCard: jest.fn(),
    saveCard: jest.fn(),
    clearCard: jest.fn(),
  };
});

function renderScreen() {
  const goBack = jest.fn();
  render(
    <EmergencyCardEditScreen navigation={{ goBack } as any} route={{} as any} />
  );
  return { goBack };
}

describe("EmergencyCardEditScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadCard as jest.Mock).mockResolvedValue(EMPTY_CARD);
    (saveCard as jest.Mock).mockImplementation(async (card) => card);
  });

  it("opens with whatever is already on this device", async () => {
    (loadCard as jest.Mock).mockResolvedValue({
      ...EMPTY_CARD,
      allergies: "Placebillin",
    });

    renderScreen();

    expect(await screen.findByDisplayValue("Placebillin")).toBeTruthy();
  });

  it("saves what was typed and returns to the card", async () => {
    const { goBack } = renderScreen();

    fireEvent.changeText(
      await screen.findByPlaceholderText("e.g. O positive"),
      "O positive"
    );
    fireEvent.press(screen.getByText("Save my emergency card"));

    await waitFor(() => expect(saveCard).toHaveBeenCalled());
    expect((saveCard as jest.Mock).mock.calls[0][0].bloodType).toBe("O positive");
    await waitFor(() => expect(goBack).toHaveBeenCalled());
  });

  it("says so when the device refuses to save, and stays on the form", async () => {
    // Believing an allergy is recorded when it is not is the worst outcome
    // this screen has, so a refused write is never swallowed.
    (saveCard as jest.Mock).mockRejectedValue(new Error("storage-unavailable"));
    const { goBack } = renderScreen();

    fireEvent.press(await screen.findByText("Save my emergency card"));

    expect(await screen.findByText(/would not save your card/i)).toBeTruthy();
    expect(goBack).not.toHaveBeenCalled();
  });

  it("tells the user where the card is kept before they type into it", async () => {
    renderScreen();

    expect(await screen.findByText("Where this is kept")).toBeTruthy();
    expect(screen.getByText(/not sent to MedHelp's servers/i)).toBeTruthy();
    expect(screen.getByText(/shared or borrowed computer/i)).toBeTruthy();
  });

  it("offers free text rather than a menu of conditions", async () => {
    // MedHelp may not author a clinical vocabulary. There is no picker here,
    // and adding one would make the app the author of what counts as a
    // condition or an allergy.
    renderScreen();

    expect(await screen.findByText(/MedHelp does not check it/i)).toBeTruthy();
  });
});
