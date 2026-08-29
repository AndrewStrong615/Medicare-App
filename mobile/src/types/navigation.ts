export type RootStackParamList = {
  // `accountCreated` is set by the sign-up flow so the sign-in screen can
  // confirm the account exists instead of appearing for no visible reason.
  Login: { accountCreated?: boolean } | undefined;
  Signup: undefined;
  Home: undefined;
  SymptomLookup: undefined;
  MedicationReminders: undefined;
};
