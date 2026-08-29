import type { FollowUpRequest, IntakeAssessment } from "@/services/intakeService";
import type { ParsedLabel } from "@/services/labelParser";
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
  // Reads a prescription label with the camera. It only ever prefills the
  // form below — it never saves a medication itself.
  MedicationScan: undefined;
  // No `medication` means "add"; passing one means "edit that record".
  // `scanned` prefills the form from a label photo, and is always reviewed by
  // the user before it can be saved.
  MedicationEdit:
    | { medication?: Medication; scanned?: ParsedLabel }
    | undefined;
  MedicationReminders: undefined;
};
