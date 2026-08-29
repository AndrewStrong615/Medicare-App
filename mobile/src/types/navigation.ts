import type { SymptomTopic } from "@/services/symptomService";

export type RootStackParamList = {
  // `accountCreated` is set by the sign-up flow so the sign-in screen can
  // confirm the account exists instead of appearing for no visible reason.
  Login: { accountCreated?: boolean } | undefined;
  Signup: undefined;
  Home: undefined;
  SymptomLookup: undefined;
  // Care guidance and the disclaimer travel with the topic so the detail
  // screen can never render medical content without them.
  SymptomDetail: {
    topic: SymptomTopic;
    careGuidance: string;
    disclaimer: string;
  };
  MedicationReminders: undefined;
};
