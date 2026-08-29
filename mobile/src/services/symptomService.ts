/**
 * Symptom lookup. All content comes from the backend, which sources it from
 * MedlinePlus (US National Library of Medicine). The app never authors or
 * rewrites medical text.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface EmergencyGuidance {
  category: string;
  headline: string;
  action: string;
  matchedTerms: string[];
}

export interface SymptomTopic {
  topicId: string;
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  groups: string[];
}

export interface SymptomSearchResult {
  query: string;
  emergency: EmergencyGuidance | null;
  results: SymptomTopic[];
  careGuidance: string;
  disclaimer: string;
}

export class SymptomLookupError extends Error {
  readonly isNetworkError: boolean;

  constructor(message: string, options?: { isNetworkError?: boolean }) {
    super(message);
    this.name = "SymptomLookupError";
    this.isNetworkError = options?.isNetworkError ?? false;
  }
}

const OFFLINE_MESSAGE =
  "Can't reach the MedHelp server. Check your internet connection and try again.";

/**
 * Refuses to send health data over plain HTTP outside development.
 *
 * CLAUDE.md requires TLS with no exceptions. `localhost` over HTTP is fine on
 * a dev machine, but a release build pointed at an http:// host would put
 * symptom text on the wire in clear text.
 */
function assertSecureBaseUrl(): void {
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDev && !API_BASE_URL.startsWith("https://")) {
    throw new SymptomLookupError(
      "MedHelp is not configured securely and can't send your search. Please update the app."
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
    if (typeof first?.msg === "string") return first.msg;
  }
  return null;
}

export async function searchSymptoms(query: string): Promise<SymptomSearchResult> {
  assertSecureBaseUrl();

  let response: Response;
  try {
    // POST, not GET: the search term is the user's own health information and
    // must not travel in a URL, which gets logged by proxies and crash
    // reporters. See CLAUDE.md data rules.
    response = await fetch(`${API_BASE_URL}/symptoms/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: query }),
    });
  } catch {
    throw new SymptomLookupError(OFFLINE_MESSAGE, { isNetworkError: true });
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Status code below still decides the outcome.
  }

  if (!response.ok) {
    throw new SymptomLookupError(
      readDetail(body) ??
        "We couldn't search health information just now. Please try again in a moment."
    );
  }

  const data = body as {
    query?: string;
    emergency?: {
      category: string;
      headline: string;
      action: string;
      matched_terms?: string[];
    } | null;
    results?: {
      topic_id: string;
      title: string;
      summary: string;
      url: string;
      source_name: string;
      groups?: string[];
    }[];
    care_guidance?: string;
    disclaimer?: string;
  };

  // The disclaimer and care guidance are safety-critical. If the server sent a
  // response without them, treat it as unusable rather than rendering medical
  // content with no disclaimer attached.
  if (!data?.disclaimer || !data?.care_guidance) {
    throw new SymptomLookupError(
      "We couldn't load health information safely just now. Please try again in a moment."
    );
  }

  return {
    query: data.query ?? query,
    emergency: data.emergency
      ? {
          category: data.emergency.category,
          headline: data.emergency.headline,
          action: data.emergency.action,
          matchedTerms: data.emergency.matched_terms ?? [],
        }
      : null,
    results: (data.results ?? []).map((item) => ({
      topicId: item.topic_id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      sourceName: item.source_name,
      groups: item.groups ?? [],
    })),
    careGuidance: data.care_guidance,
    disclaimer: data.disclaimer,
  };
}
