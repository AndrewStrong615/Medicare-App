/**
 * End-to-end check that a browser refresh does not sign the user out.
 *
 * Not part of `npm test`. This is the one thing jsdom cannot tell you: a
 * reload there is a fresh module registry either way, so a fake store and a
 * real one look identical. Only an actual page load proves that the token
 * written before the refresh is the token found after it.
 *
 * It also pins the two properties that make the choice of store defensible —
 * the token is in `sessionStorage` and never in `localStorage`, so it dies
 * with the tab — and the one that keeps a stale session from being worse than
 * no session: an expired token opens the sign-in screen rather than a home
 * screen that fails on the first tap.
 *
 * Usage:
 *
 *     cd mobile
 *     npx expo export --platform web
 *     node e2e/web-session-persistence.mjs
 *
 * **No backend is needed.** `/auth/login` is answered by the test with a token
 * shaped like the real one, and nothing else here talks to the API because the
 * home screen makes no requests. That is deliberate: this run is about the
 * client's session handling, and a backend would only add ways for it to fail
 * for reasons that are not the thing under test.
 */

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 8091);
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const STORAGE_KEY = "medhelp.session.token";

const results = [];
function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
}

/**
 * A token shaped like the backend's: three dot-separated parts with a real
 * base64url payload. The client never verifies a signature — it cannot — but
 * it does read `exp`, which is the whole point of the expiry case below.
 */
function fakeToken(expiresInSeconds) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "00000000-0000-0000-0000-00000000fake",
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    })
  ).toString("base64url");
  return `fake-header.${payload}.fake-signature`;
}

async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/** Answer the sign-in call, so this run needs nothing but the static build. */
async function stubLogin(context, token) {
  await context.route("**/auth/login", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: token, token_type: "bearer" }),
    })
  );
}

const onHomeScreen = (page) => page.getByText("MedHelp provides general information only");
const onSignInScreen = (page) => page.getByRole("button", { name: "Log in" });

async function reached(locator) {
  return locator
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

async function signIn(page) {
  await page.goto(APP_ORIGIN, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("e2e.synthetic@example.com");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await onHomeScreen(page).waitFor({ timeout: 20_000 });
}

function stop(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    // `shell: true` puts a cmd.exe in between; killing that alone orphans the
    // server, which then serves a stale build to the next run.
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

/** Refuse to run against something we did not start. */
async function portIsFree(port) {
  try {
    await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

async function run() {
  if (!(await portIsFree(APP_PORT))) {
    throw new Error(
      `Something is already serving http://localhost:${APP_PORT}. ` +
        `Refusing to run, because the results would describe that server and ` +
        `not the build in ./dist. Stop it, or set E2E_APP_PORT.`
    );
  }

  const app = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["serve", "dist", "-l", String(APP_PORT), "--single"],
    { stdio: "ignore", shell: process.platform === "win32" }
  );

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  try {
    if (!(await waitForServer(APP_ORIGIN))) throw new Error("app server never came up");

    // ------------------------------------------------- a refresh mid-session
    {
      const context = await browser.newContext();
      const token = fakeToken(3600);
      await stubLogin(context, token);
      const page = await context.newPage();

      await signIn(page);
      check("signs in and lands on the home screen", true);

      const stored = await page.evaluate(
        (key) => ({
          session: window.sessionStorage.getItem(key),
          local: window.localStorage.getItem(key),
        }),
        STORAGE_KEY
      );
      check(
        "the token is kept in sessionStorage",
        stored.session === token,
        stored.session ? "" : "nothing was stored"
      );
      check(
        "the token is never written to localStorage",
        stored.local === null,
        stored.local === null ? "" : `localStorage held ${JSON.stringify(stored.local)}`
      );

      // The bug: this used to come back on the sign-in screen.
      await page.reload({ waitUntil: "domcontentloaded" });
      check("a refresh leaves the user signed in", await reached(onHomeScreen(page)));

      // And again, because a session that survived exactly one reload would
      // pass the check above while still being broken.
      await page.reload({ waitUntil: "domcontentloaded" });
      check("and so does a second one", await reached(onHomeScreen(page)));

      await context.close();
    }

    // ------------------------------------------------------------ signing out
    {
      const context = await browser.newContext();
      await stubLogin(context, fakeToken(3600));
      const page = await context.newPage();

      await signIn(page);
      await page.getByRole("button", { name: "Sign out" }).click();

      check("signing out returns to the sign-in screen", await reached(onSignInScreen(page)));

      const left = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY);
      check(
        "signing out empties the store",
        left === null,
        left === null ? "" : `store held ${JSON.stringify(left)}`
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      check(
        "a refresh after signing out does not bring the session back",
        await reached(onSignInScreen(page))
      );

      await context.close();
    }

    // ------------------------------------------------------- an expired token
    {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Seed the store the way a tab left open for an hour would.
      await page.goto(APP_ORIGIN, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([key, token]) => window.sessionStorage.setItem(key, token),
        [STORAGE_KEY, fakeToken(-60)]
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      check(
        "an expired token opens the sign-in screen, not the home screen",
        await reached(onSignInScreen(page))
      );

      const left = await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY);
      check("the expired token is thrown away", left === null);

      await context.close();
    }

    // ----------------------------------------------------- a new tab session
    {
      // A fresh context is a fresh sessionStorage, which is what a new tab or
      // a reopened browser gets. Nothing should be restored there.
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(APP_ORIGIN, { waitUntil: "domcontentloaded" });

      check(
        "a browser with no stored session still starts at sign-in",
        await reached(onSignInScreen(page))
      );

      await context.close();
    }
  } finally {
    await browser.close();
    stop(app);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
