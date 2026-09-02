/**
 * Medication reminder schedules.
 *
 * Two calls do different jobs and must not be confused:
 *
 * * `getSuggestion` asks what MedHelp *would* propose for a medication. It
 *   saves nothing, and a `recognised: false` answer is an ordinary result
 *   meaning "you choose the times", not a failure.
 * * `saveSchedule` records times the user has confirmed on screen.
 *
 * Nothing schedules a reminder except the user pressing save. See
 * `backend/app/services/dose_schedule.py` for why that separation exists.
 */

import { apiRequest, ApiError } from "@/services/apiClient";
import type { DueReminder } from "@/services/reminderTiming";

export { ApiError };

export interface Reminder {
  id: string;
  medicationId: string;
  /** "HH:MM", 24-hour, local wall-clock. */
  timeOfDay: string;
  enabled: boolean;
}

export interface MedicationSchedule {
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  /** The directions exactly as saved. Shown beside any suggested times. */
  frequency: string | null;
  reminders: Reminder[];
}

export interface ScheduleSuggestion {
  recognised: boolean;
  times: string[];
  dosesPerDay: number | null;
  /** Why nothing was proposed, in words meant for the user. */
  reason: string | null;
  frequency: string | null;
}

interface ApiReminder {
  id: string;
  medication_id: string;
  time_of_day: string;
  enabled: boolean;
}

interface ApiSchedule {
  medication_id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  reminders: ApiReminder[];
}

function reminderFromApi(item: ApiReminder): Reminder {
  return {
    id: item.id,
    medicationId: item.medication_id,
    timeOfDay: item.time_of_day,
    enabled: item.enabled !== false,
  };
}

function scheduleFromApi(item: ApiSchedule): MedicationSchedule {
  return {
    medicationId: item.medication_id,
    medicationName: item.medication_name,
    dosage: item.dosage,
    frequency: item.frequency,
    reminders: (item.reminders ?? []).map(reminderFromApi),
  };
}

export async function listSchedules(): Promise<MedicationSchedule[]> {
  const body = (await apiRequest("/reminders", {
    method: "GET",
    fallbackMessage: "We couldn't load your reminders right now. Please try again.",
  })) as ApiSchedule[];
  return (body ?? []).map(scheduleFromApi);
}

export async function getSuggestion(
  medicationId: string
): Promise<ScheduleSuggestion> {
  const body = (await apiRequest(
    `/reminders/medications/${encodeURIComponent(medicationId)}/suggestion`,
    {
      method: "GET",
      fallbackMessage: "We couldn't work out suggested times. You can set your own.",
    }
  )) as {
    recognised: boolean;
    times: string[];
    doses_per_day: number | null;
    reason: string | null;
    frequency: string | null;
  };

  return {
    recognised: body?.recognised === true,
    times: body?.times ?? [],
    dosesPerDay: body?.doses_per_day ?? null,
    reason: body?.reason ?? null,
    frequency: body?.frequency ?? null,
  };
}

export async function saveSchedule(
  medicationId: string,
  times: string[]
): Promise<MedicationSchedule> {
  const body = (await apiRequest(
    `/reminders/medications/${encodeURIComponent(medicationId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ times }),
      fallbackMessage: "We couldn't save those reminder times. Please try again.",
    }
  )) as ApiSchedule;
  return scheduleFromApi(body);
}

/**
 * Flatten the schedules into the individual alarms the notification layer
 * arms, dropping any the user has silenced.
 */
export function toDueReminders(schedules: MedicationSchedule[]): DueReminder[] {
  return schedules.flatMap((schedule) =>
    schedule.reminders
      .filter((reminder) => reminder.enabled)
      .map((reminder) => ({
        reminderId: reminder.id,
        medicationId: schedule.medicationId,
        medicationName: schedule.medicationName,
        dosage: schedule.dosage,
        timeOfDay: reminder.timeOfDay,
      }))
  );
}
