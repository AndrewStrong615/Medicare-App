import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { LoginScreen } from "@/screens/auth/LoginScreen";
import { login } from "@/services/authService";

jest.mock("@/services/authService", () => ({
  login: jest.fn(),
}));

const mockedLogin = login as jest.MockedFunction<typeof login>;

function renderLoginScreen() {
  const navigate = jest.fn();
  const replace = jest.fn();
  const navigation = { navigate, replace } as any;
  render(<LoginScreen navigation={navigation} route={{} as any} />);
  return { navigate, replace };
}

describe("LoginScreen", () => {
  beforeEach(() => {
    mockedLogin.mockReset();
  });

  it("renders email/password inputs and the login button", () => {
    renderLoginScreen();

    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
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

    fireEvent.changeText(screen.getByPlaceholderText("Email"), "synthetic.user@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "fake-password-1");
    fireEvent.press(screen.getByText("Log in"));

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith("synthetic.user@example.com", "fake-password-1");
      expect(replace).toHaveBeenCalledWith("Home");
    });
  });

  it("shows an error message and does not navigate when login fails", async () => {
    mockedLogin.mockRejectedValueOnce(new Error("Login failed"));
    const { replace } = renderLoginScreen();

    fireEvent.changeText(screen.getByPlaceholderText("Email"), "synthetic.user@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "wrong-password");
    fireEvent.press(screen.getByText("Log in"));

    await waitFor(() => {
      expect(screen.getByText(/login failed/i)).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
