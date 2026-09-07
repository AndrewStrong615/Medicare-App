/**
 * Health goals: propose, confirm, list, tick.
 *
 * A draft and a goal are separate calls on purpose. `draftGoal` writes nothing
 * on the server — it returns a proposal the person edits on screen — and
 * `createGoal` is the only thing that saves. Same read-then-confirm split as
 * medication reminders, and the reason is the same: MedHelp proposes times and
 * activities, the person decides.
 *
 * A draft can legitimately come back empty. No model configured, an outage, a
 * refusal, or an answer that failed the server's checks all arrive as no
 * activities plus a `notice` sentence written by the server. The screen shows
 * that sentence and an empty editor; it never invents rows of its own.
 */

import { apiRequest } from "@/services/apiClient";

export type Cadence = "daily" | "times_per_week" | "unspecified";
export type PreferredTime = "morning" | "afternoon" | "evening" | "unspecified";

/** Red-flag guidance. Rendered above everything else, never suppressed. */
export interface EmergencyGuidance {
  category: string;
  headline: string;
  action: string;
  matchedTerms: string[];
}

export interface DraftActivity {
  text: string;
  /**
   * The person's own words this row came from. Shown as evidence, and null
   * for a row MedHelp suggested — there is nothing to quote.
   */
  sourcePhrase: string | null;
  cadence: Cadence;
  timesPerWeek: number | null;
  quantityText: string | null;
  preferredTime: PreferredTime;
  /**
   * True when MedHelp proposed this rather than reading it out of what the
   * person wrote. The screen must label these: someone has to be able to tell
   * which lines are theirs.
   */
  generated: boolean;
}

export interface GoalDraft {
  title: string | null;
  activities: DraftActivity[];
  notice: string | null;
  emergency: EmergencyGuidance | null;
}

export interface GoalActivity {
  id: string;
  text: string;
  cadence: Cadence;
  timesPerWeek: number | null;
  quantityText: string | null;
  preferredTime: PreferredTime;
  /**
   * Whether the person ticked this on the day being shown.
   *
   * Not an adherence figure. False means nothing was ticked, which is not
   * evidence that anything was or was not done.
   */
  completedToday: boolean;
}

export interface HealthGoal {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  activities: GoalActivity[];
}

interface ApiActivity {
  id: string;
  text: string;
  cadence: Cadence;
  times_per_week: number | null;
  quantity_text: string | null;
  preferred_time: PreferredTime;
  completed_today: boolean;
}

interface ApiGoal {
  id: string;
  title: string;
  description: string;
  created_at: string;
  activities: ApiActivity[];
}

function toActivity(raw: ApiActivity): GoalActivity {
  return {
    id: raw.id,
    text: raw.text,
    cadence: raw.cadence,
    timesPerWeek: raw.times_per_week,
    quantityText: raw.quantity_text,
    preferredTime: raw.preferred_time,
    completedToday: raw.completed_today,
  };
}

function toGoal(raw: ApiGoal): HealthGoal {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    createdAt: raw.created_at,
    activities: (raw.activities ?? []).map(toActivity),
  };
}

/**
 * The person's own calendar day, as "YYYY-MM-DD".
 *
 * Built from the device clock rather than converted through UTC: "I did this
 * on Tuesday" must not move because someone travelled. Same rule as a reminder
 * time being a local wall clock.
 */
export function localDay(when: Date = new Date()): string {
  const month = `${when.getMonth() + 1}`.padStart(2, "0");
  const day = `${when.getDate()}`.padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

/** Propose activities from the person's text. Writes nothing. */
export async function draftGoal(description: string): Promise<GoalDraft> {
  const body = (await apiRequest("/goals/draft", {
    method: "POST",
    body: JSON.stringify({ description }),
    fallbackMessage: "We couldn't read that just now. You can add your activities below.",
  })) as {
    title: string | null;
    activities: Array<Omit<ApiActivity, "id" | "completed_today"> & {
      source_phrase: string | null;
      generated: boolean;
    }>;
    notice: string | null;
    emergency: {
      category: string;
      headline: string;
      action: string;
      matched_terms: string[];
    } | null;
  };

  return {
    title: body.title,
    activities: (body.activities ?? []).map((raw) => ({
      text: raw.text,
      sourcePhrase: raw.source_phrase,
      cadence: raw.cadence,
      timesPerWeek: raw.times_per_week,
      quantityText: raw.quantity_text,
      preferredTime: raw.preferred_time,
      generated: raw.generated ?? false,
    })),
    notice: body.notice,
    emergency: body.emergency
      ? {
          category: body.emergency.category,
          headline: body.emergency.headline,
          action: body.emergency.action,
          matchedTerms: body.emergency.matched_terms ?? [],
        }
      : null,
  };
}

export interface ActivityInput {
  text: string;
  cadence: Cadence;
  timesPerWeek: number | null;
  quantityText: string | null;
  preferredTime: PreferredTime;
}

/** Save what the person confirmed on screen. */
export async function createGoal(input: {
  title: string;
  description: string;
  activities: ActivityInput[];
}): Promise<HealthGoal> {
  const body = (await apiRequest("/goals", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      activities: input.activities.map((activity) => ({
        text: activity.text,
        cadence: activity.cadence,
        times_per_week: activity.cadence === "times_per_week" ? activity.timesPerWeek : null,
        quantity_text: activity.quantityText,
        preferred_time: activity.preferredTime,
      })),
    }),
    fallbackMessage: "We couldn't save that goal. Please try again.",
  })) as ApiGoal;
  return toGoal(body);
}

export async function listGoals(on: string = localDay()): Promise<HealthGoal[]> {
  const body = (await apiRequest(`/goals?on=${encodeURIComponent(on)}`, {
    method: "GET",
    fallbackMessage: "We couldn't load your goals right now.",
  })) as ApiGoal[];
  return (body ?? []).map(toGoal);
}

export async function setCompletion(
  goalId: string,
  activityId: string,
  completed: boolean,
  on: string = localDay()
): Promise<HealthGoal> {
  const body = (await apiRequest(
    `/goals/${goalId}/activities/${activityId}/completion`,
    {
      method: "POST",
      body: JSON.stringify({ completed_on: on, completed }),
      fallbackMessage: "We couldn't update that just now.",
    }
  )) as ApiGoal;
  return toGoal(body);
}

export async function deleteGoal(goalId: string): Promise<void> {
  await apiRequest(`/goals/${goalId}`, {
    method: "DELETE",
    fallbackMessage: "We couldn't delete that goal.",
  });
}
