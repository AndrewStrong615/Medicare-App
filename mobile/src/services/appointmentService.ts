/**
 * The user's appointments.
 *
 * Every call is authenticated: these records are health data and the API
 * scopes them to the signed-in user. Nothing here is cached to disk.
 *
 * ## `requestAppointment` does not contact anybody
 *
 * It writes a row in MedHelp and returns it. MedHelp has no BAA-covered
 * channel to a provider, so nothing is faxed, emailed or posted to a booking
 * API — see `backend/app/services/request_delivery.py`. The server always
 * returns `providerNotified: false`, and screens must say so plainly rather
 * than letting "request sent" imply a clinic received something.
 */

import { apiRequest, ApiError } from "@/services/apiClient";

export { ApiError };

export type AppointmentStatus =
  | "REQUESTED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";

export interface Appointment {
  id: string;
  providerName: string;
  providerNpi: string | null;
  providerSpecialty: string | null;
  providerPhone: string | null;
  providerAddress: string | null;
  reasonForVisit: string | null;
  preferredTime: string | null;
  urgencyTier: string | null;
  sourceAssessmentId: string | null;
  notes: string | null;
  status: AppointmentStatus;
  /**
   * Whether MedHelp actually transmitted this to the provider. Always false
   * today. Read this — never infer it from `status`, which the user can set
   * to SCHEDULED after booking by phone themselves.
   */
  providerNotified: boolean;
  createdAt: string;
}

export interface AppointmentInput {
  providerName: string;
  providerNpi?: string | null;
  providerSpecialty?: string | null;
  providerPhone?: string | null;
  providerAddress?: string | null;
  reasonForVisit?: string | null;
  preferredTime?: string | null;
  urgencyTier?: string | null;
  sourceAssessmentId?: string | null;
  notes?: string | null;
}

interface ApiAppointment {
  id: string;
  provider_name: string;
  provider_npi: string | null;
  provider_specialty: string | null;
  provider_phone: string | null;
  provider_address: string | null;
  reason_for_visit: string | null;
  preferred_time: string | null;
  urgency_tier: string | null;
  source_assessment_id: string | null;
  notes: string | null;
  status: AppointmentStatus;
  delivery_state: string;
  provider_notified: boolean;
  created_at: string;
}

function fromApi(item: ApiAppointment): Appointment {
  return {
    id: item.id,
    providerName: item.provider_name,
    providerNpi: item.provider_npi,
    providerSpecialty: item.provider_specialty,
    providerPhone: item.provider_phone,
    providerAddress: item.provider_address,
    reasonForVisit: item.reason_for_visit,
    preferredTime: item.preferred_time,
    urgencyTier: item.urgency_tier,
    sourceAssessmentId: item.source_assessment_id,
    notes: item.notes,
    status: item.status,
    providerNotified: item.provider_notified === true,
    createdAt: item.created_at,
  };
}

function toApi(input: AppointmentInput) {
  return {
    provider_name: input.providerName,
    provider_npi: input.providerNpi ?? null,
    provider_specialty: input.providerSpecialty ?? null,
    provider_phone: input.providerPhone ?? null,
    provider_address: input.providerAddress ?? null,
    reason_for_visit: input.reasonForVisit ?? null,
    preferred_time: input.preferredTime ?? null,
    urgency_tier: input.urgencyTier ?? null,
    source_assessment_id: input.sourceAssessmentId ?? null,
    notes: input.notes ?? null,
  };
}

export async function listAppointments(): Promise<Appointment[]> {
  const body = await apiRequest("/appointments", {
    method: "GET",
    fallbackMessage:
      "We couldn't load your appointments. Please try again in a moment.",
  });
  return ((body as ApiAppointment[]) ?? []).map(fromApi);
}

/**
 * Record an appointment the user intends to attend.
 *
 * Named "request", not "book", because that is what it is.
 */
export async function requestAppointment(
  input: AppointmentInput
): Promise<Appointment> {
  const body = await apiRequest("/appointments", {
    method: "POST",
    body: JSON.stringify(toApi(input)),
    fallbackMessage:
      "We couldn't save this appointment. Please try again in a moment.",
  });
  return fromApi(body as ApiAppointment);
}

export async function updateAppointment(
  id: string,
  update: {
    status: AppointmentStatus;
    preferredTime?: string | null;
    notes?: string | null;
  }
): Promise<Appointment> {
  const body = await apiRequest(`/appointments/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({
      status: update.status,
      preferred_time: update.preferredTime ?? null,
      notes: update.notes ?? null,
    }),
    fallbackMessage:
      "We couldn't save your changes. Please try again in a moment.",
  });
  return fromApi(body as ApiAppointment);
}

export async function deleteAppointment(id: string): Promise<void> {
  await apiRequest(`/appointments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackMessage:
      "We couldn't delete this appointment. Please try again in a moment.",
  });
}

/**
 * Patient identity for one booking attempt.
 *
 * ## Never stored, never navigated, never logged
 *
 * A scheduling API cannot book without identifying the patient to the clinic.
 * MedHelp's answer is pass-through: this is built in a form's component state,
 * handed to `submitBooking`, and dropped when the screen unmounts.
 *
 * Rules that must hold wherever this type appears:
 *
 * * **Never put one in navigation params.** React Navigation state is
 *   serialisable and can be persisted or logged by dev tooling, so a date of
 *   birth in a route param is a date of birth written to disk.
 * * Never write it to `AsyncStorage`, `SecureStore`, or a module-level
 *   variable that outlives the screen.
 * * Never include it in an error report. `ApiError` messages come from the
 *   server, which does not echo it back.
 *
 * The user retypes this per booking. That is the accepted cost of not holding
 * a table of names, dates of birth and home addresses.
 */
export interface BookingIdentity {
  firstName: string;
  lastName: string;
  /** ISO `YYYY-MM-DD`. */
  dateOfBirth: string;
  sexAssignedAtBirth: "FEMALE" | "MALE" | "INTERSEX" | "UNSPECIFIED";
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  patientType: "NEW" | "EXISTING";
}

/**
 * Whether MedHelp can send a request to a provider at all.
 *
 * Always false today. The identity form is unreachable while it is, so the
 * fields a booking needs are never collected — there is nowhere to send them,
 * and collecting the most sensitive data in the app for no purpose would be
 * strictly worse than not having the screen.
 */
export async function getBookingCapability(): Promise<boolean> {
  const body = await apiRequest("/appointments/capabilities", {
    method: "GET",
    fallbackMessage: "We couldn't check whether booking is available.",
  });
  return (body as { online_booking?: boolean })?.online_booking === true;
}

/**
 * Send an appointment to its provider. Currently always fails with a 503 —
 * see `backend/app/services/request_delivery.py`.
 *
 * `identity` is passed straight through to the request body and is not
 * retained here.
 */
export async function submitBooking(
  id: string,
  identity: BookingIdentity
): Promise<Appointment> {
  const body = await apiRequest(
    `/appointments/${encodeURIComponent(id)}/submit`,
    {
      method: "POST",
      body: JSON.stringify({
        first_name: identity.firstName,
        last_name: identity.lastName,
        date_of_birth: identity.dateOfBirth,
        sex_assigned_at_birth: identity.sexAssignedAtBirth,
        phone: identity.phone,
        email: identity.email,
        address_line: identity.addressLine,
        city: identity.city,
        state: identity.state,
        postal_code: identity.postalCode,
        patient_type: identity.patientType,
      }),
      fallbackMessage:
        "We couldn't send this request. Please call the provider to arrange a time.",
    }
  );
  return fromApi(body as ApiAppointment);
}
