/**
 * Where the session token is kept between page loads, in a browser.
 *
 * Metro picks this over `tokenStorage.ts` for web builds. Both expose the
 * same three functions, so `authService` needs no platform knowledge.
 *
 * ## Why `sessionStorage` and not `localStorage`
 *
 * The problem being solved is a refresh signing the user out, and
 * `sessionStorage` survives a refresh. What it does not survive is the tab
 * being closed, which is the property worth having: this is a bearer
 * credential for one person's health records, the app has no token
 * revocation, and the token is only valid for an hour anyway. Writing it to
 * `localStorage` would leave it on disk long after the person walked away
 * from a shared or borrowed computer, and would buy them almost nothing —
 * an hour-old token is refused by the server regardless of where it was kept.
 *
 * Neither store is isolated from JavaScript running on this origin, so
 * neither is a defence against a script injected into the page. The defence
 * against that is the CSP and not shipping one.
 *
 * ## Why every call is wrapped
 *
 * Storage access *throws* rather than returning empty in several ordinary
 * situations: Safari's private browsing, a browser configured to block site
 * data, and any embedding where the page is treated as third party. A signed
 * -in user in that browser should get a working session that ends on refresh,
 * not a crash on the way out of the login screen.
 */

const STORAGE_KEY = "medhelp.session.token";

function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  try {
    store()?.setItem(STORAGE_KEY, token);
  } catch {
    // Quota, or a browser refusing site data. The in-memory token still works
    // until the page is reloaded.
  }
}

export async function loadToken(): Promise<string | null> {
  try {
    return store()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    store()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing better to do; the caller has already forgotten the token.
  }
}
