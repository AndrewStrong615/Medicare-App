import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SignupScreen } from "@/screens/auth/SignupScreen";
import { signup } from "@/services/authService";

jest.mock("@/services/authService", () => ({
  signup: jest.fn(),
}));

const mockedSignup = signup as jest.MockedFunction<typeof signup>;

function renderSignupScreen() {
  const navigate = jest.fn();
  const replace = jest.fn();
  const navigation = { navigate, replace } as any;
  render(<SignupScreen navigation={navigation} route={{} as any} />);
  return { navigate, replace };
}

describe("SignupScreen", () => {
  beforeEach(() => {
    mockedSignup.mockReset();
  });

  it("renders email/password inputs and the sign-up button", () => {
    renderSignupScreen();

    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    expect(screen.getByText("Sign up")).toBeTruthy();
  });

  it("navigates to Login when the log-in link is pressed", () => {
    const { navigate } = renderSignupScreen();

    fireEvent.press(screen.getByText("Already have an account? Log in"));

    expect(navigate).toHaveBeenCalledWith("Login");
  });

  it("signs up with entered credentials and replaces with Login on success", async () => {
    mockedSignup.mockResolvedValueOnce(undefined);
    const { replace } = renderSignupScreen();

    fireEvent.changeText(screen.getByPlaceholderText("Email"), "new.synthetic@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "fake-password-2");
    fireEvent.press(screen.getByText("Sign up"));

    await waitFor(() => {
      expect(mockedSignup).toHaveBeenCalledWith("new.synthetic@example.com", "fake-password-2");
      expect(replace).toHaveBeenCalledWith("Login");
    });
  });

  it("shows an error message and does not navigate when signup fails", async () => {
    mockedSignup.mockRejectedValueOnce(new Error("Signup failed"));
    const { replace } = renderSignupScreen();

    fireEvent.changeText(screen.getByPlaceholderText("Email"), "dupe.synthetic@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "fake-password-3");
    fireEvent.press(screen.getByText("Sign up"));

    await waitFor(() => {
      expect(screen.getByText(/signup failed/i)).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
