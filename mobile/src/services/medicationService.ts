/**
 * The user's medication list.
 *
 * Every call is authenticated: these records are health data and the API
 * scopes them to the signed-in user. Nothing here is cached to disk.
 */

import { API_BASE_URL, baseUrlIsTransportSafe } from "@/services/baseUrl";

import { getToken, logout } from "@/services/authService";

/**
 * When this medication is estimated to run out.
 *
 * ⛔ `isEstimate` is always true when there is a date at all, and every screen
 * that shows one must say so. The projection assumes each dose is taken
 * exactly on schedule; MedHelp does not track doses and must not imply it
 * can, so this can be wrong in both directions.
 *
 * `runOutOn: null` means no estimate is offered, with `reason` saying why in
 * words meant for the user. It is an ordinary outcome, not a failure, and the
 * UI must not fill the gap with a guess of its own.
 */
export interface RefillEstimate {
  runOutOn: string | null;
  daysRemaining: number | null;
  /** True when the run-out date is inside the lead time, or has passed. */
  alert: boolean;
  isEstimate: boolean;
  dosesPerDay: number | null;
  /** "entered" (the user typed it) or "reminders" (times they confirmed). */
  dosesPerDaySource: string | null;
  reason: string | null;
  leadDays: number;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  prescribingDoctor: string | null;
  refillDate: string | null;
  notes: string | null;
  quantityRemaining: number | null;
  quantityCountedOn: string | null;
  dosesPerDay: number | null;
  /**
   * A date the user wrote down, and the flags derived from it. Not the same
   * claim as `refillEstimate` below, which is arithmetic MedHelp does — one is
   * a record, the other is a guess, and they are kept apart deliberately.
   */
  refillDueSoon: boolean;
  refillOverdue: boolean;
  daysUntilRefill: number | null;
  refillEstimate: RefillEstimate;
}

export interface MedicationInput {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  prescribingDoctor?: string | null;
  refillDate?: string | null;
  notes?: string | null;
  quantityRemaining?: number | null;
  quantityCountedOn?: string | null;
  /**
   * ⛔ Typed by the user, never parsed out of `frequency`. Decoding printed
   * directions into a dose count is app-authored clinical content, and a wrong
   * expansion changes when someone takes a medicine. Left null, the server
   * falls back to the reminder times the user confirmed.
   */
  dosesPerDay?: number | null;
}

export class MedicationError extends Error {
  readonly isNetworkError: boolean;
  readonly isAuthError: boolean;

  constructor(
    message: string,
    options?: { isNetworkError?: boolean; isAuthError?: boolean }
  ) {
    super(message);
    this.name = "MedicationError";
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isAuthError = options?.isAuthError ?? false;
  }
}

const OFFLINE_MESSAGE =
  "Can't reach the MedHelp server. Check your internet connection and try again.";

function assertSecureBaseUrl(): void {
  // https anywhere, or plain http only to loopback/LAN. See `baseUrl.ts` —
  // the previous `__DEV__` test refused an exported build talking to a server
  // on your own network, which is exactly how this app is run on a phone.
  if (!baseUrlIsTransportSafe()) {
    throw new MedicationError(
      "MedHelp is not configured securely and can't load your medications. Please update the app."
    );
  }
}

function readDetail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const first = detail.find(
      (item) => typeof item === "object" && item !== null && "msg" in item
    ) as { msg?: unknown } | undefined;
    if (typeof first?.msg === "string") {
      return first.msg.replace(/^Value error,\s*/i, "");
    }
  }
  return null;
}

interface ApiRefillEstimate {
  run_out_on: string | null;
  days_remaining: number | null;
  alert: boolean;
  is_estimate: boolean;
  doses_per_day: number | null;
  doses_per_day_source: string | null;
  reason: string | null;
  lead_days: number;
}

interface ApiMedication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  prescribing_doctor: string | null;
  refill_date: string | null;
  notes: string | null;
  quantity_remaining: number | null;
  quantity_counted_on: string | null;
  doses_per_day: number | null;
  refill_due_soon: boolean;
  refill_overdue: boolean;
  days_until_refill: number | null;
  refill_estimate: ApiRefillEstimate;
}

/**
 * The shape an older server returns, before the estimate existed.
 *
 * Not defensive clutter: the web build is served as a separate service from
 * the API (see CLAUDE.md on the Render blueprint), so a deployed client can
 * outrun its backend by one restart. Without this the medication list would
 * crash on a missing field rather than simply offering no estimate.
 */
const NO_ESTIMATE: RefillEstimate = {
  runOutOn: null,
  daysRemaining: null,
  alert: false,
  isEstimate: false,
  dosesPerDay: null,
  dosesPerDaySource: null,
  reason: null,
  leadDays: 0,
};

function estimateFromApi(item: ApiRefillEstimate | undefined): RefillEstimate {
  if (!item) return NO_ESTIMATE;
  return {
    runOutOn: item.run_out_on,
    daysRemaining: item.days_remaining,
    alert: item.alert,
    isEstimate: item.is_estimate,
    dosesPerDay: item.doses_per_day,
    dosesPerDaySource: item.doses_per_day_source,
    reason: item.reason,
    leadDays: item.lead_days,
  };
}

function fromApi(item: ApiMedication): Medication {
  return {
    id: item.id,
    name: item.name,
    dosage: item.dosage,
    frequency: item.frequency,
    prescribingDoctor: item.prescribing_doctor,
    refillDate: item.refill_date,
    notes: item.notes,
    quantityRemaining: item.quantity_remaining ?? null,
    quantityCountedOn: item.quantity_counted_on ?? null,
    dosesPerDay: item.doses_per_day ?? null,
    refillDueSoon: item.refill_due_soon,
    refillOverdue: item.refill_overdue,
    daysUntilRefill: item.days_until_refill,
    refillEstimate: estimateFromApi(item.refill_estimate),
  };
}

function toApi(input: MedicationInput) {
  return {
    name: input.name,
    dosage: input.dosage ?? null,
    frequency: input.frequency ?? null,
    prescribing_doctor: input.prescribingDoctor ?? null,
    refill_date: input.refillDate ?? null,
    notes: input.notes ?? null,
    quantity_remaining: input.quantityRemaining ?? null,
    quantity_counted_on: input.quantityCountedOn ?? null,
    doses_per_day: input.dosesPerDay ?? null,
  };
}

async function request(
  path: string,
  init: RequestInit & { fallbackMessage: string }
): Promise<unknown> {
  assertSecureBaseUrl();

  const token = getToken();
  if (!token) {
    throw new MedicationError("Please sign in again to see your medications.", {
      isAuthError: true,
    });
  }

  const { fallbackMessage, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(rest.headers ?? {}),
      },
    });
  } catch {
    throw new MedicationError(OFFLINE_MESSAGE, { isNetworkError: true });
  }

  if (response.status === 204) return null;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Status decides the outcome below.
  }

  if (!response.ok) {
    if (response.status === 401) {
      // The token the server just refused is worthless, so drop it here
      // rather than leaving a dead session to be restored on the next launch.
      void logout();
      throw new MedicationError("Your session has expired. Please sign in again.", {
        isAuthError: true,
      });
    }
    throw new MedicationError(readDetail(body) ?? fallbackMessage);
  }

  return body;
}

/**
 * The user's medications, with the run-out estimate computed against
 * `leadDays`.
 *
 * The lead time is a device setting rather than an account one (see
 * `appSettings.ts`), so it is passed on every call rather than held server
 * -side. Omitting it takes the server's own default.
 */
export async function listMedications(leadDays?: number): Promise<Medication[]> {
  const query =
    leadDays === undefined
      ? ""
      : `?refill_lead_days=${encodeURIComponent(String(leadDays))}`;
  const body = await request(`/medications${query}`, {
    method: "GET",
    fallbackMessage: "We couldn't load your medications. Please try again in a moment.",
  });
  return ((body as ApiMedication[]) ?? []).map(fromApi);
}

export async function createMedication(input: MedicationInput): Promise<Medication> {
  const body = await request("/medications", {
    method: "POST",
    body: JSON.stringify(toApi(input)),
    fallbackMessage: "We couldn't save this medication. Please try again in a moment.",
  });
  return fromApi(body as ApiMedication);
}

export async function updateMedication(
  id: string,
  input: MedicationInput
): Promise<Medication> {
  const body = await request(`/medications/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(toApi(input)),
    fallbackMessage: "We couldn't save your changes. Please try again in a moment.",
  });
  return fromApi(body as ApiMedication);
}

export async function deleteMedication(id: string): Promise<void> {
  await request(`/medications/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallbackMessage: "We couldn't delete this medication. Please try again in a moment.",
  });
}
