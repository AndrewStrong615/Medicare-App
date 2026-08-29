/**
 * Symptom intake: send a description, get an urgency estimate.
 *
 * The tier and all safety copy come from the server. This module refuses to
 * render a result that is missing its disclaimer or escalation guidance.
 */

import { getToken } from "@/services/authService";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Tier = "EMERGENT" | "URGENT" | "SELF_CARE";

export interface EmergencyGuidance {
  category: string;
  headline: string;
  action: string;
  matchedTerms: string[];
}

export interface RelatedTopic {
  topicId: string;
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  groups: string[];
}

export interface FollowUpQuestion {
  questionId: string;
  prompt: string;
  kind: "text" | "choice";
  choices: string[];
  helper: string;
}

/**
 * Returned instead of an assessment when the description was not understood.
 *
 * Carries no tier on purpose. A provisional urgency shown next to "tell me
 * more" is a number the app has just said it cannot stand behind, and users
 * would act on it anyway. A red-flag description never comes back this way —
 * emergencies skip the questions entirely.
 */
export interface FollowUpRequest {
  status: "needs_detail";
  intro: string;
  questions: FollowUpQuestion[];
  disclaimer: string;
  escalationGuidance: string;
}

export interface IntakeAssessment {
  status: "assessed";
  id: string | null;
  tier: Tier;
  reasoning: string;
  redFlagMatch: boolean;
  escalatedBySafetyNet: boolean;
  emergency: EmergencyGuidance | null;
  relatedTopics: RelatedTopic[];
  topicsSourceNote: string | null;
  /**
   * The reading-material feature is switched off entirely, rather than
   * switched on and having matched nothing. The screen must not say "we
   * couldn't find anything" when nothing was ever looked up.
   */
  topicsDisabled: boolean;
  disclaimer: string;
  escalationGuidance: string;
}

export class IntakeError extends Error {
  readonly isNetworkError: boolean;
  readonly isAuthError: boolean;

  constructor(
    message: string,
    options?: { isNetworkError?: boolean; isAuthError?: boolean }
  ) {
    super(message);
    this.name = "IntakeError";
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isAuthError = options?.isAuthError ?? false;
  }
}

const OFFLINE_MESSAGE =
  "Can't reach the MedHelp server, so we couldn't assess this. If you feel unwell, contact a healthcare professional — and call 911 or your local emergency number if this may be an emergency.";

function assertSecureBaseUrl(): void {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDev && !API_BASE_URL.startsWith("https://")) {
    throw new IntakeError(
      "MedHelp is not configured securely and can't send your description. Please update the app."
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

export async function submitIntake(
  description: string,
  consentToStore: boolean,
  followUpAnswers?: Record<string, string>
): Promise<IntakeAssessment | FollowUpRequest> {
  assertSecureBaseUrl();

  const token = getToken();
  if (!token) {
    throw new IntakeError("Please sign in again to use symptom intake.", {
      isAuthError: true,
    });
  }

  let response: Response;
  try {
    // POST body, never a URL: this description is the most sensitive text in
    // the app and URLs are logged by proxies and crash reporters.
    response = await fetch(`${API_BASE_URL}/intake/assess`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        description,
        consent_to_store: consentToStore,
        ...(followUpAnswers ? { follow_up_answers: followUpAnswers } : {}),
      }),
    });
  } catch {
    throw new IntakeError(OFFLINE_MESSAGE, { isNetworkError: true });
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Status decides the outcome below.
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new IntakeError("Your session has expired. Please sign in again.", {
        isAuthError: true,
      });
    }
    throw new IntakeError(
      readDetail(body) ??
        "We couldn't assess this right now. Please don't wait on the app: contact a healthcare professional, and call 911 or your local emergency number if this may be an emergency."
    );
  }

  const data = body as Record<string, any>;

  // The server asks for more detail instead of guessing. Handled before the
  // assessment checks below, because this shape has no tier to validate.
  if (data?.status === "needs_detail") {
    if (!data?.disclaimer || !data?.escalation_guidance || !Array.isArray(data?.questions)) {
      throw new IntakeError(
        "We couldn't load this safely. Please try again, and seek care directly if you are worried."
      );
    }
    return {
      status: "needs_detail",
      intro: data.intro ?? "",
      questions: data.questions.map((q: any) => ({
        questionId: q.question_id,
        prompt: q.prompt,
        kind: q.kind === "choice" ? "choice" : "text",
        choices: q.choices ?? [],
        helper: q.helper ?? "",
      })),
      disclaimer: data.disclaimer,
      escalationGuidance: data.escalation_guidance,
    };
  }

  // Safety copy is not optional. A result rendered without its disclaimer or
  // escalation path would breach the rules this feature is built around, so
  // an incomplete payload is treated as a failure.
  if (!data?.disclaimer || !data?.escalation_guidance || !data?.tier) {
    throw new IntakeError(
      "We couldn't load this result safely. Please try again, and seek care directly if you are worried."
    );
  }

  return {
    status: "assessed",
    id: data.id ?? null,
    tier: data.tier as Tier,
    reasoning: data.reasoning ?? "",
    redFlagMatch: Boolean(data.red_flag_match),
    escalatedBySafetyNet: Boolean(data.escalated_by_safety_net),
    emergency: data.emergency
      ? {
          category: data.emergency.category,
          headline: data.emergency.headline,
          action: data.emergency.action,
          matchedTerms: data.emergency.matched_terms ?? [],
        }
      : null,
    relatedTopics: (data.related_topics ?? []).map((item: any) => ({
      topicId: item.topic_id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      sourceName: item.source_name,
      groups: item.groups ?? [],
    })),
    topicsSourceNote: data.topics_source_note ?? null,
    topicsDisabled: Boolean(data.topics_disabled),
    disclaimer: data.disclaimer,
    escalationGuidance: data.escalation_guidance,
  };
}

/** Records that the user felt the tier was wrong. Best-effort. */
export async function reportAssessmentWrong(assessmentId: string): Promise<void> {
  const token = getToken();
  if (!token) return;

  await fetch(`${API_BASE_URL}/intake/${encodeURIComponent(assessmentId)}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reported_wrong: true }),
  });
}
