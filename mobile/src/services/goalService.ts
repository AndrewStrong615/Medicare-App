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

/**
 * The days a planned activity falls on.
 *
 * Week order, and lowercase, matching the server's `DAYS`. The screens
 * capitalise for display rather than storing a second spelling.
 */
export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Day = (typeof DAYS)[number];

/** Mon, Tue, … for a chip or a schedule line. */
export function shortDay(day: Day): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3);
}

/**
 * Which day of the week a date is, as one of `DAYS`.
 *
 * Read off the device's own calendar day, not through UTC — the same rule as
 * `localDay` below. A plan that said Tuesday must not read as Monday because
 * someone is west of Greenwich.
 */
export function dayOfWeek(when: Date = new Date()): Day {
  // getDay() is 0 = Sunday; DAYS starts on Monday.
  return DAYS[(when.getDay() + 6) % 7];
}

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
  /**
   * The proposed daily schedule.
   *
   * A planned row carries both; a row read out of the person's own words
   * carries neither, because a clock time MedHelp invented would be a
   * quantity the person never wrote. Either may be empty and the editor
   * handles that — an activity with no schedule is a valid activity.
   */
  days: Day[];
  /** Local wall-clock "HH:MM", never a UTC instant. */
  timeOfDay: string | null;
  /**
   * One or two sentences on how to do this on the day.
   *
   * Never what it will do for the person — that is a claim MedHelp may not
   * make, and the prompt forbids it. Null on a row read out of the person's
   * own words, which may not gain sentences nobody wrote.
   */
  detail: string | null;
  evidence: Evidence | null;
  /**
   * The id behind `evidence`, carried so a confirmed plan can be posted back
   * with its citation intact. Only the id travels — never the quotation.
   */
  evidenceDomain: string | null;
}

/**
 * Published guidance a row is attributed to, assembled by the server.
 *
 * ⛔ `caveat` is sent with every citation and MUST be rendered with it. A
 * government publisher's name under a MedHelp-written row reads as approval of
 * that row, and nothing here has been approved by anybody — the caveat is the
 * only thing standing between attribution and an endorsement the app has not
 * earned. Never render `publisher`, `document` or `quote` without it, and
 * never reword it here: it is reviewed copy and it comes from the server for
 * the same reason the refusal sentences do.
 *
 * Null for any row MedHelp could not attribute, which is an ordinary outcome
 * and renders as nothing at all — never as a nearest-looking source.
 */
export interface Evidence {
  publisher: string;
  document: string;
  url: string;
  /** Verbatim from the document. Never trimmed, never paraphrased. */
  quote: string;
  caveat: string;
}

export interface GoalDraft {
  title: string | null;
  activities: DraftActivity[];
  notice: string | null;
  emergency: EmergencyGuidance | null;
  /**
   * How big the planner read the goal to be: "small" | "moderate" | "major".
   *
   * ⛔ DO NOT RENDER THIS. It is here so the behaviour is inspectable, not so
   * a screen can tell somebody their goal is major — MedHelp does not judge
   * whether a goal is realistic or ambitious. The shape of the plan is how the
   * reading shows.
   */
  complexity: string | null;
}

export interface GoalActivity {
  id: string;
  text: string;
  cadence: Cadence;
  timesPerWeek: number | null;
  quantityText: string | null;
  preferredTime: PreferredTime;
  /** Week-ordered day names. Empty means no particular day. */
  days: Day[];
  /** Local wall-clock "HH:MM", or null for no particular time. */
  timeOfDay: string | null;
  /**
   * Whether the person ticked this on the day being shown.
   *
   * Not an adherence figure. False means nothing was ticked, which is not
   * evidence that anything was or was not done.
   */
  completedToday: boolean;
  detail: string | null;
  evidence: Evidence | null;
}

export interface HealthGoal {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  activities: GoalActivity[];
}

interface ApiEvidence {
  publisher: string;
  document: string;
  url: string;
  quote: string;
  caveat: string;
}

interface ApiActivity {
  id: string;
  text: string;
  cadence: Cadence;
  times_per_week: number | null;
  quantity_text: string | null;
  preferred_time: PreferredTime;
  days: Day[] | null;
  time_of_day: string | null;
  completed_today: boolean;
  detail: string | null;
  evidence: ApiEvidence | null;
}

interface ApiGoal {
  id: string;
  title: string;
  description: string;
  created_at: string;
  activities: ApiActivity[];
}

/**
 * Day names the client recognises, in week order.
 *
 * Filtered rather than trusted: an unrecognised value would reach a schedule
 * line as a day nobody can act on, and ordering here means a schedule reads
 * the same whatever order it arrived in.
 */
function toDays(raw: string[] | null | undefined): Day[] {
  if (!raw) return [];
  const named = new Set(raw.map((day) => day.toLowerCase()));
  return DAYS.filter((day) => named.has(day));
}

/**
 * A citation, or nothing.
 *
 * ⛔ A citation with no caveat is dropped rather than shown. The caveat is
 * what stops a publisher's name reading as approval of a MedHelp-written row,
 * so a response missing it is a response this screen must not render — an
 * older server is a reason to show no citation, never a reason to show a bare
 * one.
 */
function toEvidence(raw: ApiEvidence | null | undefined): Evidence | null {
  if (!raw || !raw.url || !raw.quote || !raw.caveat) return null;
  return {
    publisher: raw.publisher,
    document: raw.document,
    url: raw.url,
    quote: raw.quote,
    caveat: raw.caveat,
  };
}

function toActivity(raw: ApiActivity): GoalActivity {
  return {
    id: raw.id,
    text: raw.text,
    cadence: raw.cadence,
    timesPerWeek: raw.times_per_week,
    quantityText: raw.quantity_text,
    preferredTime: raw.preferred_time,
    days: toDays(raw.days),
    timeOfDay: raw.time_of_day ?? null,
    completedToday: raw.completed_today,
    detail: raw.detail ?? null,
    evidence: toEvidence(raw.evidence),
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
      evidence_domain: string | null;
    }>;
    notice: string | null;
    complexity: string | null;
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
      days: toDays(raw.days),
      timeOfDay: raw.time_of_day ?? null,
      detail: raw.detail ?? null,
      evidence: toEvidence(raw.evidence),
      evidenceDomain: raw.evidence_domain ?? null,
    })),
    notice: body.notice,
    complexity: body.complexity ?? null,
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
  days: Day[];
  timeOfDay: string | null;
  detail: string | null;
  /**
   * The id of the guidance this row was attributed to, or null.
   *
   * ⛔ Only the id travels. The publisher, quotation and link are the server's,
   * so this app can never save a stale copy of a government sentence, and an
   * id the register no longer knows simply loses its citation.
   */
  evidenceDomain: string | null;
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
        days: activity.days,
        // "" would fail the server's HH:MM check; no time is null.
        time_of_day: activity.timeOfDay || null,
        detail: activity.detail || null,
        evidence_domain: activity.evidenceDomain || null,
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
