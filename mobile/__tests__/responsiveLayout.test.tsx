import { Dimensions } from "react-native";
import { render, screen } from "@testing-library/react-native";

import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/auth/LoginScreen";
import { BREAKPOINT } from "@/theme";

jest.mock("@/services/authService", () => ({
  logout: jest.fn(async () => undefined),
  login: jest.fn(async () => undefined),
}));

// The home screen looks up the inline appointment line. These tests are about
// layout, so it answers with nothing — the shape of the screen is the same
// either way, and a real request would be a network call in a unit test.
jest.mock("@/services/appointmentService", () => ({
  listAppointments: jest.fn(async () => []),
}));

// `useFocusEffect` needs a navigator, and these screens are rendered on their
// own. Running the effect as a mount effect is what every other screen suite
// here does.
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(effect, []);
  },
}));

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

function renderHome() {
  const navigation = { navigate: jest.fn(), reset: jest.fn() } as any;
  render(<HomeScreen navigation={navigation} route={{} as any} />);
}

function renderLogin() {
  const navigation = { navigate: jest.fn(), replace: jest.fn() } as any;
  render(<LoginScreen navigation={navigation} route={{ params: undefined } as any} />);
}

describe("home screen at different window widths", () => {
  it.each([
    ["a phone", 390],
    ["a half-width browser window", BREAKPOINT.medium],
    ["a full-size browser window", BREAKPOINT.expanded + 360],
  ])("shows every destination and the scope note on %s", (_label, width) => {
    setWindowWidth(width);
    renderHome();

    // Not `getByText`: the wide hero repeats this one as a call to action, so
    // on a desktop window there are legitimately two of them.
    expect(screen.getAllByText("Not feeling well?").length).toBeGreaterThan(0);
    expect(screen.getByText("Add medication")).toBeTruthy();
    expect(screen.getByText("Upcoming appointments")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
    expect(screen.getByText("Emergency card")).toBeTruthy();
    expect(screen.getByText(/does not diagnose conditions/i)).toBeTruthy();
  });

  it("fills the width with statements about the app, not about the user", () => {
    // The panel exists to use the space a browser window has and a phone does
    // not. What may go in it is fenced: nothing clinical, and no number about
    // the user's health — MedHelp does not know whether a dose was taken, and
    // a tile claiming otherwise would invent a clinical fact.
    //
    // One panel now rather than three. "How MedHelp works" and "Where your
    // information goes" moved to `MoreScreen` when the home screen was
    // consolidated; this one stayed, because it restates App Scope and that
    // is what is worth saying on the way in.
    setWindowWidth(BREAKPOINT.expanded + 360);
    renderHome();

    expect(screen.getByText("WHAT MEDHELP WILL NOT DO")).toBeTruthy();
    expect(screen.getByText(/It does not diagnose, and never names a condition/i)).toBeTruthy();
    expect(screen.queryByText("HOW MEDHELP WORKS")).toBeNull();
    expect(screen.queryByText("WHERE YOUR INFORMATION GOES")).toBeNull();
  });

  it("keeps those statements on a phone rather than hiding them with the layout", () => {
    // A narrower screen is not a reason to stop saying what the app does not
    // do. The wide layout rearranges this panel; it does not add it.
    //
    // Consolidating the home screen moved two panels to `MoreScreen`; it
    // deliberately did not drop this one below the breakpoint, which would
    // have quietly made the scope statement a desktop-only feature.
    setWindowWidth(390);
    renderHome();

    expect(screen.getByText("WHAT MEDHELP WILL NOT DO")).toBeTruthy();
    expect(screen.getByText(/does not contact a clinic/i)).toBeTruthy();
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
