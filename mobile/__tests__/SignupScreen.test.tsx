import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SignupScreen } from "@/screens/auth/SignupScreen";
import { AuthError, signup } from "@/services/authService";

jest.mock("@/services/authService", () => {
  const actual = jest.requireActual("@/services/authService");
  return { ...actual, signup: jest.fn() };
});

const mockedSignup = signup as jest.MockedFunction<typeof signup>;

function renderSignupScreen() {
  const navigate = jest.fn();
  const replace = jest.fn();
  const navigation = { navigate, replace } as any;
  render(<SignupScreen navigation={navigation} route={{} as any} />);
  return { navigate, replace };
}

function fillCredentials(email = "new.synthetic@example.com", password = "fake-password-2") {
  fireEvent.changeText(screen.getByLabelText("Email"), email);
  fireEvent.changeText(screen.getByLabelText("Password"), password);
}

describe("SignupScreen", () => {
  beforeEach(() => {
    mockedSignup.mockReset();
  });

  it("renders email/password inputs and the sign-up button", () => {
    renderSignupScreen();

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByText("Sign up")).toBeTruthy();
  });

  it("navigates to Login when the log-in link is pressed", () => {
    const { navigate } = renderSignupScreen();

    fireEvent.press(screen.getByText("Already have an account? Log in"));

    expect(navigate).toHaveBeenCalledWith("Login");
  });

  it("signs up and hands the sign-in screen a confirmation to show", async () => {
    mockedSignup.mockResolvedValueOnce(undefined);
    const { replace } = renderSignupScreen();

    fillCredentials();
    fireEvent.press(screen.getByText("Sign up"));

    await waitFor(() => {
      expect(mockedSignup).toHaveBeenCalledWith("new.synthetic@example.com", "fake-password-2");
      expect(replace).toHaveBeenCalledWith("Login", { accountCreated: true });
    });
  });

  it("shows the server's explanation and does not navigate when signup fails", async () => {
    mockedSignup.mockRejectedValueOnce(new AuthError("Email already registered"));
    const { replace } = renderSignupScreen();

    fillCredentials("dupe.synthetic@example.com", "fake-password-3");
    fireEvent.press(screen.getByText("Sign up"));

    await waitFor(() => {
      expect(screen.getByText("Email already registered")).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects a too-short password before sending a request", () => {
    renderSignupScreen();

    fillCredentials("new.synthetic@example.com", "short");
    fireEvent.press(screen.getByText("Sign up"));

    expect(screen.getByText(/at least 8 characters/i)).toBeTruthy();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it("rejects a password longer than bcrypt can hash", () => {
    renderSignupScreen();

    fillCredentials("new.synthetic@example.com", "a".repeat(73));
    fireEvent.press(screen.getByText("Sign up"));

    expect(screen.getByText(/too long/i)).toBeTruthy();
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it("does not send a second request when the button is pressed twice", () => {
    // Stays pending for the whole test so the button is observed mid-request.
    mockedSignup.mockReturnValueOnce(new Promise<void>(() => {}));
    renderSignupScreen();

    fillCredentials();
    const button = screen.getByText("Sign up");
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockedSignup).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Creating account…")).toBeTruthy();
  });
});
