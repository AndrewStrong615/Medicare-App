import type { FollowUpRequest, IntakeAssessment } from "@/services/intakeService";
import type { Medication } from "@/services/medicationService";

export type RootStackParamList = {
  // `accountCreated` is set by the sign-up flow so the sign-in screen can
  // confirm the account exists instead of appearing for no visible reason.
  Login: { accountCreated?: boolean } | undefined;
  Signup: undefined;
  Home: undefined;

  // Symptom intake and its urgency estimate.
  SymptomIntake: undefined;
  // Shown when the description was not understood. Carries the original text
  // and consent forward so the second submission is a complete one.
  IntakeFollowUp: {
    followUp: FollowUpRequest;
    description: string;
    consent: boolean;
  };
  IntakeResult: { assessment: IntakeAssessment };

  MedicationList: undefined;
  // No `medication` means "add"; passing one means "edit that record".
  MedicationEdit: { medication?: Medication } | undefined;
  MedicationReminders: undefined;
};
