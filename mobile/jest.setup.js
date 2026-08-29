// Screens are wrapped in <Screen>, which reads safe-area insets. Tests render
// screens directly rather than inside the app's SafeAreaProvider, so use the
// mock the library ships for exactly this case.
//
// The shipped mock is a default export, so it has to be unwrapped — returning
// the module namespace directly leaves useSafeAreaInsets undefined.
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);
