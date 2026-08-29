import type { EmergencyGuidance, SymptomTopic } from "@/services/symptomService";

export type RootStackParamList = {
  // `accountCreated` is set by the sign-up flow so the sign-in screen can
  // confirm the account exists instead of appearing for no visible reason.
  Login: { accountCreated?: boolean } | undefined;
  Signup: undefined;
  Home: undefined;
  SymptomLookup: undefined;
  // Care guidance and the disclaimer travel with the topic so the detail
  // screen can never render medical content without them. Emergency guidance
  // travels too: someone who searched "chest pain" must not lose the
  // instruction to call 911 simply by tapping into an article.
  SymptomDetail: {
    topic: SymptomTopic;
    careGuidance: string;
    disclaimer: string;
    emergency: EmergencyGuidance | null;
  };
  MedicationReminders: undefined;
};
