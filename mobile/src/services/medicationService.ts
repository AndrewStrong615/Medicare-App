/**
 * The user's medication list.
 *
 * Every call is authenticated: these records are health data and the API
 * scopes them to the signed-in user. Nothing here is cached to disk.
 */

import { getToken } from "@/services/authService";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  prescribingDoctor: string | null;
  refillDate: string | null;
  notes: string | null;
  refillDueSoon: boolean;
  refillOverdue: boolean;
  daysUntilRefill: number | null;
}

export interface MedicationInput {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  prescribingDoctor?: string | null;
  refillDate?: string | null;
  notes?: string | null;
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
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDev && !API_BASE_URL.startsWith("https://")) {
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

interface ApiMedication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  prescribing_doctor: string | null;
  refill_date: string | null;
  notes: string | null;
  refill_due_soon: boolean;
  refill_overdue: boolean;
  days_until_refill: number | null;
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
    refillDueSoon: item.refill_due_soon,
    refillOverdue: item.refill_overdue,
    daysUntilRefill: item.days_until_refill,
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
      throw new MedicationError("Your session has expired. Please sign in again.", {
        isAuthError: true,
      });
    }
    throw new MedicationError(readDetail(body) ?? fallbackMessage);
  }

  return body;
}

export async function listMedications(): Promise<Medication[]> {
  const body = await request("/medications", {
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
