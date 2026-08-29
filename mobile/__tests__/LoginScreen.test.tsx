import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { LoginScreen } from "@/screens/auth/LoginScreen";
import { AuthError, login } from "@/services/authService";

// requireActual keeps the real AuthError class, which the screen uses in an
// `instanceof` check to tell "server said no" from "couldn't reach server".
jest.mock("@/services/authService", () => {
  const actual = jest.requireActual("@/services/authService");
  return { ...actual, login: jest.fn() };
});

const mockedLogin = login as jest.MockedFunction<typeof login>;

function renderLoginScreen(params?: { accountCreated?: boolean }) {
  const navigate = jest.fn();
  const replace = jest.fn();
  const navigation = { navigate, replace } as any;
  render(<LoginScreen navigation={navigation} route={{ params } as any} />);
  return { navigate, replace };
}

function fillCredentials(email = "synthetic.user@example.com", password = "fake-password-1") {
  fireEvent.changeText(screen.getByLabelText("Email"), email);
  fireEvent.changeText(screen.getByLabelText("Password"), password);
}

describe("LoginScreen", () => {
  beforeEach(() => {
    mockedLogin.mockReset();
  });

  it("renders email/password inputs and the login button", () => {
    renderLoginScreen();

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByText("Log in")).toBeTruthy();
  });

  it("navigates to Signup when the sign-up link is pressed", () => {
    const { navigate } = renderLoginScreen();

    fireEvent.press(screen.getByText("Need an account? Sign up"));

    expect(navigate).toHaveBeenCalledWith("Signup");
  });

  it("logs in with entered credentials and replaces with Home on success", async () => {
    mockedLogin.mockResolvedValueOnce({ accessToken: "fake-token-123" });
    const { replace } = renderLoginScreen();

    fillCredentials();
    fireEvent.press(screen.getByText("Log in"));

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith("synthetic.user@example.com", "fake-password-1");
      expect(replace).toHaveBeenCalledWith("Home");
    });
  });

  it("shows the server's explanation and does not navigate when login fails", async () => {
    mockedLogin.mockRejectedValueOnce(new AuthError("Invalid email or password"));
    const { replace } = renderLoginScreen();

    fillCredentials("synthetic.user@example.com", "wrong-password");
    fireEvent.press(screen.getByText("Log in"));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("validates the email before sending a request", () => {
    renderLoginScreen();

    fillCredentials("not-an-email", "fake-password-1");
    fireEvent.press(screen.getByText("Log in"));

    expect(screen.getByText(/doesn't look like an email address/i)).toBeTruthy();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("asks for a password rather than submitting an empty one", () => {
    renderLoginScreen();

    fireEvent.changeText(screen.getByLabelText("Email"), "synthetic.user@example.com");
    fireEvent.press(screen.getByText("Log in"));

    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("offers a retry when the server could not be reached", async () => {
    mockedLogin.mockRejectedValueOnce(
      new AuthError("Can't reach the MedHelp server.", { isNetworkError: true })
    );
    renderLoginScreen();

    fillCredentials();
    fireEvent.press(screen.getByText("Log in"));

    await waitFor(() => {
      expect(screen.getByText("Can't reach the MedHelp server.")).toBeTruthy();
    });
    // A wrong password should not offer retry, but an unreachable server should.
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("does not send a second request when the button is pressed twice", () => {
    // Stays pending for the whole test so the button is observed mid-request.
    mockedLogin.mockReturnValueOnce(new Promise(() => {}));
    renderLoginScreen();

    fillCredentials();
    const button = screen.getByText("Log in");
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockedLogin).toHaveBeenCalledTimes(1);
    // And the button says what it's doing rather than looking untouched.
    expect(screen.getByText("Signing in…")).toBeTruthy();
  });

  it("confirms the account was created when arriving from sign-up", () => {
    renderLoginScreen({ accountCreated: true });

    expect(screen.getByText(/your account is ready/i)).toBeTruthy();
  });
});
