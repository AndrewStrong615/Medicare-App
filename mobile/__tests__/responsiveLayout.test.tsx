import { Dimensions } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";

import { TodayScreen } from "@/screens/TodayScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { BREAKPOINT } from "@/theme";

jest.mock("@/services/authService", () => ({
  logout: jest.fn(async () => undefined),
  login: jest.fn(async () => undefined),
}));

// Today reads the user's own three lists. They are empty here on purpose: this
// suite is about which panels the layout keeps at each width, not about
// content, and an empty account is the case where the panels have most room.
jest.mock("@/services/medicationService", () => ({
  ...jest.requireActual("@/services/medicationService"),
  listMedications: jest.fn(async () => []),
}));
jest.mock("@/services/reminderService", () => ({
  ...jest.requireActual("@/services/reminderService"),
  listSchedules: jest.fn(async () => []),
}));
jest.mock("@/services/appointmentService", () => ({
  ...jest.requireActual("@/services/appointmentService"),
  listAppointments: jest.fn(async () => []),
}));
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});

/**
 * The layout changes shape at a window width, so these tests set one.
 *
 * `useWindowDimensions` seeds its state from `Dimensions.get("window")` on
 * first render, which is why stubbing that is enough — there is no resize
 * event to fire. Every other suite renders at the preset's default phone
 * width and therefore exercises the compact layout, which is the point: the
 * wide layouts are additions, and nothing about the phone changed.
 */
function setWindowWidth(width: number) {
  jest
    .spyOn(Dimensions, "get")
    .mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 } as never);
}

afterEach(() => {
  jest.restoreAllMocks();
});

function renderToday() {
  const navigation = { navigate: jest.fn(), reset: jest.fn() } as any;
  render(<TodayScreen navigation={navigation} route={{} as any} />);
}

function renderLogin() {
  const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
  render(<LoginScreen navigation={navigation} route={{ params: undefined } as any} />);
}

describe("today screen at different window widths", () => {
  it.each([
    ["a phone", 390],
    ["a half-width browser window", BREAKPOINT.medium],
    ["a full-size browser window", BREAKPOINT.expanded + 360],
  ])("keeps every destination and the scope note reachable on %s", async (_label, width) => {
    setWindowWidth(width);
    renderToday();

    // The destinations are persistent navigation now rather than four cards on
    // one screen, so they are present at every width — a bottom tab bar below
    // `expanded`, a rail above it.
    await waitFor(() => expect(screen.getByText("Symptoms")).toBeTruthy());
    expect(screen.getByText("Medications")).toBeTruthy();
    expect(screen.getByText("Care")).toBeTruthy();
    expect(screen.getAllByText("Check my symptoms").length).toBeGreaterThan(0);
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.getByText(/does not diagnose conditions/i)).toBeTruthy();
  });

  it("fills the width with statements about the app, not about the user", async () => {
    // The panels exist to use the space a browser window has and a phone does
    // not. What may go in them is fenced: nothing clinical, and no number
    // about the user's health — MedHelp does not know whether a dose was
    // taken, and a tile claiming otherwise would invent a clinical fact.
    setWindowWidth(BREAKPOINT.expanded + 360);
    renderToday();

    await waitFor(() => expect(screen.getByText("WHAT MEDHELP WILL NOT DO")).toBeTruthy());
    expect(screen.getByText("WHERE YOUR INFORMATION GOES")).toBeTruthy();
    expect(screen.getByText(/It does not diagnose, and never names a condition/i)).toBeTruthy();
    expect(screen.getByText(/has not been reviewed by a clinician/i)).toBeTruthy();
  });

  it("keeps those statements on a phone rather than hiding them with the layout", async () => {
    // A narrower screen is not a reason to stop saying what the app does not
    // do. The wide layout rearranges these panels; it does not add them.
    setWindowWidth(390);
    renderToday();

    await waitFor(() => expect(screen.getByText("WHAT MEDHELP WILL NOT DO")).toBeTruthy());
    expect(screen.getByText(/does not contact a clinic/i)).toBeTruthy();
  });

  it("moves sign-out into the rail rather than showing it twice", async () => {
    // One place at a time: the rail carries it on a wide window and the screen
    // body carries it on a narrow one. Two would be two things to explain.
    setWindowWidth(BREAKPOINT.expanded + 360);
    renderToday();

    await waitFor(() => expect(screen.getByText("Sign out")).toBeTruthy());
    expect(screen.getAllByText("Sign out")).toHaveLength(1);
  });
});

describe("sign-in at different window widths", () => {
  it("is the form alone on a phone", () => {
    setWindowWidth(390);
    renderLogin();

    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.queryByText("YOUR HEALTH COMPANION")).toBeNull();
  });

  it("explains what the app is beside the form in a wide window", () => {
    // The public link opens here, so this is the screen a first-time visitor
    // sees. The panel restates copy the home screen already shows rather than
    // making a claim that signing in would then contradict.
    setWindowWidth(BREAKPOINT.expanded + 360);
    renderLogin();

    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByText("YOUR HEALTH COMPANION")).toBeTruthy();
    expect(screen.getByText(/does not diagnose\s+conditions or recommend treatment/i)).toBeTruthy();
  });
});
