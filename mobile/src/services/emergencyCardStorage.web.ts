/**
 * Where the emergency card is kept in a browser.
 *
 * Metro picks this over `emergencyCardStorage.ts` for web builds. Both expose
 * the same three functions, so `emergencyCard.ts` needs no platform knowledge.
 *
 * ## ⛔ `localStorage` here, and `sessionStorage` for the token. On purpose.
 *
 * `tokenStorage.web.ts` says not to move the session token to
 * `localStorage`, and that rule is unchanged. This is a different kind of
 * data and the trade runs the other way:
 *
 * - The token is a **bearer credential**. Anyone holding it *is* the user, so
 *   the right lifetime is the shortest one that still survives a refresh, and
 *   an hour-old token is refused by the server anyway.
 * - The card is **data the user typed so it would be there in an emergency**.
 *   A card that vanishes when the tab closes is a card that is not there when
 *   it is needed, which is the entire point of the feature. It also grants
 *   nobody any access to anything.
 *
 * So the exposure is stated rather than avoided: on a **shared or borrowed
 * computer this leaves allergies, conditions and a blood type on disk for
 * the next person**, and no signing out removes it. `clearCard()` is offered
 * on the card screen for exactly that, and the editor says so where someone
 * is about to type into it.
 *
 * Nothing here is a defence against script running on this origin; that is
 * the CSP's job, as it is for the token.
 *
 * ## Why every call is wrapped
 *
 * Storage access *throws* rather than returning empty in ordinary situations:
 * Safari private browsing, a browser configured to block site data, and any
 * third-party embedding. A user in one of those browsers should get an empty
 * card and an honest message, not a crash.
 */

function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export async function readRaw(key: string): Promise<string | null> {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function writeRaw(key: string, value: string): Promise<void> {
  const target = store();
  if (!target) throw new Error("storage-unavailable");
  try {
    target.setItem(key, value);
  } catch {
    // Quota, or a browser refusing site data. Surfaced to the user rather
    // than swallowed — a card the user believes they saved and did not is
    // worse than one they know failed.
    throw new Error("storage-unavailable");
  }
}

export async function removeRaw(key: string): Promise<void> {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing better to do.
  }
}
