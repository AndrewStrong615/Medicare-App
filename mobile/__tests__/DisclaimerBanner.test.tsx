import { render, screen } from "@testing-library/react-native";

import { DisclaimerBanner } from "@/components/DisclaimerBanner";

describe("DisclaimerBanner", () => {
  it("renders a disclaimer directing users to consult a healthcare professional", () => {
    render(<DisclaimerBanner />);
    expect(screen.getByText(/consult a qualified healthcare professional/i)).toBeTruthy();
  });
});
