import type { Appointment } from "@/services/appointmentService";
import type { FollowUpRequest, IntakeAssessment } from "@/services/intakeService";
import type { ParsedLabel } from "@/services/labelParser";
import type { Medication } from "@/services/medicationService";
import type { Provider } from "@/services/providerService";

/**
 * Context carried from a symptom-intake result into the appointment flow, so
 * someone who has just described their symptoms does not type them again.
 *
 * `tier` is a label to display, never an input to anything. Nothing in the
 * appointment feature re-derives urgency from it, and nothing there may touch
 * the triage modules.
 */
export interface IntakeContext {
  reasonForVisit: string;
  tier: "EMERGENT" | "URGENT" | "SELF_CARE";
  assessmentId: string | null;
}

export type RootStackParamList = {
  // `accountCreated` is set by the sign-up flow so the sign-in screen can
  // confirm the account exists instead of appearing for no visible reason.
  Login: { accountCreated?: boolean } | undefined;
  Signup: undefined;
  Home: undefined;

  // Symptom intake and its urgency estimate.
  // `reset` clears the form. "Describe something else" on the result screen
  // navigates BACK to the screen instance already sitting in the stack, which
  // still holds the previous description in its own state — so starting a new
  // description has to be asked for explicitly rather than assumed from a
  // fresh mount that never happens.
  SymptomIntake: { reset?: boolean } | undefined;
  // Shown when the description was not understood. Carries the original text
  // and consent forward so the second submission is a complete one.
  IntakeFollowUp: {
    followUp: FollowUpRequest;
    description: string;
    consent: boolean;
    /**
     * Answers already given in earlier rounds. Carried forward so the next
     * submission is the whole picture — the server merges every answer into
     * the description it re-screens, and reads which round this is from the
     * ids present.
     */
    priorAnswers?: Record<string, string>;
  };
  // `description` is what the user actually wrote (with any follow-up answers
  // merged in). It is carried so the appointment flow can prefill the reason
  // for visit; the assessment itself does not include it.
  IntakeResult: { assessment: IntakeAssessment; description?: string };

  // Finding a provider and recording a visit.
  //
  // `intake` is present when the user arrived from a symptom-intake result,
  // and threads the reason for visit through to the request form.
  ProviderSearch: { intake?: IntakeContext } | undefined;
  ProviderDetail: { provider: Provider; intake?: IntakeContext };
  AppointmentRequest: { provider: Provider; intake?: IntakeContext };
  AppointmentConfirmation: { appointment: Appointment };
  // Carries an appointment **id**, never a BookingIdentity. Navigation state
  // is serialisable and can be persisted by dev tooling, so an id is safe to
  // put here and a date of birth is not. See `appointmentService`.
  BookingIdentity: { appointmentId: string; providerName: string };
  AppointmentList: undefined;

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
  /**
   * `savedFor` names the medication whose times were just saved, so the list
   * can confirm it. Only a display name - never anything that is not already
   * on the screen the user came from.
   */
  MedicationReminders: { savedFor?: string } | undefined;

  /** Choosing the reminder times for one medication. */
  ReminderEdit: { medicationId: string; medicationName: string };
};
